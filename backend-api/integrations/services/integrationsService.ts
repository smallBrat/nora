// @ts-nocheck
// Orchestration layer for the integrations module. Consumes:
//   - repository (data access)
//   - secretEncryption (catalog-aware secret hygiene)
//   - catalogLoader (catalog data + hydration)
//   - providerRegistry (Provider strategy + legacy fallback)
//   - integrationTools runtime helpers (tool catalog + sync entry)
//
// All exported functions preserve the contract previously exposed by
// backend-api/integrations.ts; the latter is now a thin re-export shim.

const db = require("../../db");
const { encrypt, decrypt, ensureEncryptionConfigured } = require("../../crypto");
const { assertSafeUrlAsync } = require("../../networkSafety");
const {
  createIntegrationsRepository,
} = require("../repository/integrationsRepository");
const catalogLoader = require("../catalog/catalogLoader");
const { createSecretEncryption } = require("../crypto/secretEncryption");
const { buildIntegrationToolCatalogEntries } = require("./toolCatalogBuilder");
const { createProviderRegistry } = require("../providers/base/registry");
const { createLegacyProviderAdapter } = require("../providers/legacy");
const {
  INTEGRATION_ENV_MAP,
  INTEGRATION_CONFIG_ENV_MAP,
  integrationProviderAffectsLlmAuth,
} = require("../providers/legacy/envMaps");

const TWITTER_OAUTH_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const OAUTH_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

const repo = createIntegrationsRepository(db);
const secretCrypto = createSecretEncryption({
  encrypt,
  decrypt,
  getSensitiveConfigKeys: catalogLoader.getSensitiveConfigKeys,
});
const {
  encryptSensitiveConfig,
  decryptSensitiveConfig,
  redactSensitiveConfig,
  stripSensitiveConfig,
} = secretCrypto;

const legacyEnvMaps = {
  envMap: INTEGRATION_ENV_MAP,
  configEnvMap: INTEGRATION_CONFIG_ENV_MAP,
};

const providerRegistry = createProviderRegistry((providerId) =>
  createLegacyProviderAdapter(providerId, legacyEnvMaps),
);

const providerDeps = {
  fetch,
  assertSafeUrl: assertSafeUrlAsync,
  encrypt,
  decrypt,
  ensureEncryptionConfigured,
  db,
};

// ── Catalog passthroughs ─────────────────────────────────

const loadCatalog = catalogLoader.loadCatalog;
const hydrateRow = catalogLoader.hydrateRow;

async function seedCatalog() {
  return catalogLoader.seedCatalog(repo);
}

async function getCatalog(category) {
  return catalogLoader.getCatalog(repo, category);
}

async function getCatalogItem(catalogId) {
  return catalogLoader.getCatalogItem(repo, catalogId);
}

