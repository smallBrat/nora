// @ts-nocheck
const mockDb = { query: jest.fn() };
const mockEncrypt = jest.fn((value) => `enc(${value})`);
const mockDecrypt = jest.fn((value) => `dec(${value})`);
const mockEnsureEncryptionConfigured = jest.fn();

jest.mock("../db", () => mockDb);
jest.mock("../crypto", () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  ensureEncryptionConfigured: mockEnsureEncryptionConfigured,
}));

const integrations = require("../integrations");
const nativeFetch = global.fetch;

describe("integration secret handling", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
    mockEncrypt.mockClear();
    mockDecrypt.mockClear();
    mockEnsureEncryptionConfigured.mockClear();
  });

  afterEach(() => {
    global.fetch = nativeFetch;
  });

  it("redacts sensitive config and does not return access_token after create", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "int-1",
          agent_id: "agent-1",
          provider: "github",
          catalog_id: "github",
          access_token: "enc(secret-token)",
          config: '{"api_key":"enc(config-secret)","base_url":"https://api.github.com"}',
          status: "active",
        },
      ],
    });

    const result = await integrations.connectIntegration("agent-1", "github", "secret-token", {
      api_key: "config-secret",
      base_url: "https://api.github.com",
    });

    expect(mockEnsureEncryptionConfigured).toHaveBeenCalledWith("Integration credential storage");
    expect(mockEncrypt).toHaveBeenCalledWith("secret-token");
    expect(mockEncrypt).toHaveBeenCalledWith("config-secret");
    expect(result).toMatchObject({
      id: "int-1",
      agent_id: "agent-1",
      provider: "github",
      catalog_id: "github",
      status: "active",
      config: {
        api_key: "[REDACTED]",
        base_url: "https://api.github.com",
      },
    });
    expect(result).not.toHaveProperty("access_token");
  });

  it("replaces an existing provider integration after creating a new one", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "int-twitter",
            agent_id: "agent-1",
            provider: "twitter",
            catalog_id: "twitter",
            access_token: "enc(x-access-token)",
            config: JSON.stringify({ access_token: "enc(x-access-token)", username: "openai" }),
            status: "active",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await integrations.replaceIntegration("agent-1", "twitter", "x-access-token", {
      access_token: "x-access-token",
      username: "openai",
    });

    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM integrations WHERE agent_id = $1 AND provider = $2 AND id <> $3",
      ["agent-1", "twitter", "int-twitter"],
    );
    expect(result).toMatchObject({
      id: "int-twitter",
      provider: "twitter",
      config: {
        access_token: "[REDACTED]",
        username: "openai",
      },
    });
  });

  it("builds sync entries with manifest metadata and redacted config", () => {
    const entry = integrations.buildIntegrationSyncEntry({
      id: "int-gh",
      provider: "github",
      catalog_id: "github",
      catalog_name: "GitHub",
      catalog_category: "developer-tools",
      auth_type: "api_key",
      config_schema: JSON.stringify({
        authType: "api_key",
        capabilities: ["read", "write", "webhook"],
        toolSpecs: [
          {
            name: "github_list_repositories",
            description: "List repositories.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        api: { type: "rest", baseUrl: "https://api.github.com" },
        mcp: { available: false },
        usageHints: ["Use for repo inspection."],
      }),
      config: JSON.stringify({
        personal_access_token: "enc(pat)",
        org: "openai",
      }),
      status: "active",
    });

    expect(entry).toMatchObject({
      id: "int-gh",
      provider: "github",
      name: "GitHub",
      category: "developer-tools",
      authType: "api_key",
      status: "active",
      capabilities: ["read", "write", "webhook"],
      api: { type: "rest", baseUrl: "https://api.github.com" },
      mcp: { available: false },
      usageHints: ["Use for repo inspection."],
      credentialEnv: {
        primary: "GITHUB_TOKEN",
        config: {
          org: "GITHUB_ORG",
        },
      },
      config: {
        personal_access_token: "dec(enc(pat))",
        org: "openai",
      },
      redactedConfig: {
        personal_access_token: "[REDACTED]",
        org: "openai",
      },
    });
    expect(entry.toolSpecs).toHaveLength(1);
  });

  it("keeps Twitter/X OAuth app secrets out of runtime sync payloads", () => {
    const entry = integrations.buildIntegrationSyncEntry({
      id: "int-twitter",
      provider: "twitter",
      catalog_id: "twitter",
      catalog_name: "Twitter / X",
      catalog_category: "social",
      config_schema: JSON.stringify({
        authType: "oauth2",
        toolSpecs: [],
      }),
      config: JSON.stringify({
        access_token: "enc(x-access)",
        refresh_token: "enc(x-refresh)",
        client_id: "x-client-id",
        client_secret: "enc(x-client-secret)",
        default_username: "solomon2773",
      }),
      status: "active",
    });

    expect(entry.config).toEqual({
      access_token: "dec(enc(x-access))",
      default_username: "solomon2773",
    });
    expect(entry.config).not.toHaveProperty("refresh_token");
    expect(entry.config).not.toHaveProperty("client_secret");
  });

  it("converts integration tool specs into OpenClaw-compatible tool catalog entries", () => {
    const tools = integrations.buildIntegrationToolCatalogEntries(
      [
        {
          id: "int-gh",
          provider: "github",
          name: "GitHub",
          authType: "api_key",
          capabilities: ["read", "write"],
          redactedConfig: { org: "openai" },
          api: { type: "rest", baseUrl: "https://api.github.com" },
          mcp: { available: false },
          usageHints: ["Use for repo inspection."],
          toolSpecs: [
            {
              name: "github_list_repositories",
              description: "List repositories.",
              operation: "repos.list",
              inputSchema: { type: "object", properties: { owner: { type: "string" } } },
            },
          ],
        },
      ],
      { reservedNames: new Set(["health_check"]) },
    );

    expect(tools).toEqual([
      expect.objectContaining({
        function: expect.objectContaining({
          name: "nora_github_integration",
        }),
        nora: expect.objectContaining({
          source: "integration-manifest",
          executable: true,
          executionState: "runtime_skill",
          provider: "github",
          integrationId: "int-gh",
          runtimeToolName: "nora_github_integration",
        }),
      }),
      expect.objectContaining({
        type: "function",
        function: {
          name: "github_list_repositories",
          description: "List repositories.",
          parameters: { type: "object", properties: { owner: { type: "string" } } },
        },
        nora: expect.objectContaining({
          source: "integration-manifest",
          executable: true,
          executionState: "runtime_skill",
          provider: "github",
          integrationId: "int-gh",
          runtimeToolName: "github_list_repositories",
        }),
      }),
    ]);
    expect(tools[0].nora.invokeCommand).toContain("nora-integration-tool nora_github_integration");
    expect(tools[1].nora.invokeCommand).toContain("nora-integration-tool github_list_repositories");
  });

  it("maps Agent Hub template credentials from integrations into runtime env", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          provider: "telegram",
          access_token: "enc(telegram-token)",
          config: JSON.stringify({ operator_user_id: "12345" }),
        },
        {
          provider: "instagram",
          access_token: "enc(instagram-token)",
          config: JSON.stringify({
            business_account_id: "17890000000000000",
            page_id: "page-1",
          }),
        },
        {
          provider: "twitter",
          access_token: "enc(twitter-token)",
          config: JSON.stringify({
            default_username: "openai",
          }),
        },
      ],
    });

    const envVars = await integrations.getIntegrationEnvVars("agent-1");

    expect(envVars).toEqual({
      TELEGRAM_BOT_TOKEN: "dec(enc(telegram-token))",
      OPERATOR_TELEGRAM_ID: "12345",
      INSTAGRAM_ACCESS_TOKEN: "dec(enc(instagram-token))",
      INSTAGRAM_BUSINESS_ACCOUNT_ID: "17890000000000000",
      INSTAGRAM_PAGE_ID: "page-1",
      TWITTER_ACCESS_TOKEN: "dec(enc(twitter-token))",
      TWITTER_DEFAULT_USERNAME: "openai",
    });
  });

  it("exposes Agent Hub communication credentials through the integration catalog", async () => {
    mockDb.query.mockRejectedValueOnce(new Error("catalog table unavailable"));

    const catalog = await integrations.getCatalog();

    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "telegram",
          configFields: expect.arrayContaining([
            expect.objectContaining({ key: "bot_token", type: "password" }),
            expect.objectContaining({ key: "operator_user_id", type: "text" }),
          ]),
        }),
        expect.objectContaining({
          id: "instagram",
          configFields: expect.arrayContaining([
            expect.objectContaining({ key: "access_token", type: "password" }),
            expect.objectContaining({ key: "business_account_id", type: "text" }),
          ]),
        }),
      ]),
    );
  });

  it("returns actionable Twitter/X auth errors from connectivity tests", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "int-twitter",
          agent_id: "agent-1",
          provider: "twitter",
          access_token: "enc(read-only-token)",
          config: JSON.stringify({}),
          status: "active",
        },
      ],
    });
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({
          title: "Forbidden",
          detail: "Your credentials do not allow access to this resource",
        }),
    });

    const result = await integrations.testIntegration("int-twitter", "agent-1");

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Twitter/X API returned 403"),
    });
    expect(result.error).toContain("Your credentials do not allow access to this resource");
    expect(result.error).toContain("OAuth 2.0 user access token");
    expect(result.error).toContain("tweet.write");
  });
});
