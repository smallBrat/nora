// @ts-nocheck
const {
  createSecretEncryption,
} = require("../integrations/crypto/secretEncryption");

const encrypt = (s) => `enc(${s})`;
const decrypt = (s) => `dec(${s})`;

function makeCrypto(sensitiveKeys = {}) {
  return createSecretEncryption({
    encrypt,
    decrypt,
    getSensitiveConfigKeys: (provider) => new Set(sensitiveKeys[provider] || []),
  });
}

describe("createSecretEncryption.encryptSensitiveConfig", () => {
  it("encrypts catalog-defined sensitive keys", () => {
    const crypto = makeCrypto({ github: ["personal_access_token"] });
    const result = crypto.encryptSensitiveConfig("github", {
      personal_access_token: "ghp_abc",
      org: "openai",
    });

    expect(result.secured).toEqual({
      personal_access_token: "enc(ghp_abc)",
      org: "openai",
    });
    expect(result.hasSensitiveMaterial).toBe(true);
  });

  it("encrypts keys matching the secret-name regex even without catalog hint", () => {
    const crypto = makeCrypto();
    const result = crypto.encryptSensitiveConfig("custom", {
      api_key: "k1",
      private_key: "k2",
      label: "ok",
    });

    expect(result.secured.api_key).toBe("enc(k1)");
    expect(result.secured.private_key).toBe("enc(k2)");
    expect(result.secured.label).toBe("ok");
    expect(result.hasSensitiveMaterial).toBe(true);
  });

  it("reports no sensitive material when nothing is encrypted", () => {
    const crypto = makeCrypto();
    const result = crypto.encryptSensitiveConfig("custom", { name: "n", url: "u" });
    expect(result.hasSensitiveMaterial).toBe(false);
  });

  it("parses string config blobs before encrypting", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.encryptSensitiveConfig("github", '{"token":"ghp"}');
    expect(result.secured).toEqual({ token: "enc(ghp)" });
  });

  it("skips empty values", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.encryptSensitiveConfig("github", { token: "", org: "x" });
    expect(result.secured.token).toBe("");
    expect(result.hasSensitiveMaterial).toBe(false);
  });
});

describe("createSecretEncryption.decryptSensitiveConfig", () => {
  it("decrypts only sensitive keys", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.decryptSensitiveConfig("github", {
      token: "enc(ghp)",
      org: "openai",
    });
    expect(result).toEqual({ token: "dec(enc(ghp))", org: "openai" });
  });

  it("falls back to {} on invalid string config", () => {
    const crypto = makeCrypto();
    const result = crypto.decryptSensitiveConfig("any", "not-json");
    expect(result).toEqual({});
  });
});

describe("createSecretEncryption.redactSensitiveConfig", () => {
  it("replaces sensitive values with [REDACTED]", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.redactSensitiveConfig("github", {
      token: "enc(ghp)",
      org: "openai",
      api_key: "enc(other)",
    });
    expect(result).toEqual({
      token: "[REDACTED]",
      org: "openai",
      api_key: "[REDACTED]",
    });
  });

  it("leaves empty values alone", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.redactSensitiveConfig("github", { token: "", org: "openai" });
    expect(result.token).toBe("");
  });
});

describe("createSecretEncryption.stripSensitiveConfig", () => {
  it("nulls sensitive values and reports whether anything was removed", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.stripSensitiveConfig("github", {
      token: "enc(ghp)",
      org: "openai",
    });
    expect(result.config).toEqual({ token: null, org: "openai" });
    expect(result.removedSensitive).toBe(true);
  });

  it("returns removedSensitive=false when no sensitive values existed", () => {
    const crypto = makeCrypto({ github: ["token"] });
    const result = crypto.stripSensitiveConfig("github", { org: "openai" });
    expect(result.removedSensitive).toBe(false);
  });
});

describe("symmetry — encrypt then decrypt round-trip", () => {
  it("recovers the original plaintext for sensitive keys", () => {
    const crypto = makeCrypto({ slack: ["webhook_url", "signing_secret"] });
    const original = {
      webhook_url: "https://hooks.slack.com/x",
      signing_secret: "shh",
      bot_name: "Nora",
    };

    const { secured } = crypto.encryptSensitiveConfig("slack", original);
    const decrypted = crypto.decryptSensitiveConfig("slack", secured);

    expect(decrypted.webhook_url).toBe("dec(enc(https://hooks.slack.com/x))");
    expect(decrypted.signing_secret).toBe("dec(enc(shh))");
    expect(decrypted.bot_name).toBe("Nora");
  });
});