// ── OAuth refresh helpers ────────────────────────────────

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function tokenExpiresAt(tokenData = {}) {
  const expiresIn = Number.parseInt(tokenData.expires_in, 10);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function shouldRefreshOAuthToken(config = {}) {
  const expiresAt = Date.parse(stringValue(config.expires_at || config.expiresAt));
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= Date.now() + OAUTH_TOKEN_REFRESH_SKEW_MS;
}

async function refreshTwitterOAuthRowIfNeeded(row = {}) {
  const provider = row.provider || row.catalog_id;
  if (provider !== "twitter" || !row.id) return row;

  const config = decryptSensitiveConfig(provider, row.config);
  if (!shouldRefreshOAuthToken(config)) return row;

  const refreshToken = stringValue(config.refresh_token);
  const clientId = stringValue(config.client_id);
  if (!refreshToken || !clientId) return row;

  const clientSecret = stringValue(config.client_secret);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  let tokenData = null;
  try {
    const response = await fetch(TWITTER_OAUTH_TOKEN_URL, {
      method: "POST",
      headers,
      body,
    });
    tokenData = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        stringValue(tokenData?.error_description) ||
        stringValue(tokenData?.error) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }
  } catch (error) {
    console.warn(
      `[integrations] Failed to refresh Twitter/X OAuth token for integration ${row.id}: ${error.message}`,
    );
    return row;
  }

  const accessToken = stringValue(tokenData.access_token);
  if (!accessToken) return row;

  ensureEncryptionConfigured("Twitter/X OAuth token refresh");
  const nextConfig = {
    ...config,
    access_token: accessToken,
    refresh_token: stringValue(tokenData.refresh_token) || refreshToken,
    token_type: stringValue(tokenData.token_type) || config.token_type || "bearer",
    scope: stringValue(tokenData.scope) || config.scope || "",
    expires_at: tokenExpiresAt(tokenData) || config.expires_at || null,
  };
  const { secured: securedConfig } = encryptSensitiveConfig(provider, nextConfig);
  const encryptedToken = encrypt(accessToken);

  await repo.updateAccessTokenAndConfig({
    id: row.id,
    encryptedToken,
    encryptedConfigJson: JSON.stringify(securedConfig),
  });

  return {
    ...row,
    access_token: encryptedToken,
    config: securedConfig,
  };
}

// ── Sync-entry / clone helpers ───────────────────────────

function buildCloneableIntegration(row = {}) {
  const { config, removedSensitive } = stripSensitiveConfig(row.provider, row.config);
  const hasPrimarySecret = Boolean(row.access_token);

  return {
    provider: row.provider,
    catalog_id: row.catalog_id || row.provider,
    config,
    status: hasPrimarySecret || removedSensitive ? "needs_reconnect" : row.status || "active",
  };
}

function buildIntegrationSyncEntry(row = {}) {
  const hydrated = hydrateRow(row);
  const provider = row.provider || row.catalog_id || row.id;
  const decryptedConfig = decryptSensitiveConfig(provider, row.config);
  const config =
    provider === "twitter"
      ? Object.fromEntries(
          Object.entries(decryptedConfig).filter(
            ([key]) => !["client_id", "client_secret", "refresh_token"].includes(key),
          ),
        )
      : decryptedConfig;

  const envMapping = providerRegistry
    .resolve(provider)
    .mapToEnv({ row, token: null, config });

  return {
    id: row.id,
    provider,
    name: row.catalog_name || hydrated.name || provider,
    category: row.catalog_category || hydrated.category || "unknown",
    authType: hydrated.authType || null,
    activatedAt: row.created_at || row.createdAt || null,
    expiresAt: config.expires_at || config.expiresAt || null,
    config,
    redactedConfig: redactSensitiveConfig(provider, config),
    status: row.status || "active",
    capabilities: Array.isArray(hydrated.capabilities) ? hydrated.capabilities : [],
    toolSpecs: Array.isArray(hydrated.toolSpecs) ? hydrated.toolSpecs : [],
    mcp: hydrated.mcp || null,
    api: hydrated.api || null,
    usageHints: Array.isArray(hydrated.usageHints) ? hydrated.usageHints : [],
    credentialEnv: envMapping,
  };
}

// ── Agent integrations (CRUD) ────────────────────────────

async function connectIntegration(agentId, provider, token, config = {}) {
  // If no explicit token, try to extract from config (first
  // password+required field).
  if (!token) {
    const catalogItem = await getCatalogItem(provider);
    if (catalogItem) {
      const fields = catalogItem.configFields || [];
      const tokenField = fields.find((f) => f.type === "password" && f.required);
      if (tokenField && config[tokenField.key]) {
        token = config[tokenField.key];
      }
    }
  }

  const { secured: securedConfig, hasSensitiveMaterial } = encryptSensitiveConfig(provider, config);
  if (token || hasSensitiveMaterial) {
    ensureEncryptionConfigured("Integration credential storage");
  }

  const encryptedToken = token ? encrypt(token) : null;
  const inserted = await repo.insertIntegration({
    agentId,
    provider,
    catalogId: provider,
    encryptedToken,
    encryptedConfigJson: JSON.stringify(securedConfig),
  });
  const { access_token, ...safeRow } = inserted || {};
  return {
    ...safeRow,
    config: redactSensitiveConfig(provider, securedConfig),
  };
}

