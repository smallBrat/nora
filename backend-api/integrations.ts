// @ts-nocheck
// Re-export shim for backwards compatibility with existing
// `require("./integrations")` callers (server.ts, gatewayProxy.ts,
// agentMigrations.ts, agentPayloads.ts, authSync.ts, routes/integrations.ts,
// __tests__). Real implementations live under
// backend-api/integrations/{repository,catalog,crypto,providers,services}.
//
// Keep this file's `module.exports` shape stable until consumers migrate
// to import directly from integrations/services/integrationsService.

const service = require("./integrations/services/integrationsService");

module.exports = {
  buildCloneableIntegration: service.buildCloneableIntegration,
  buildIntegrationSyncEntry: service.buildIntegrationSyncEntry,
  buildIntegrationToolCatalogEntries: service.buildIntegrationToolCatalogEntries,
  seedCatalog: service.seedCatalog,
  getCatalog: service.getCatalog,
  getCatalogItem: service.getCatalogItem,
  connectIntegration: service.connectIntegration,
  replaceIntegration: service.replaceIntegration,
  decryptSensitiveConfig: service.decryptSensitiveConfig,
  listIntegrations: service.listIntegrations,
  removeIntegration: service.removeIntegration,
  testIntegration: service.testIntegration,
  getIntegrationsForSync: service.getIntegrationsForSync,
  getIntegrationEnvVars: service.getIntegrationEnvVars,
  integrationProviderAffectsLlmAuth: service.integrationProviderAffectsLlmAuth,
  INTEGRATION_ENV_MAP: service.INTEGRATION_ENV_MAP,
  INTEGRATION_CONFIG_ENV_MAP: service.INTEGRATION_CONFIG_ENV_MAP,
  stripSensitiveConfig: service.stripSensitiveConfig,
};
