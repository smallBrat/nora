// @ts-nocheck
const fs = require("fs");
const path = require("path");

const NORA_SYNC_INTEGRATIONS_DIR = "/root/.openclaw/workspace/integrations";
const NORA_SYNC_INTEGRATIONS_CATALOG_FILE = `${NORA_SYNC_INTEGRATIONS_DIR}/integrations.json`;
const NORA_SYNC_INTEGRATIONS_FILE = NORA_SYNC_INTEGRATIONS_CATALOG_FILE;
const NORA_SYNC_INTEGRATIONS_CONFIG_FILE = NORA_SYNC_INTEGRATIONS_CATALOG_FILE;
const NORA_SYNC_INTEGRATIONS_LEGACY_FILE = "/opt/openclaw/integrations.json";
const NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_FILE = "/opt/openclaw/integrations.config";
const NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_JSON_FILE = "/opt/openclaw/integrations.config.json";
const NORA_SYNC_INTEGRATIONS_FILES = Object.freeze([
  NORA_SYNC_INTEGRATIONS_DIR,
  NORA_SYNC_INTEGRATIONS_CATALOG_FILE,
  NORA_SYNC_INTEGRATIONS_LEGACY_FILE,
  NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_JSON_FILE,
  NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_FILE,
]);
const NORA_INTEGRATIONS_SKILL_NAME = "nora-integrations";
const NORA_INTEGRATIONS_SKILL_FILE = `skills/${NORA_INTEGRATIONS_SKILL_NAME}/SKILL.md`;
const NORA_INTEGRATION_TOOL_COMMAND = "nora-integration-tool";
const INTEGRATION_MANIFEST_INSPECT_OPERATION = "manifest.inspect";

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_GITHUB_FILE_CONTENT_CHARS = 120000;
const DEFAULT_TWITTER_API_BASE_URL = "https://api.x.com/2";
const SENSITIVE_CONFIG_KEY_RE =
  /(token|secret|password|api[_-]?key|private[_-]?key|service[_-]?account|credentials?)/i;

const SUPPORTED_INTEGRATION_TOOL_OPERATIONS = Object.freeze({
  github: new Set([
    "repos.list",
    "repos.contents.get",
    "pulls.list",
    "issues.create",
  ]),
  twitter: new Set([
    "users.me",
    "users.tweets.list",
    "tweets.create",
  ]),
});

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeIntegrationFilePart(value, fallback = "integration") {
  const candidate = normalizeString(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return candidate || fallback;
}

function normalizeIntegrationToolInput(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input;
  }
  return {};
}

function isSensitiveIntegrationConfigKey(key) {
  return SENSITIVE_CONFIG_KEY_RE.test(String(key || ""));
}

function integrationDetailsFileName(integration = {}, usedNames = new Set()) {
  const provider =
    integrationProviderId(integration) ||
    sanitizeIntegrationFilePart(integration.name || integration.id || "integration");
  const base = sanitizeIntegrationFilePart(provider);
  let fileName = `integrations.${base}.json`;
  let suffix = 2;

  while (usedNames.has(fileName)) {
    fileName = `integrations.${base}-${suffix}.json`;
    suffix += 1;
  }

  usedNames.add(fileName);
  return fileName;
}

function pickIntegrationTimestamp(integration = {}, keys = []) {
  for (const key of keys) {
    const value = integration[key];
    if (value) return value;
  }
  const config = integration.config && typeof integration.config === "object"
    ? integration.config
    : {};
  for (const key of keys) {
    const value = config[key];
    if (value) return value;
  }
  return null;
}

function buildIntegrationCatalogEntry(integration = {}, detailsFile) {
  const provider = integrationProviderId(integration) || "integration";
  const status = normalizeString(integration.status) || "active";
  const enabled = !["disabled", "disconnected", "revoked", "expired"].includes(
    status.toLowerCase(),
  );
  return {
    provider,
    name: normalizeString(integration.name) || provider,
    category: normalizeString(integration.category) || "unknown",
    status,
    enabled,
    activatedAt:
      pickIntegrationTimestamp(integration, [
        "activatedAt",
        "activated_at",
        "connectedAt",
        "connected_at",
        "createdAt",
        "created_at",
      ]) || null,
    expiresAt:
      pickIntegrationTimestamp(integration, [
        "expiresAt",
        "expires_at",
        "tokenExpiresAt",
        "token_expires_at",
      ]) || null,
    detailsFile,
  };
}

