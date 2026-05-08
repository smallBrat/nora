// Pure functions for encrypting / decrypting / redacting / stripping
// sensitive fields inside an integration's `config` blob. The caller
// supplies the crypto primitives and a function that resolves which
// catalog keys are sensitive — keeping this module decoupled from the
// catalog JSON and from `backend-api/crypto.ts` directly.

import type { ConfigBlob } from "../types/integration";

const SECRET_CONFIG_KEY_RE =
  /(token|secret|password|api[_-]?key|private[_-]?key|service[_-]?account|credentials?)/i;
const REDACTED_SECRET = "[REDACTED]";

export interface SecretEncryptionDeps {
  encrypt: (plain: string) => string;
  decrypt: (cipher: string) => string;
  getSensitiveConfigKeys: (provider: string) => Set<string>;
}

export interface SecretEncryption {
  encryptSensitiveConfig(
    provider: string,
    config?: ConfigBlob,
  ): { secured: Record<string, unknown>; hasSensitiveMaterial: boolean };
  decryptSensitiveConfig(provider: string, config?: ConfigBlob): Record<string, unknown>;
  redactSensitiveConfig(provider: string, config?: ConfigBlob): Record<string, unknown>;
  stripSensitiveConfig(
    provider: string,
    config?: ConfigBlob,
  ): { config: Record<string, unknown>; removedSensitive: boolean };
}

function parseConfig(config: ConfigBlob): Record<string, any> {
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return (config as Record<string, any>) || {};
}

function isSensitiveKey(key: string, sensitiveKeys: Set<string>): boolean {
  return sensitiveKeys.has(key) || SECRET_CONFIG_KEY_RE.test(key);
}

export function createSecretEncryption(deps: SecretEncryptionDeps): SecretEncryption {
  const { encrypt, decrypt, getSensitiveConfigKeys } = deps;

  return {
    encryptSensitiveConfig(provider, config = {}) {
      const plain = parseConfig(config);
      const sensitiveKeys = getSensitiveConfigKeys(provider);
      const secured: Record<string, any> = { ...plain };
      let hasSensitiveMaterial = false;

      for (const key of Object.keys(secured)) {
        const value = secured[key];
        if (!value) continue;
        if (isSensitiveKey(key, sensitiveKeys)) {
          hasSensitiveMaterial = true;
          secured[key] = encrypt(String(value));
        }
      }

      return { secured, hasSensitiveMaterial };
    },

    decryptSensitiveConfig(provider, config = {}) {
      const parsed = parseConfig(config);
      const sensitiveKeys = getSensitiveConfigKeys(provider);
      const revealed: Record<string, any> = { ...parsed };

      for (const key of Object.keys(revealed)) {
        const value = revealed[key];
        if (!value) continue;
        if (isSensitiveKey(key, sensitiveKeys)) {
          revealed[key] = decrypt(String(value));
        }
      }

      return revealed;
    },

    redactSensitiveConfig(provider, config = {}) {
      const parsed = parseConfig(config);
      const sensitiveKeys = getSensitiveConfigKeys(provider);
      const redacted: Record<string, any> = { ...parsed };

      for (const key of Object.keys(redacted)) {
        if (isSensitiveKey(key, sensitiveKeys)) {
          if (redacted[key]) redacted[key] = REDACTED_SECRET;
        }
      }

      return redacted;
    },

    stripSensitiveConfig(provider, config = {}) {
      const parsed = parseConfig(config);
      const sensitiveKeys = getSensitiveConfigKeys(provider);
      const stripped: Record<string, any> = { ...parsed };
      let removedSensitive = false;

      for (const key of Object.keys(stripped)) {
        if (isSensitiveKey(key, sensitiveKeys)) {
          if (stripped[key]) removedSensitive = true;
          stripped[key] = null;
        }
      }

      return { config: stripped, removedSensitive };
    },
  };
}

export { SECRET_CONFIG_KEY_RE, REDACTED_SECRET };
