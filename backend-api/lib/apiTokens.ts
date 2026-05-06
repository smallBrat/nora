// @ts-nocheck
// Shared HMAC token primitives for Nora's API key systems.
// agentHubApiKeys.ts has its own copy of this logic for backward compatibility;
// new modules (api_keys for the public REST API, workspaceMembers invitations)
// should use these helpers instead of reimplementing.

const crypto = require("crypto");

const PRIMARY_HASH_ENV = "NORA_API_KEY_HASH_SECRET";
const LEGACY_HASH_ENVS = [
  "NORA_AGENT_HUB_API_KEY_HASH_SECRET",
  "ENCRYPTION_KEY",
  "JWT_SECRET",
];
const TEST_FALLBACK_SECRET = "nora-api-key-test-hash-secret";
const SECRET_MIN_LENGTH = 32;

function buildSecretError(message) {
  const error = new Error(
    message ||
      `API key hashing requires ${PRIMARY_HASH_ENV}, ${LEGACY_HASH_ENVS.join(", ")}, or NODE_ENV=test`,
  );
  error.statusCode = 503;
  return error;
}

function normalizeSecret(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length >= SECRET_MIN_LENGTH ? trimmed : "";
}

function explicitPrimarySecret() {
  const raw = process.env[PRIMARY_HASH_ENV];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed && trimmed.length < SECRET_MIN_LENGTH) {
    throw buildSecretError(
      `${PRIMARY_HASH_ENV} must be at least ${SECRET_MIN_LENGTH} characters`,
    );
  }
  return normalizeSecret(raw);
}

function addUniqueSecret(secrets, secret) {
  if (secret && !secrets.includes(secret)) secrets.push(secret);
}

// Returns the chain of acceptable hash secrets for verification.
// The first entry is the canonical (write) secret; later entries cover
// installations whose hashes were written under a legacy env var.
function apiKeyHashSecrets({ includeLegacy = false } = {}) {
  const secrets = [];
  addUniqueSecret(secrets, explicitPrimarySecret());

  if (includeLegacy || secrets.length === 0) {
    for (const envName of LEGACY_HASH_ENVS) {
      addUniqueSecret(secrets, normalizeSecret(process.env[envName]));
    }
  }

  if (secrets.length === 0 && process.env.NODE_ENV === "test") {
    addUniqueSecret(secrets, TEST_FALLBACK_SECRET);
  }
  if (secrets.length > 0) return secrets;
  throw buildSecretError();
}

function primarySecret() {
  return apiKeyHashSecrets()[0];
}

function hmac(rawValue, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(rawValue || ""), "utf8")
    .digest("hex");
}

function hashApiKey(rawKey) {
  return hmac(rawKey, primarySecret());
}

// Returns every hash a presented token *might* match, ordered with the primary
// (canonical) hash first so verifier code can lazy-rehash on legacy hits.
function apiKeyHashCandidates(rawKey) {
  const seen = new Set();
  const out = [];
  for (const secret of apiKeyHashSecrets({ includeLegacy: true })) {
    const h = hmac(rawKey, secret);
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

function generateRawKey(prefix = "nora_") {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

function keyPrefix(rawKey, length = 18) {
  return String(rawKey || "").slice(0, length);
}

function maskKeyPrefix(prefix) {
  const normalized = String(prefix || "").trim();
  return normalized ? `${normalized}...` : "";
}

// Bearer-token-only intake. Headers in priority order:
//   Authorization: Bearer <token>
//   x-api-key: <token>
// We deliberately reject query-string keys — they leak through access logs and
// browser history.
function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || "";
  const [scheme, token] = String(authHeader).split(" ");
  if (scheme === "Bearer" && token) return token.trim();
  const explicit = req.headers?.["x-api-key"] || req.headers?.["x-nora-api-key"];
  if (explicit) return String(explicit).trim();
  return "";
}

module.exports = {
  PRIMARY_HASH_ENV,
  LEGACY_HASH_ENVS,
  apiKeyHashCandidates,
  apiKeyHashSecrets,
  extractBearerToken,
  generateRawKey,
  hashApiKey,
  hmac,
  keyPrefix,
  maskKeyPrefix,
};
