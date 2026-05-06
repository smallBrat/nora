// @ts-nocheck
const jwt = require("jsonwebtoken");
const { readAuthCookie } = require("../authCookie");

function extractSessionToken(req) {
  // Cookie first — it's the preferred transport (HttpOnly, not JS-reachable).
  // Authorization header is still accepted for API clients, the embed flows,
  // and any legacy browser session that hasn't migrated yet.
  const cookieToken = readAuthCookie(req);
  if (cookieToken) return cookieToken;
  const authHeader = req.headers["authorization"] || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme === "Bearer" && token) return token;
  return null;
}

function tryDecodeSession(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

// Auth middleware: accepts a session JWT (cookie or Bearer) or a Nora API key.
// API keys are recognized by the "nora_" prefix. When an API key authenticates a
// request, req.user is populated from the key's issuing user and req.apiKey holds
// the key metadata + scopes for downstream scope checks.
async function authenticateToken(req, res, next) {
  const sessionToken = extractSessionToken(req);
  if (sessionToken && !sessionToken.startsWith("nora_")) {
    const decoded = tryDecodeSession(sessionToken);
    if (decoded) {
      req.user = decoded;
      return next();
    }
  }

  // Bearer token starting with nora_ → API key flow.
  const candidate = sessionToken && sessionToken.startsWith("nora_") ? sessionToken : null;
  const xApiKey = req.headers["x-api-key"] || req.headers["x-nora-api-key"] || "";
  const rawKey = candidate || (typeof xApiKey === "string" ? xApiKey.trim() : "");
  if (rawKey) {
    try {
      const { verifyApiKey } = require("../apiKeys");
      const verified = await verifyApiKey(rawKey);
      if (verified) {
        req.user = verified.user
          ? {
              id: verified.user.id,
              email: verified.user.email,
              role: verified.user.role || "user",
              name: verified.user.name,
              authMethod: "api_key",
            }
          : { id: null, email: null, role: "user", authMethod: "api_key" };
        req.apiKey = verified.key;
        req.apiKeyWorkspace = verified.workspace;
        return next();
      }
    } catch (error) {
      console.error("API key verification failed:", error.message);
    }
    return res.status(401).json({ error: "Invalid or expired API key" });
  }

  return res.status(401).json({ error: "Authentication required" });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Route-level scope guard. Use after authenticateToken when a route is callable
// by API keys: rejects keys without the required scope; session-authenticated
// requests pass through (their authorization is already enforced by role guards).
function requireScope(requiredScope) {
  return (req, res, next) => {
    if (!req.apiKey) return next();
    const scopes = Array.isArray(req.apiKey.scopes) ? req.apiKey.scopes : [];
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({
        error: `API key is missing the "${requiredScope}" scope`,
        code: "missing_scope",
      });
    }
    next();
  };
}

// Method-based scope guard. Routers mount this at the top level; the actual
// scope is picked from the request method. Either side can be null to mean
// "this method is not callable by API keys" — useful for keeping destructive
// or membership-management operations behind session auth even after a key
// authenticates.
function scopeByMethod(readScope, writeScope) {
  return (req, res, next) => {
    if (!req.apiKey) return next();
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method);
    const required = isRead ? readScope : writeScope;
    if (!required) {
      return res.status(403).json({
        error: "This endpoint requires session authentication",
        code: "session_required",
      });
    }
    const scopes = Array.isArray(req.apiKey.scopes) ? req.apiKey.scopes : [];
    if (!scopes.includes(required)) {
      return res.status(403).json({
        error: `API key is missing the "${required}" scope`,
        code: "missing_scope",
      });
    }
    next();
  };
}

// Hard session-only guard. Used on mounting points (e.g. /workspaces/:id/api-keys)
// where API-key authentication should never be allowed even if a token is
// presented — issuing more API keys with an existing key is a footgun.
function requireSession(req, res, next) {
  if (req.apiKey) {
    return res.status(403).json({
      error: "This endpoint requires session authentication",
      code: "session_required",
    });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireScope,
  requireSession,
  scopeByMethod,
};
