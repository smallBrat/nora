// LegacyProviderAdapter — wraps the original 52-provider connectivity
// switch and the global INTEGRATION_*_ENV_MAP lookups so providers that
// have not yet been migrated to a dedicated strategy still resolve
// through the registry.
//
// Once a provider gets a real implementation in providers/<name>.ts and
// is registered with the registry, the registry returns that
// implementation instead of this adapter; PR 6 then trims the
// corresponding entry from connectivityTests + the env maps.

const {
  buildConnectivityTests,
} = require("./legacy/connectivityTests");

import type {
  ConnectivityResult,
  DecryptedIntegration,
  EnvMapping,
  Provider,
  ProviderAuthType,
  ProviderDeps,
} from "../types/provider";

export interface LegacyEnvMaps {
  envMap: Record<string, string>;
  configEnvMap: Record<string, string>;
}

export function createLegacyProviderAdapter(
  providerId: string,
  envMaps: LegacyEnvMaps,
): Provider {
  const authType: ProviderAuthType = "custom";

  return {
    id: providerId,
    authType,

    async test(
      ctx: DecryptedIntegration,
      deps: ProviderDeps,
    ): Promise<ConnectivityResult> {
      const integration = { ...ctx.row, config: ctx.config };
      const tests = buildConnectivityTests(integration, ctx.token, {
        assertSafeUrl: deps.assertSafeUrl,
      });
      const tester = tests[providerId];
      if (!tester) {
        return {
          success: true,
          message: "Credentials stored (connectivity not verified for this provider)",
        };
      }
      try {
        return await tester();
      } catch (e: any) {
        return { success: false, error: e?.message ?? String(e) };
      }
    },

    mapToEnv(ctx: DecryptedIntegration): EnvMapping {
      const primary = envMaps.envMap[providerId] ?? null;
      const configEnv: Record<string, string> = {};
      const config = ctx.config || {};
      for (const key of Object.keys(config)) {
        const envName = envMaps.configEnvMap[`${providerId}.${key}`];
        if (envName) configEnv[key] = envName;
      }
      return { primary, config: configEnv };
    },
  };
}
