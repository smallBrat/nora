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

describe("linkedinProvider", () => {
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

  it("maps LINKEDIN_ACCESS_TOKEN as primary with no config envs", () => {
    const env = linkedinProvider.mapToEnv({
      row: { provider: "linkedin" },
      token: null,
      config: { irrelevant: "x" },
    });
    expect(env).toEqual({ primary: "LINKEDIN_ACCESS_TOKEN", config: {} });
  });
});
