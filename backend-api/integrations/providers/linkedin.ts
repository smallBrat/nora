// LinkedIn provider — OAuth 2.0 user access token validated via the
// userinfo endpoint. Maps the access token to LINKEDIN_ACCESS_TOKEN.

import type {
  ConnectivityResult,
  DecryptedIntegration,
  EnvMapping,
  Provider,
  ProviderDeps,
} from "../types/provider";

export const linkedinProvider: Provider = {
  id: "linkedin",
  authType: "oauth2",

  async test(ctx: DecryptedIntegration, deps: ProviderDeps): Promise<ConnectivityResult> {
    try {
      const res = await deps.fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      if (!res.ok) throw new Error(`LinkedIn API returned ${res.status}`);
      const data: any = await res.json();
      return {
        success: true,
        message: `Connected as ${data.name || data.given_name || "verified"}`,
      };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  },

  mapToEnv(_ctx: DecryptedIntegration): EnvMapping {
    return { primary: "LINKEDIN_ACCESS_TOKEN", config: {} };
  },
};
