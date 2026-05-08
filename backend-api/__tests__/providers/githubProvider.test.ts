// @ts-nocheck
const { githubProvider } = require("../../integrations/providers/github");

function makeDeps(fetchImpl) {
  return {
    fetch: fetchImpl,
    assertSafeUrl: async (u) => u,
    encrypt: (s) => `enc(${s})`,
    decrypt: (s) => `dec(${s})`,
    ensureEncryptionConfigured: jest.fn(),
    db: { query: jest.fn() },
  };
}

describe("githubProvider", () => {
  it("identifies as github / api_key", () => {
    expect(githubProvider.id).toBe("github");
    expect(githubProvider.authType).toBe("api_key");
  });

  it("connects successfully when GitHub returns the user", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ login: "octocat" }),
    });
    const result = await githubProvider.test(
      { row: { provider: "github" }, token: "ghp_x", config: {} },
      makeDeps(fetchImpl),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_x",
          "User-Agent": "Nora-Platform",
        }),
      }),
    );
    expect(result).toEqual({ success: true, message: "Connected as octocat" });
  });

  it("returns success=false on non-2xx", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const result = await githubProvider.test(
      { row: { provider: "github" }, token: "bad", config: {} },
      makeDeps(fetchImpl),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("GitHub API returned 401");
  });

  it("maps GITHUB_TOKEN as primary and includes GITHUB_ORG when configured", () => {
    const env = githubProvider.mapToEnv({
      row: { provider: "github" },
      token: null,
      config: { org: "openai" },
    });
    expect(env).toEqual({
      primary: "GITHUB_TOKEN",
      config: { org: "GITHUB_ORG" },
    });
  });

  it("omits the org config env when org is not provided", () => {
    const env = githubProvider.mapToEnv({
      row: { provider: "github" },
      token: null,
      config: {},
    });
    expect(env.primary).toBe("GITHUB_TOKEN");
    expect(env.config).toEqual({});
  });
});
