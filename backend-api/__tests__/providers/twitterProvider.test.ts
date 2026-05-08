// @ts-nocheck
const { twitterProvider } = require("../../integrations/providers/twitter");

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

describe("twitterProvider.test", () => {
  it("returns connected username on 2xx", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { username: "solomon" } }),
    });
    const result = await twitterProvider.test(
      { row: { provider: "twitter" }, token: "abc", config: {} },
      makeDeps(fetchImpl),
    );
    expect(result).toEqual({ success: true, message: "Connected as @solomon" });
  });

  it("returns the OAuth scope hint on 403", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          title: "Forbidden",
          detail: "Your credentials do not allow access to this resource",
        }),
    });
    const result = await twitterProvider.test(
      { row: { provider: "twitter" }, token: "bad", config: {} },
      makeDeps(fetchImpl),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Twitter/X API returned 403");
    expect(result.error).toContain("Your credentials do not allow access to this resource");
    expect(result.error).toContain("OAuth 2.0 user access token");
    expect(result.error).toContain("tweet.write");
  });
});

describe("twitterProvider.mapToEnv", () => {
  it("maps TWITTER_ACCESS_TOKEN as primary plus optional config envs", () => {
    const env = twitterProvider.mapToEnv({
      row: { provider: "twitter" },
      token: null,
      config: {
        api_key: "k",
        api_secret: "s",
        default_username: "openai",
        irrelevant: "x",
      },
    });
    expect(env).toEqual({
      primary: "TWITTER_ACCESS_TOKEN",
      config: {
        api_key: "TWITTER_API_KEY",
        api_secret: "TWITTER_API_SECRET",
        default_username: "TWITTER_DEFAULT_USERNAME",
      },
    });
  });
});

describe("twitterProvider.sanitizeForSync", () => {
  it("strips client_id, client_secret, and refresh_token", () => {
    const sanitized = twitterProvider.sanitizeForSync({
      access_token: "a",
      refresh_token: "r",
      client_id: "c",
      client_secret: "cs",
      default_username: "openai",
    });
    expect(sanitized).toEqual({
      access_token: "a",
      default_username: "openai",
    });
    expect(sanitized).not.toHaveProperty("refresh_token");
    expect(sanitized).not.toHaveProperty("client_secret");
    expect(sanitized).not.toHaveProperty("client_id");
  });
});

describe("twitterProvider.refreshCredentials", () => {
  it("refreshes when expires_at is within the skew window", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "bearer",
        scope: "tweet.read tweet.write",
        expires_in: 7200,
      }),
    });
    const row = {
      id: "int-twitter",
      provider: "twitter",
      access_token: "old",
      config: {
        access_token: "old-access",
        refresh_token: "stored-refresh",
        client_id: "client-1",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const outcome = await twitterProvider.refreshCredentials(row, makeDeps(fetchImpl));

    expect(outcome.refreshed).toBe(true);
    expect(outcome.row.access_token).toBe("new-access");
    expect(outcome.row.config.access_token).toBe("new-access");
    expect(outcome.row.config.refresh_token).toBe("new-refresh");
    expect(outcome.row.config.token_type).toBe("bearer");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.x.com/2/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns refreshed=false when no refresh_token is present", async () => {
    const fetchImpl = jest.fn();
    const row = {
      id: "int-twitter",
      provider: "twitter",
      access_token: "old",
      config: {
        client_id: "client-1",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const outcome = await twitterProvider.refreshCredentials(row, makeDeps(fetchImpl));
    expect(outcome.refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns refreshed=false when the token is still valid", async () => {
    const fetchImpl = jest.fn();
    const row = {
      id: "int-twitter",
      provider: "twitter",
      access_token: "old",
      config: {
        refresh_token: "r",
        client_id: "c",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    };
    const outcome = await twitterProvider.refreshCredentials(row, makeDeps(fetchImpl));
    expect(outcome.refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns refreshed=false when the token endpoint errors", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });
    const row = {
      id: "int-twitter",
      provider: "twitter",
      access_token: "old",
      config: {
        refresh_token: "r",
        client_id: "c",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const outcome = await twitterProvider.refreshCredentials(row, makeDeps(fetchImpl));
      expect(outcome.refreshed).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
