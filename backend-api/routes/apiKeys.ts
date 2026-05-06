// @ts-nocheck
// Workspace-scoped API key management. Mounted under /workspaces/:id/api-keys
// so all endpoints inherit the workspace path and the role-aware guard.
// Issuing a key requires admin role on the workspace; listing requires viewer.

const express = require("express");
const apiKeys = require("../apiKeys");
const monitoring = require("../monitoring");
const { buildAuditMetadata, buildWorkspaceContext } = require("../auditLog");
const { requireWorkspaceRole } = require("../middleware/ownership");

const router = express.Router({ mergeParams: true });

function logKeyEvent(req, eventType, message, context) {
  return Promise.resolve(
    monitoring.logEvent(
      eventType,
      message,
      buildAuditMetadata(req, buildWorkspaceContext({}, context)),
    ),
  ).catch((error) => {
    console.error(`Failed to write api key audit event ${eventType}:`, error.message);
  });
}

// Listing scopes lets the UI render the create form without hardcoding.
router.get("/scopes", requireWorkspaceRole("viewer", "id"), (_req, res) => {
  res.json(apiKeys.SCOPE_DEFINITIONS);
});

router.get("/", requireWorkspaceRole("viewer", "id"), async (req, res) => {
  try {
    res.json(await apiKeys.listApiKeys(req.params.id));
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post("/", requireWorkspaceRole("admin", "id"), async (req, res) => {
  try {
    const { label, scopes, expiresAt } = req.body || {};
    const created = await apiKeys.createApiKey(req.params.id, req.user.id, {
      label,
      scopes,
      expiresAt,
    });
    await logKeyEvent(req, "api_key_created", `API key "${created.label}" issued`, {
      id: req.params.id,
      apiKey: { id: created.id, label: created.label, scopes: created.scopes },
    });
    res.json(created);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.delete("/:keyId", requireWorkspaceRole("admin", "id"), async (req, res) => {
  try {
    const revoked = await apiKeys.revokeApiKey(req.params.keyId, req.params.id);
    if (!revoked) return res.status(404).json({ error: "API key not found" });
    await logKeyEvent(req, "api_key_revoked", `API key "${revoked.label}" revoked`, {
      id: req.params.id,
      apiKey: { id: revoked.id, label: revoked.label },
    });
    res.json(revoked);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
