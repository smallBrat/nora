// @ts-nocheck
const { linkedinProvider } = require("../../integrations/providers/linkedin");

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

describe("linkedinProvider.test", () => {
  it("identifies as linkedin / oauth2", () => {
    expect(linkedinProvider.id).toBe("linkedin");
    expect(linkedinProvider.authType).toBe("oauth2");
  });

  it("connects successfully and prefers `name` for the message", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "Solomon Tsao", given_name: "Solomon" }),
    });
    const result = await linkedinProvider.test(
      { row: { provider: "linkedin" }, token: "li_x", config: {} },
      makeDeps(fetchImpl),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.linkedin.com/v2/userinfo",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer li_x" }),
      }),
    );
    expect(result).toEqual({ success: true, message: "Connected as Solomon Tsao" });
  });

  it("falls back to given_name when name is missing", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ given_name: "Solomon" }),
    });
    const result = await linkedinProvider.test(
      { row: { provider: "linkedin" }, token: "li_x", config: {} },
      makeDeps(fetchImpl),
    );
    expect(result).toEqual({ success: true, message: "Connected as Solomon" });
  });

  it("returns success=false on non-2xx with the LinkedIn-specific message", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const result = await linkedinProvider.test(
      { row: { provider: "linkedin" }, token: "bad", config: {} },
      makeDeps(fetchImpl),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("LinkedIn API returned 401");
  });
});

describe("linkedinProvider.mapToEnv", () => {
  it("maps LINKEDIN_ACCESS_TOKEN as primary with no config envs", () => {
    const env = linkedinProvider.mapToEnv({
      row: { provider: "linkedin" },
      token: null,
      config: { irrelevant: "x" },
    });
    expect(env).toEqual({ primary: "LINKEDIN_ACCESS_TOKEN", config: {} });
  });
});

describe("linkedinProvider.sanitizeForSync", () => {
  it("strips client_id, client_secret, and refresh_token", () => {
    const sanitized = linkedinProvider.sanitizeForSync({
      access_token: "a",
      refresh_token: "r",
      client_id: "c",
      client_secret: "cs",
      default_username: "Solomon",
      sub: "12345",
    });
    expect(sanitized).toEqual({
      access_token: "a",
      default_username: "Solomon",
      sub: "12345",
    });
    expect(sanitized).not.toHaveProperty("refresh_token");
    expect(sanitized).not.toHaveProperty("client_secret");
    expect(sanitized).not.toHaveProperty("client_id");
  });
});

describe("linkedinProvider.refreshCredentials", () => {
  it("refreshes when expires_at is within the skew window", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "Bearer",
        scope: "openid profile email w_member_social",
        expires_in: 5184000,
      }),
    });
    const row = {
      id: "int-linkedin",
      provider: "linkedin",
      access_token: "old",
      config: {
        access_token: "old-access",
        refresh_token: "stored-refresh",
        client_id: "client-1",
        client_secret: "secret-1",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const outcome = await linkedinProvider.refreshCredentials(row, makeDeps(fetchImpl));

    expect(outcome.refreshed).toBe(true);
    expect(outcome.row.access_token).toBe("new-access");
    expect(outcome.row.config.access_token).toBe("new-access");
    expect(outcome.row.config.refresh_token).toBe("new-refresh");
    expect(outcome.row.config.token_type).toBe("Bearer");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.linkedin.com/oauth/v2/accessToken",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns refreshed=false when client_secret is missing", async () => {
    const fetchImpl = jest.fn();
    const row = {
      id: "int-linkedin",
      provider: "linkedin",
      access_token: "old",
      config: {
        refresh_token: "r",
        client_id: "c",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const outcome = await linkedinProvider.refreshCredentials(row, makeDeps(fetchImpl));
    expect(outcome.refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns refreshed=false when the token is still valid", async () => {
    const fetchImpl = jest.fn();
    const row = {
      id: "int-linkedin",
      provider: "linkedin",
      access_token: "old",
      config: {
        refresh_token: "r",
        client_id: "c",
        client_secret: "s",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    };
    const outcome = await linkedinProvider.refreshCredentials(row, makeDeps(fetchImpl));
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
      id: "int-linkedin",
      provider: "linkedin",
      access_token: "old",
      config: {
        refresh_token: "r",
        client_id: "c",
        client_secret: "s",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    };
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const outcome = await linkedinProvider.refreshCredentials(row, makeDeps(fetchImpl));
      expect(outcome.refreshed).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
