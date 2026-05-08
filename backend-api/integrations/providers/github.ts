// GitHub provider — first concrete implementation of the Provider
// strategy. Replaces the entry that previously lived in
// providers/legacy/connectivityTests.ts.

import type {
  ConnectivityResult,
  DecryptedIntegration,
  EnvMapping,
  Provider,
  ProviderDeps,
} from "../types/provider";

export const githubProvider: Provider = {
  id: "github",
  authType: "api_key",

  async test(ctx: DecryptedIntegration, deps: ProviderDeps): Promise<ConnectivityResult> {
    try {
      const res = await deps.fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          "User-Agent": "Nora-Platform",
        },
      });
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
      const data: any = await res.json();
      return { success: true, message: `Connected as ${data.login}` };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  },

  mapToEnv(ctx: DecryptedIntegration): EnvMapping {
    const config = ctx.config || {};
    const configEnv: Record<string, string> = {};
    if (config.org) configEnv.org = "GITHUB_ORG";
    return { primary: "GITHUB_TOKEN", config: configEnv };
  },
};