function buildSplitIntegrationManifest(integrations = []) {
  const syncedIntegrations = Array.isArray(integrations) ? integrations : [];
  const usedNames = new Set();
  const details = syncedIntegrations.map((integration) => {
    const fileName = integrationDetailsFileName(integration, usedNames);
    return {
      fileName,
      integration,
      catalogEntry: buildIntegrationCatalogEntry(integration, fileName),
    };
  });

  return {
    catalog: {
      version: 1,
      generatedAt: new Date().toISOString(),
      integrations: details.map((entry) => entry.catalogEntry),
    },
    details: details.map(({ fileName, integration }) => ({ fileName, integration })),
  };
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readIntegrationDetailsFromCatalog(raw, catalogPath) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.integrations)) return null;
  const baseDir = path.dirname(catalogPath);
  const loaded = [];
  let sawDetailsFile = false;

  for (const entry of raw.integrations) {
    if (!entry || typeof entry !== "object" || !entry.detailsFile) continue;
    sawDetailsFile = true;
    const detailPath = path.isAbsolute(entry.detailsFile)
      ? entry.detailsFile
      : path.join(baseDir, entry.detailsFile);
    const detail = readJsonFile(detailPath);
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      loaded.push(detail.integration && typeof detail.integration === "object"
        ? detail.integration
        : detail);
    }
  }

  return sawDetailsFile ? loaded : raw.integrations;
}

function readSyncedIntegrationsDirectory(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return null;
  try {
    if (!fs.statSync(dirPath).isDirectory()) return null;
  } catch {
    return null;
  }
  return readSyncedIntegrationsFile(path.join(dirPath, "integrations.json"));
}

function readSyncedIntegrationsFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    if (fs.statSync(filePath).isDirectory()) {
      return readSyncedIntegrationsDirectory(filePath);
    }
  } catch {
    return null;
  }

  const raw = readJsonFile(filePath);
  if (Array.isArray(raw)) return raw;
  return readIntegrationDetailsFromCatalog(raw, filePath);
}

function integrationManifestCandidates(filePath) {
  if (Array.isArray(filePath)) {
    return filePath.map((candidate) => normalizeString(candidate)).filter(Boolean);
  }

  if (!filePath || filePath === NORA_SYNC_INTEGRATIONS_FILE) {
    return [
      normalizeString(process.env.NORA_INTEGRATIONS_DIR),
      normalizeString(process.env.NORA_INTEGRATIONS_CONFIG),
      ...NORA_SYNC_INTEGRATIONS_FILES,
    ].filter(Boolean);
  }

  return [filePath];
}

function loadSyncedIntegrations(filePath = NORA_SYNC_INTEGRATIONS_FILE) {
  for (const candidate of integrationManifestCandidates(filePath)) {
    const integrations = readSyncedIntegrationsFile(candidate);
    if (integrations) return integrations;
  }
  return [];
}

function buildExampleValueFromSchema(schema = {}) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (schema.type) {
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? schema.minimum : 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return `<${normalizeString(schema.description) || "value"}>`;
  }
}

function buildInvocationExample(spec = {}) {
  const schema =
    spec.inputSchema && typeof spec.inputSchema === "object"
      ? spec.inputSchema
      : spec.parameters && typeof spec.parameters === "object"
        ? spec.parameters
        : {};
  const properties =
    schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
  const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set();
  const input = {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (required.has(key)) {
      input[key] = buildExampleValueFromSchema(propertySchema);
    }
  }

  if (Object.keys(input).length > 0) {
    return input;
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    input[key] = buildExampleValueFromSchema(propertySchema);
    break;
  }

  return input;
}

function normalizeToolName(rawName, fallback) {
  const candidate = normalizeString(rawName || fallback || "tool")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return candidate || "tool";
}

function integrationProviderId(integration = {}) {
  return normalizeString(
    integration.provider || integration.catalog_id || integration.id
  ).toLowerCase();
}

function buildIntegrationManifestToolSpec(integration = {}) {
  const provider = integrationProviderId(integration) || "integration";
  const providerName = normalizeString(integration.name) || provider;
  const toolName = normalizeToolName(`nora_${provider}_integration`, "nora_integration");

  return {
    name: toolName,
    description: `Inspect the connected ${providerName} integration manifest, credential env vars, synced defaults, API metadata, and available runtime tools.`,
    operation: INTEGRATION_MANIFEST_INSPECT_OPERATION,
    inputSchema: {
      type: "object",
      properties: {},
    },
    noraGenerated: true,
  };
}

function getIntegrationToolSpecs(integration = {}) {
  const declaredToolSpecs = Array.isArray(integration.toolSpecs)
    ? integration.toolSpecs.filter(Boolean)
    : [];
  const manifestTool = buildIntegrationManifestToolSpec(integration);
  const hasManifestTool = declaredToolSpecs.some(
    (spec) => normalizeString(spec?.name) === manifestTool.name
  );
  return hasManifestTool ? declaredToolSpecs : [manifestTool, ...declaredToolSpecs];
}

function isIntegrationToolExecutable(integration = {}, spec = {}) {
  const provider = integrationProviderId(integration);
  const operation = normalizeString(spec.operation);
  if (operation === INTEGRATION_MANIFEST_INSPECT_OPERATION) return true;
  const supported = SUPPORTED_INTEGRATION_TOOL_OPERATIONS[provider];
  return Boolean(supported && operation && supported.has(operation));
}

