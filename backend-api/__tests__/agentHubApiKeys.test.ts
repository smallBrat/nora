// @ts-nocheck
const crypto = require("crypto");

const mockDb = { query: jest.fn() };
jest.mock("../db", () => mockDb);

const agentHubApiKeys = require("../agentHubApiKeys");

const ENV_KEYS = ["NODE_ENV", "NORA_AGENT_HUB_API_KEY_HASH_SECRET", "ENCRYPTION_KEY", "JWT_SECRET"];
const originalEnv = {};

function hmac(secret, rawKey) {
  return crypto.createHmac("sha256", secret).update(rawKey, "utf8").digest("hex");
}

function sha256(rawKey) {
  return crypto.createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

function dbKeyRow(keyHash) {
  return {
    id: "hub-key-1",
    user_id: "publisher-1",
    label: "Nora installation",
    key_hash: keyHash,
    key_prefix: "nora_hub_test",
    status: "active",
    created_at: "2026-04-01T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    email: "publisher@nora.test",
    name: "Publisher One",
    avatar: null,
    role: "user",
  };
}

beforeAll(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

beforeEach(() => {
  restoreEnv();
  process.env.NODE_ENV = "test";
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  restoreEnv();
});

describe("Agent Hub API key hashing", () => {
  it("creates new keys with the dedicated Agent Hub hash secret", async () => {
    const explicitSecret = "a".repeat(64);
    const legacySecret = "b".repeat(64);
    process.env.NORA_AGENT_HUB_API_KEY_HASH_SECRET = explicitSecret;
    process.env.ENCRYPTION_KEY = legacySecret;

    const randomBytesSpy = jest.spyOn(crypto, "randomBytes").mockReturnValue(Buffer.alloc(32, 1));
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "hub-key-1",
          label: "Production install",
          key_prefix: "nora_hub_generated",
          status: "active",
          created_at: "2026-04-01T00:00:00.000Z",
          last_used_at: null,
          revoked_at: null,
        },
      ],
    });

    const created = await agentHubApiKeys.createApiKey("user-1", "Production install");
    const insertParams = mockDb.query.mock.calls[0][1];

    expect(created.apiKey).toMatch(/^nora_hub_/);
    expect(insertParams[2]).toBe(hmac(explicitSecret, created.apiKey));
    expect(insertParams[2]).not.toBe(hmac(legacySecret, created.apiKey));

    randomBytesSpy.mockRestore();
  });

  it("verifies fallback-HMAC legacy keys and rehashes them with the dedicated secret", async () => {
    const explicitSecret = "c".repeat(64);
    const legacySecret = "d".repeat(64);
    const rawKey = "nora_hub_existing_key";
    const primaryHash = hmac(explicitSecret, rawKey);
    const legacyHash = hmac(legacySecret, rawKey);

    process.env.NORA_AGENT_HUB_API_KEY_HASH_SECRET = explicitSecret;
    process.env.ENCRYPTION_KEY = legacySecret;
    mockDb.query.mockResolvedValueOnce({ rows: [dbKeyRow(legacyHash)] }).mockResolvedValueOnce({
      rows: [],
    });

    const verified = await agentHubApiKeys.verifyApiKey(rawKey);
    const lookupParams = mockDb.query.mock.calls[0][1];
    const updateCall = mockDb.query.mock.calls[1];

    expect(lookupParams[0]).toEqual(expect.arrayContaining([primaryHash, legacyHash]));
    expect(lookupParams[2]).toBe(primaryHash);
    expect(updateCall[0]).toContain("SET key_hash = $1");
    expect(updateCall[1]).toEqual([primaryHash, "hub-key-1"]);
    expect(verified.user.id).toBe("publisher-1");
  });

  it("verifies unsalted SHA-256 legacy keys and rehashes them with the dedicated secret", async () => {
    const explicitSecret = "e".repeat(64);
    const rawKey = "nora_hub_old_sha_key";
    const primaryHash = hmac(explicitSecret, rawKey);
    const legacyHash = sha256(rawKey);

    process.env.NORA_AGENT_HUB_API_KEY_HASH_SECRET = explicitSecret;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    mockDb.query.mockResolvedValueOnce({ rows: [dbKeyRow(legacyHash)] }).mockResolvedValueOnce({
      rows: [],
    });

    await agentHubApiKeys.verifyApiKey(rawKey);
    const lookupParams = mockDb.query.mock.calls[0][1];
    const updateCall = mockDb.query.mock.calls[1];

    expect(lookupParams[0]).toEqual(expect.arrayContaining([primaryHash, legacyHash]));
    expect(updateCall[0]).toContain("SET key_hash = $1");
    expect(updateCall[1]).toEqual([primaryHash, "hub-key-1"]);
  });
});