async function replaceIntegration(agentId, provider, token, config = {}) {
  const result = await connectIntegration(agentId, provider, token, config);
  if (result?.id) {
    await repo.deleteSiblingIntegrations({
      agentId,
      provider,
      excludeId: result.id,
    });
  }
  return result;
}

async function listIntegrations(agentId) {
  const rows = await repo.listForAgent(agentId);
  return rows.map((row) => ({
    ...row,
    config: redactSensitiveConfig(row.provider, row.config),
  }));
}

async function removeIntegration(integrationId, agentId) {
  const removed = await repo.deleteIntegration({ integrationId, agentId });
  if (!removed) throw new Error("Integration not found");
  return removed;
}

async function testIntegration(integrationId, agentId) {
  const integration = await repo.findIntegration({ integrationId, agentId });
  if (!integration) throw new Error("Integration not found");

  if (!integration.access_token) {
    return { success: false, error: "No access token configured" };
  }

  const provider = integration.provider;
  const token = decrypt(integration.access_token);
  const decryptedConfig = decryptSensitiveConfig(provider, integration.config);

  const ctx = {
    row: { ...integration, config: decryptedConfig },
    token,
    config: decryptedConfig,
  };

  return providerRegistry.resolve(provider).test(ctx, providerDeps);
}

// ── Sync + env ──────────────────────────────────────────

async function getIntegrationsForSync(agentId) {
  const rows = await repo.listActiveForAgent(agentId);
  const refreshedRows = [];
  for (const row of rows) {
    refreshedRows.push(await refreshTwitterOAuthRowIfNeeded(row));
  }
  return refreshedRows.map(buildIntegrationSyncEntry);
}

async function getIntegrationEnvVars(agentId) {
  const rows = await repo.listActiveEnvSourcesForAgent(agentId);
  const envVars = {};
  for (const rawRow of rows) {
    const row = await refreshTwitterOAuthRowIfNeeded(rawRow);
    const decryptedConfig = decryptSensitiveConfig(row.provider, row.config);
    const envMapping = providerRegistry
      .resolve(row.provider)
      .mapToEnv({ row, token: null, config: decryptedConfig });

    if (envMapping.primary && row.access_token) {
      envVars[envMapping.primary] = decrypt(row.access_token);
    }
    for (const [cfgKey, cfgValue] of Object.entries(decryptedConfig)) {
      if (!cfgValue) continue;
      const cfgEnv = envMapping.config[cfgKey];
      if (cfgEnv) envVars[cfgEnv] = String(cfgValue);
    }
  }
  return envVars;
}

module.exports = {
  // Catalog
  loadCatalog,
  hydrateRow,
  seedCatalog,
  getCatalog,
  getCatalogItem,
  // Crypto
  decryptSensitiveConfig,
  redactSensitiveConfig,
  stripSensitiveConfig,
  encryptSensitiveConfig,
  // OAuth refresh
  refreshTwitterOAuthRowIfNeeded,
  // Sync entries
  buildCloneableIntegration,
  buildIntegrationSyncEntry,
  buildIntegrationToolCatalogEntries,
  // CRUD
  connectIntegration,
  replaceIntegration,
  listIntegrations,
  removeIntegration,
  testIntegration,
  getIntegrationsForSync,
  getIntegrationEnvVars,
  // LLM auth + env maps
  integrationProviderAffectsLlmAuth,
  INTEGRATION_ENV_MAP,
  INTEGRATION_CONFIG_ENV_MAP,
  // Internals exposed for tests
  providerRegistry,
};