function buildIntegrationToolExecutionMetadata(integration = {}, spec = {}) {
  const runtimeToolName = normalizeString(spec.name) || "tool";
  const executable = isIntegrationToolExecutable(integration, spec);
  const exampleInput = buildInvocationExample(spec);

  return {
    executable,
    executionState: executable ? "runtime_skill" : "manifest_only",
    executionSurface: executable ? "exec" : "manifest_only",
    executor: executable ? NORA_INTEGRATION_TOOL_COMMAND : null,
    runtimeToolName,
    exampleInput,
    invokeCommand: executable
      ? `${NORA_INTEGRATION_TOOL_COMMAND} ${runtimeToolName} '${JSON.stringify(exampleInput)}'`
      : null,
  };
}

function getExecutableIntegrationTools(integrations = []) {
  const executableTools = [];

  for (const integration of Array.isArray(integrations) ? integrations : []) {
    const toolSpecs = getIntegrationToolSpecs(integration);

    for (const spec of toolSpecs) {
      const execution = buildIntegrationToolExecutionMetadata(integration, spec);
      if (!execution.executable) continue;
      executableTools.push({ integration, spec, execution });
    }
  }

  return executableTools;
}

function buildIntegrationSkillMarkdown(integrations = [], options = {}) {
  const syncedIntegrations = Array.isArray(integrations) ? integrations : [];
  const executableTools = getExecutableIntegrationTools(integrations);
  const includeFrontmatter = options.frontmatter !== false;
  const lines = [];

  if (includeFrontmatter) {
    lines.push(
      "---",
      "name: nora-integrations",
      "description: Inspect and use Nora-connected integrations for this agent. Use when the operator asks about connected integrations, connected accounts, integration status, integration credentials, provider tools, Twitter/X, GitHub, or posting/reading through a connected provider.",
      "---",
      "",
    );
  }

  lines.push(
    "# Nora Integrations",
    "",
    "Use this skill when the operator asks you to work with a provider that Nora connected to this agent.",
    "The connected credentials belong only to this agent. Do not assume another agent has the same accounts or permissions.",
    "Never print, echo, commit, or otherwise reveal credential values. Use environment variables and synced config only to make provider API calls.",
    "",
    "## Workflow",
    "",
    "1. Check `integrations/NORA_INTEGRATIONS.md` to confirm the provider and tool are connected.",
    `2. On OpenClaw, read \`${NORA_SYNC_INTEGRATIONS_CATALOG_FILE}\` to see the connected integration catalog. On Hermes, read \`/opt/data/workspace/integrations/integrations.json\`. Use \`$NORA_INTEGRATIONS_CONFIG\` only if that file exists. Follow each \`detailsFile\` only when credential/tool details are needed.`,
    "3. Prefer an executable Nora integration tool when one is listed.",
    `4. Run \`${NORA_INTEGRATION_TOOL_COMMAND} --list\` if you need executable tool names.`,
    `5. Execute a supported tool with JSON input: \`${NORA_INTEGRATION_TOOL_COMMAND} <tool_name> '{"key":"value"}'\`.`,
    "6. If no executable tool exists, call the provider API or SDK directly with the credential env vars listed below.",
    "7. Summarize the result for the operator instead of pasting large raw payloads unless they asked for full output.",
    "",
    "## Notes",
    "",
    "- If the requested provider or tool is not listed, say the integration is not connected to this agent.",
    "- Prefer synced defaults like org, repo, channel, workspace, or default username when the operator does not specify a target.",
    "- For large file reads, summarize first and quote only the portion the operator asked for.",
    "- If an API returns 401 or 403, explain that the connected credential may not have the required provider scope instead of retrying blindly.",
    "",
  );

  if (syncedIntegrations.length === 0) {
    lines.push("No active Nora integrations are currently synced to this agent.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Connected Credentials");
  lines.push("");

  for (const integration of syncedIntegrations) {
    const provider = normalizeString(integration.provider || integration.catalog_id || integration.id);
    const providerName = normalizeString(integration.name) || provider || "Integration";
    const capabilities = Array.isArray(integration.capabilities) ? integration.capabilities : [];
    const credentialEnv =
      integration.credentialEnv && typeof integration.credentialEnv === "object"
        ? integration.credentialEnv
        : {};
    const configEnv =
      credentialEnv.config && typeof credentialEnv.config === "object"
        ? credentialEnv.config
        : {};
    const config =
      integration.config && typeof integration.config === "object" ? integration.config : {};
    const redactedConfig =
      integration.redactedConfig && typeof integration.redactedConfig === "object"
        ? integration.redactedConfig
        : {};
    const api = integration.api && typeof integration.api === "object" ? integration.api : null;
    const usageHints = Array.isArray(integration.usageHints) ? integration.usageHints : [];
    const toolSpecs = getIntegrationToolSpecs(integration);
    const executableForIntegration = [];

    for (const spec of toolSpecs) {
      const execution = buildIntegrationToolExecutionMetadata(integration, spec);
      if (execution.executable) executableForIntegration.push({ spec, execution });
    }

    lines.push(`### ${providerName}`);
    lines.push("");
    lines.push(`- Provider id: ${provider || providerName}`);
    if (capabilities.length > 0) lines.push(`- Capabilities: ${capabilities.join(", ")}`);
    if (credentialEnv.primary) {
      lines.push(`- Primary credential env: \`${credentialEnv.primary}\``);
    } else if (api?.authEnv) {
      lines.push(`- Primary credential env: \`${api.authEnv}\``);
    } else {
      lines.push("- Primary credential env: not declared; inspect `integrations/NORA_INTEGRATIONS.md` for synced config fields.");
    }

    const configEnvEntries = Object.entries(configEnv).filter(([, envName]) => normalizeString(envName));
    if (configEnvEntries.length > 0) {
      lines.push("- Config env vars:");
      for (const [key, envName] of configEnvEntries) {
        lines.push(`  - ${key}: \`${envName}\``);
      }
    }

    const nonSecretConfigEntries = Object.entries(config).filter(([, value]) => {
      if (value == null || value === "") return false;
      if (typeof value === "string" && value.length > 120) return false;
      return true;
    }).filter(([key]) => {
      if (isSensitiveIntegrationConfigKey(key)) return false;
      if (redactedConfig[key] === "[REDACTED]") return false;
      return true;
    });
    if (nonSecretConfigEntries.length > 0) {
      lines.push("- Synced config defaults:");
      for (const [key, value] of nonSecretConfigEntries) {
        const rendered =
          typeof value === "string" ? value : JSON.stringify(value);
        lines.push(`  - ${key}: ${rendered}`);
      }
    }

    if (api) {
      const apiSummary = [api.type || "api", api.baseUrl || ""].filter(Boolean).join(" ");
      lines.push(`- API: ${apiSummary || "declared"}`);
      if (api.docsUrl) lines.push(`- API docs: ${api.docsUrl}`);
    }

    if (executableForIntegration.length > 0) {
      lines.push("- Executable tools:");
      for (const { spec, execution } of executableForIntegration) {
        lines.push(
          `  - \`${execution.runtimeToolName}\`: ${normalizeString(spec.description) || "No description provided."}`
        );
        lines.push(`    Example: \`${execution.invokeCommand}\``);
      }
    } else {
      lines.push("- Executable tools: none; use the provider API or SDK with the listed env vars.");
    }

    if (usageHints.length > 0) {
      lines.push("- Usage hints:");
      for (const hint of usageHints) {
        lines.push(`  - ${hint}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function findIntegrationTool(integrations = [], toolName) {
  const normalizedToolName = normalizeString(toolName);
  if (!normalizedToolName) return null;

  for (const integration of Array.isArray(integrations) ? integrations : []) {
    const toolSpecs = getIntegrationToolSpecs(integration);

    for (const spec of toolSpecs) {
      if (normalizeString(spec.name) !== normalizedToolName) continue;
      return {
        integration,
        spec,
        execution: buildIntegrationToolExecutionMetadata(integration, spec),
      };
    }
  }

  return null;
}

function assertRuntimeFetch(fetchImpl) {
  if (typeof fetchImpl === "function") return fetchImpl;
  if (typeof fetch === "function") return fetch;
  throw new Error("Fetch is not available in this runtime");
}

function clampInteger(value, { fallback, min = 1, max = 100 }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeIntegrationConfig(integration = {}) {
  return integration.config && typeof integration.config === "object"
    ? integration.config
    : {};
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function buildSafeIntegrationConfig(integration = {}) {
  const config = normalizeObject(integration.config);
  const redactedConfig = normalizeObject(integration.redactedConfig);
  const keys = new Set([...Object.keys(config), ...Object.keys(redactedConfig)]);
  const safeConfig = {};

  for (const key of keys) {
    if (redactedConfig[key] === "[REDACTED]" || isSensitiveIntegrationConfigKey(key)) {
      safeConfig[key] = "[REDACTED]";
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(redactedConfig, key)) {
      safeConfig[key] = redactedConfig[key];
      continue;
    }
    safeConfig[key] = config[key];
  }

  return safeConfig;
}

function buildSafeIntegrationSummary(integration = {}) {
  const toolSpecs = getIntegrationToolSpecs(integration).map((spec) => {
    const execution = buildIntegrationToolExecutionMetadata(integration, spec);
    return {
      name: normalizeString(spec.name) || execution.runtimeToolName,
      description: normalizeString(spec.description),
      operation: normalizeString(spec.operation) || null,
      executable: execution.executable,
      executionState: execution.executionState,
      executor: execution.executor,
      invokeCommand: execution.invokeCommand,
      inputSchema: spec.inputSchema || spec.parameters || null,
      noraGenerated: spec.noraGenerated === true,
    };
  });

  return {
    id: integration.id || null,
    provider: integration.provider || integration.catalog_id || integration.id || null,
    name: integration.name || integration.provider || null,
    category: integration.category || "unknown",
    authType: integration.authType || null,
    activatedAt: integration.activatedAt || integration.activated_at || null,
    expiresAt: integration.expiresAt || integration.expires_at || null,
    status: integration.status || "active",
    capabilities: Array.isArray(integration.capabilities) ? integration.capabilities : [],
    credentialEnv: normalizeObject(integration.credentialEnv),
    config: buildSafeIntegrationConfig(integration),
    api: normalizeObject(integration.api),
    mcp: integration.mcp || null,
    usageHints: Array.isArray(integration.usageHints) ? integration.usageHints : [],
    tools: toolSpecs,
  };
}

function getGitHubToken(integration = {}) {
  const config = normalizeIntegrationConfig(integration);
  return (
    normalizeString(config.personal_access_token) ||
    normalizeString(config.access_token) ||
    normalizeString(config.token) ||
    normalizeString(process.env.GITHUB_TOKEN)
  );
}

function getGitHubBaseUrl(integration = {}) {
  const configuredBaseUrl =
    normalizeString(integration?.api?.baseUrl) ||
    normalizeString(normalizeIntegrationConfig(integration).base_url) ||
    DEFAULT_GITHUB_API_BASE_URL;
  const url = new URL(configuredBaseUrl);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`Unsupported GitHub API protocol: ${url.protocol}`);
  }

  return url;
}

function getTwitterToken(integration = {}) {
  const config = normalizeIntegrationConfig(integration);
  return (
    normalizeString(config.bearer_token) ||
    normalizeString(config.access_token) ||
    normalizeString(config.token) ||
    normalizeString(process.env.TWITTER_ACCESS_TOKEN) ||
    normalizeString(process.env.TWITTER_BEARER_TOKEN)
  );
}

function getTwitterBaseUrl(integration = {}) {
  const configuredBaseUrl =
    normalizeString(integration?.api?.baseUrl) ||
    normalizeString(normalizeIntegrationConfig(integration).base_url) ||
    DEFAULT_TWITTER_API_BASE_URL;
  const url = new URL(configuredBaseUrl);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`Unsupported Twitter/X API protocol: ${url.protocol}`);
  }

  return url;
}

async function readResponseBody(response) {
  const rawText = await response.text();
  if (!rawText) return { rawText: "", data: null };

  try {
    return { rawText, data: JSON.parse(rawText) };
  } catch {
    return { rawText, data: null };
  }
}

function buildGitHubRequestUrl(integration, requestPath, query = {}) {
  const baseUrl = getGitHubBaseUrl(integration);
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const basePath =
    baseUrl.pathname && baseUrl.pathname !== "/"
      ? baseUrl.pathname.replace(/\/+$/, "")
      : "";
  baseUrl.pathname = `${basePath}${normalizedPath}`;

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    baseUrl.searchParams.set(key, String(value));
  }

  return baseUrl.toString();
}

async function gitHubRequest({
  integration,
  requestPath,
  query,
  method = "GET",
  body = null,
  fetchImpl,
}) {
  const token = getGitHubToken(integration);
  if (!token) {
    throw new Error("GitHub token is not configured for this agent");
  }

  const fetcher = assertRuntimeFetch(fetchImpl);
  const url = buildGitHubRequestUrl(integration, requestPath, query);
  const response = await fetcher(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "Nora-Agent-Runtime",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const { rawText, data } = await readResponseBody(response);
  if (!response.ok) {
    const message =
      normalizeString(data?.message) ||
      normalizeString(rawText) ||
      `GitHub API returned ${response.status}`;
    throw new Error(`${message} (${response.status})`);
  }

  return data ?? rawText;
}

function buildTwitterRequestUrl(integration, requestPath, query = {}) {
  const baseUrl = getTwitterBaseUrl(integration);
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const basePath =
    baseUrl.pathname && baseUrl.pathname !== "/"
      ? baseUrl.pathname.replace(/\/+$/, "")
      : "";
  baseUrl.pathname = `${basePath}${normalizedPath}`;

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      const joined = value.map((entry) => normalizeString(entry)).filter(Boolean).join(",");
      if (joined) baseUrl.searchParams.set(key, joined);
      continue;
    }
    baseUrl.searchParams.set(key, String(value));
  }

  return baseUrl.toString();
}

async function twitterRequest({
  integration,
  requestPath,
  query,
  method = "GET",
  body = null,
  fetchImpl,
}) {
  const token = getTwitterToken(integration);
  if (!token) {
    throw new Error("Twitter/X user access token is not configured for this agent");
  }

  const fetcher = assertRuntimeFetch(fetchImpl);
  const url = buildTwitterRequestUrl(integration, requestPath, query);
  const response = await fetcher(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Nora-Agent-Runtime",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const { rawText, data } = await readResponseBody(response);
  if (!response.ok) {
    const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
    const message =
      normalizeString(firstError?.detail) ||
      normalizeString(firstError?.message) ||
      normalizeString(data?.detail) ||
      normalizeString(data?.title) ||
      normalizeString(rawText) ||
      `Twitter/X API returned ${response.status}`;
    throw new Error(`${message} (${response.status})`);
  }

  return data ?? rawText;
}

function mapGitHubRepository(repo = {}) {
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private === true,
    description: repo.description || "",
    default_branch: repo.default_branch || null,
    html_url: repo.html_url || null,
    language: repo.language || null,
    archived: repo.archived === true,
    fork: repo.fork === true,
    updated_at: repo.updated_at || null,
  };
}

function mapGitHubPullRequest(pr = {}) {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft === true,
    html_url: pr.html_url || null,
    author: pr.user?.login || null,
    created_at: pr.created_at || null,
    updated_at: pr.updated_at || null,
    head: pr.head?.ref || null,
    base: pr.base?.ref || null,
  };
}

function mapGitHubIssue(issue = {}) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    html_url: issue.html_url || null,
    created_at: issue.created_at || null,
    updated_at: issue.updated_at || null,
  };
}

function mapTwitterUser(user = {}) {
  return {
    id: user.id,
    username: user.username || null,
    name: user.name || null,
    description: user.description || "",
    verified: user.verified === true,
    profile_image_url: user.profile_image_url || null,
    public_metrics: user.public_metrics || null,
  };
}

function mapTwitterTweet(tweet = {}) {
  return {
    id: tweet.id,
    text: tweet.text || "",
    author_id: tweet.author_id || null,
    conversation_id: tweet.conversation_id || null,
    created_at: tweet.created_at || null,
    edit_history_tweet_ids: Array.isArray(tweet.edit_history_tweet_ids)
      ? tweet.edit_history_tweet_ids
      : [],
    public_metrics: tweet.public_metrics || null,
  };
}

async function resolveGitHubOwnerType(integration, owner, fetchImpl) {
  const data = await gitHubRequest({
    integration,
    requestPath: `/users/${encodeURIComponent(owner)}`,
    fetchImpl,
  });
  return data?.type === "Organization" ? "Organization" : "User";
}

async function resolveGitHubOwner(integration, input, fetchImpl) {
  const config = normalizeIntegrationConfig(integration);
  const explicitOwner = normalizeString(input.owner);
  if (explicitOwner) return explicitOwner;

  const configuredOrg = normalizeString(config.org);
  if (configuredOrg) return configuredOrg;

  const viewer = await gitHubRequest({
    integration,
    requestPath: "/user",
    fetchImpl,
  });
  if (!normalizeString(viewer?.login)) {
    throw new Error("Could not resolve a default GitHub owner");
  }
  return viewer.login;
}

function resolveGitHubRepo(integration, input) {
  const config = normalizeIntegrationConfig(integration);
  const repo = normalizeString(input.repo) || normalizeString(config.repo);
  if (!repo) {
    throw new Error("GitHub repository is required");
  }
  return repo;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const normalized = normalizeString(value);
  if (!normalized) return [];
  return normalized.split(",").map((entry) => normalizeString(entry)).filter(Boolean);
}

function normalizeTwitterUsername(value) {
  return normalizeString(value).replace(/^@+/, "");
}

function twitterUserFields(inputFields) {
  const fields = normalizeStringList(inputFields);
  if (fields.length > 0) return fields;
  return ["description", "profile_image_url", "public_metrics", "verified"];
}

function twitterTweetFields(inputFields) {
  const fields = normalizeStringList(inputFields);
  if (fields.length > 0) return fields;
  return ["author_id", "conversation_id", "created_at", "public_metrics"];
}

async function resolveTwitterUser(integration, input, fetchImpl) {
  const config = normalizeIntegrationConfig(integration);
  const explicitUserId = normalizeString(input.user_id);
  if (explicitUserId) {
    return {
      id: explicitUserId,
      username: normalizeTwitterUsername(input.username) || null,
      name: null,
    };
  }

  const username =
    normalizeTwitterUsername(input.username) ||
    normalizeTwitterUsername(config.default_username) ||
    normalizeTwitterUsername(config.username);

  if (username) {
    const data = await twitterRequest({
      integration,
      requestPath: `/users/by/username/${encodeURIComponent(username)}`,
      query: {
        "user.fields": twitterUserFields(input.user_fields),
      },
      fetchImpl,
    });
    return mapTwitterUser(data?.data || {});
  }

  const data = await twitterRequest({
    integration,
    requestPath: "/users/me",
    query: {
      "user.fields": twitterUserFields(input.user_fields),
    },
    fetchImpl,
  });
  return mapTwitterUser(data?.data || {});
}

function filterRepositoriesByVisibility(repositories = [], visibility = "all") {
  if (visibility === "public") {
    return repositories.filter((repo) => repo.private !== true);
  }
  if (visibility === "private") {
    return repositories.filter((repo) => repo.private === true);
  }
  return repositories;
}

function decodeGitHubFileContent(file = {}) {
  const encodedContent = normalizeString(file.content).replace(/\n/g, "");
  if (!encodedContent || file.encoding !== "base64") {
    return {
      content: normalizeString(file.content),
      truncated: false,
    };
  }

  const decoded = Buffer.from(encodedContent, "base64").toString("utf8");
  if (decoded.length <= MAX_GITHUB_FILE_CONTENT_CHARS) {
    return {
      content: decoded,
      truncated: false,
    };
  }

  return {
    content: decoded.slice(0, MAX_GITHUB_FILE_CONTENT_CHARS),
    truncated: true,
  };
}

async function executeGitHubOperation({
  integration,
  spec,
  input,
  fetchImpl,
}) {
  const normalizedInput = normalizeIntegrationToolInput(input);
  const operation = normalizeString(spec.operation);

  switch (operation) {
    case "repos.list": {
      const perPage = clampInteger(normalizedInput.per_page, {
        fallback: 20,
        min: 1,
        max: 100,
      });
      const visibility = normalizeString(normalizedInput.visibility) || "all";
      const requestedOwner = normalizeString(normalizedInput.owner);

      if (requestedOwner || normalizeString(normalizeIntegrationConfig(integration).org)) {
        const owner = await resolveGitHubOwner(integration, normalizedInput, fetchImpl);
        const ownerType = await resolveGitHubOwnerType(integration, owner, fetchImpl);
        const repositories = await gitHubRequest({
          integration,
          requestPath:
            ownerType === "Organization"
              ? `/orgs/${encodeURIComponent(owner)}/repos`
              : `/users/${encodeURIComponent(owner)}/repos`,
          query: {
            per_page: perPage,
            sort: "updated",
          },
          fetchImpl,
        });

        return {
          owner,
          ownerType,
          repositories: filterRepositoriesByVisibility(
            Array.isArray(repositories) ? repositories : [],
            visibility
          ).map(mapGitHubRepository),
        };
      }

      const repositories = await gitHubRequest({
        integration,
        requestPath: "/user/repos",
        query: {
          per_page: perPage,
          sort: "updated",
          visibility,
          affiliation: "owner,organization_member,collaborator",
        },
        fetchImpl,
      });

      return {
        owner: null,
        ownerType: "AuthenticatedUser",
        repositories: (Array.isArray(repositories) ? repositories : []).map(
          mapGitHubRepository
        ),
      };
    }

    case "repos.contents.get": {
      const owner = await resolveGitHubOwner(integration, normalizedInput, fetchImpl);
      const repo = resolveGitHubRepo(integration, normalizedInput);
      const filePath = normalizeString(normalizedInput.path);
      if (!filePath) {
        throw new Error("GitHub file path is required");
      }

      const encodedPath = filePath
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const data = await gitHubRequest({
        integration,
        requestPath: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
        query: {
          ref: normalizeString(normalizedInput.ref) || undefined,
        },
        fetchImpl,
      });

      if (Array.isArray(data)) {
        return {
          owner,
          repo,
          path: filePath,
          type: "directory",
          entries: data.map((entry) => ({
            name: entry.name,
            path: entry.path,
            type: entry.type,
            size: entry.size,
            html_url: entry.html_url || null,
          })),
        };
      }

      const decoded = decodeGitHubFileContent(data);
      return {
        owner,
        repo,
        path: data.path || filePath,
        type: data.type || "file",
        sha: data.sha || null,
        size: data.size || 0,
        encoding: data.encoding || null,
        download_url: data.download_url || null,
        html_url: data.html_url || null,
        content: decoded.content,
        truncated: decoded.truncated,
      };
    }

    case "pulls.list": {
      const owner = await resolveGitHubOwner(integration, normalizedInput, fetchImpl);
      const repo = resolveGitHubRepo(integration, normalizedInput);
      const state = normalizeString(normalizedInput.state) || "open";
      const pulls = await gitHubRequest({
        integration,
        requestPath: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        query: { state },
        fetchImpl,
      });

      return {
        owner,
        repo,
        state,
        pullRequests: (Array.isArray(pulls) ? pulls : []).map(mapGitHubPullRequest),
      };
    }

    case "issues.create": {
      const owner = await resolveGitHubOwner(integration, normalizedInput, fetchImpl);
      const repo = resolveGitHubRepo(integration, normalizedInput);
      const title = normalizeString(normalizedInput.title);
      if (!title) {
        throw new Error("GitHub issue title is required");
      }

      const issue = await gitHubRequest({
        integration,
        requestPath: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
        method: "POST",
        body: {
          title,
          body: normalizeString(normalizedInput.body) || undefined,
        },
        fetchImpl,
      });

      return {
        owner,
        repo,
        issue: mapGitHubIssue(issue),
      };
    }

    default:
      throw new Error(`Unsupported GitHub integration operation: ${operation}`);
  }
}

async function executeTwitterOperation({
  integration,
  spec,
  input,
  fetchImpl,
}) {
  const normalizedInput = normalizeIntegrationToolInput(input);
  const operation = normalizeString(spec.operation);

  switch (operation) {
    case "users.me": {
      const data = await twitterRequest({
        integration,
        requestPath: "/users/me",
        query: {
          "user.fields": twitterUserFields(normalizedInput.user_fields),
        },
        fetchImpl,
      });
      return { user: mapTwitterUser(data?.data || {}) };
    }

    case "users.tweets.list": {
      const user = await resolveTwitterUser(integration, normalizedInput, fetchImpl);
      if (!normalizeString(user.id)) {
        throw new Error("Twitter/X user id could not be resolved");
      }

      const maxResults = clampInteger(normalizedInput.max_results, {
        fallback: 10,
        min: 5,
        max: 100,
      });
      const data = await twitterRequest({
        integration,
        requestPath: `/users/${encodeURIComponent(user.id)}/tweets`,
        query: {
          max_results: maxResults,
          pagination_token: normalizeString(normalizedInput.pagination_token) || undefined,
          exclude: normalizeStringList(normalizedInput.exclude),
          "tweet.fields": twitterTweetFields(normalizedInput.tweet_fields),
        },
        fetchImpl,
      });

      return {
        user,
        tweets: (Array.isArray(data?.data) ? data.data : []).map(mapTwitterTweet),
        meta: data?.meta || {},
      };
    }

    case "tweets.create": {
      const text = normalizeString(normalizedInput.text);
      if (!text) {
        throw new Error("Tweet text is required");
      }

      const body = { text };
      const replyToTweetId = normalizeString(normalizedInput.reply_to_tweet_id);
      const quoteTweetId = normalizeString(normalizedInput.quote_tweet_id);
      if (replyToTweetId) {
        body.reply = { in_reply_to_tweet_id: replyToTweetId };
      }
      if (quoteTweetId) {
        body.quote_tweet_id = quoteTweetId;
      }

      const data = await twitterRequest({
        integration,
        requestPath: "/tweets",
        method: "POST",
        body,
        fetchImpl,
      });

      return {
        tweet: mapTwitterTweet(data?.data || {}),
      };
    }

    default:
      throw new Error(`Unsupported Twitter/X integration operation: ${operation}`);
  }
}

async function executeIntegrationToolInvocation({
  toolName,
  input = {},
  integrations = null,
  fetchImpl,
}) {
  const syncedIntegrations = Array.isArray(integrations)
    ? integrations
    : loadSyncedIntegrations();
  const match = findIntegrationTool(syncedIntegrations, toolName);

  if (!match) {
    throw new Error(`Nora integration tool "${toolName}" is not synced to this agent`);
  }

  if (!match.execution.executable) {
    throw new Error(
      `Nora integration tool "${toolName}" is connected but not executable in this runtime`
    );
  }

  let result;
  if (normalizeString(match.spec.operation) === INTEGRATION_MANIFEST_INSPECT_OPERATION) {
    result = {
      integration: buildSafeIntegrationSummary(match.integration),
    };
  } else {
    switch (normalizeString(match.integration.provider).toLowerCase()) {
      case "github":
        result = await executeGitHubOperation({
          integration: match.integration,
          spec: match.spec,
          input,
          fetchImpl,
        });
        break;
      case "twitter":
        result = await executeTwitterOperation({
          integration: match.integration,
          spec: match.spec,
          input,
          fetchImpl,
        });
        break;
      default:
        throw new Error(
          `Nora integration provider "${match.integration.provider}" is not executable in this runtime`
        );
    }
  }

  return {
    ok: true,
    toolName: match.spec.name,
    provider: match.integration.provider,
    providerName: match.integration.name || match.integration.provider,
    operation: match.spec.operation || null,
    input: normalizeIntegrationToolInput(input),
    result,
    executedAt: new Date().toISOString(),
  };
}

module.exports = {
  NORA_INTEGRATION_TOOL_COMMAND,
  NORA_INTEGRATIONS_SKILL_FILE,
  NORA_INTEGRATIONS_SKILL_NAME,
  NORA_SYNC_INTEGRATIONS_CATALOG_FILE,
  NORA_SYNC_INTEGRATIONS_CONFIG_FILE,
  NORA_SYNC_INTEGRATIONS_DIR,
  NORA_SYNC_INTEGRATIONS_FILE,
  NORA_SYNC_INTEGRATIONS_FILES,
  NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_FILE,
  NORA_SYNC_INTEGRATIONS_LEGACY_CONFIG_JSON_FILE,
  NORA_SYNC_INTEGRATIONS_LEGACY_FILE,
  buildSplitIntegrationManifest,
  buildSafeIntegrationSummary,
  buildIntegrationSkillMarkdown,
  buildIntegrationToolExecutionMetadata,
  executeIntegrationToolInvocation,
  getExecutableIntegrationTools,
  getIntegrationToolSpecs,
  isIntegrationToolExecutable,
  loadSyncedIntegrations,
  normalizeIntegrationToolInput,
};
