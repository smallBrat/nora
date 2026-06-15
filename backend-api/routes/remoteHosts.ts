// @ts-nocheck
// Operator-facing remote-host registry routes (BYOC Phase A, A5).
//
// Each operator manages their OWN remote hosts (owner_user_id = req.user.id).
// Registering a host stores SSH credentials, so — like API-key minting — these
// routes are session-only (requireSession): an API key cannot create or read
// SSH credentials. Admin gets a separate read-only fleet view under /admin.

const express = require("express");
const remoteHosts = require("../remoteHosts");
const monitoring = require("../monitoring");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireSession } = require("../middleware/auth");

const router = express.Router();
router.use(requireSession);

// Load a host and confirm it belongs to the caller. Returns 404 (not 403) when
// it exists but is owned by someone else, so we never leak its existence.
async function loadOwnedHost(req) {
  const host = await remoteHosts.getRemoteHost(req.params.id);
  if (!host || host.ownerUserId !== req.user.id) {
    const error = new Error("Remote host not found");
    error.statusCode = 404;
    throw error;
  }
  return host;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(
      await remoteHosts.listRemoteHosts({ ownerUserId: req.user.id, includeDisabled: true }),
    );
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const host = await remoteHosts.createRemoteHost({
      ...(req.body || {}),
      ownerUserId: req.user.id,
    });
    await monitoring.logEvent("remote_host_registered", `Registered remote host "${host.label}"`, {
      userId: req.user.id,
      remoteHost: { id: host.id, label: host.label },
    });
    res.status(201).json(host);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedHost(req);
    // ownerUserId is pinned to the caller — a host cannot be reassigned.
    const host = await remoteHosts.updateRemoteHost(req.params.id, {
      ...(req.body || {}),
      ownerUserId: req.user.id,
    });
    res.json(host);
  }),
);

router.post(
  "/:id/test",
  asyncHandler(async (req, res) => {
    const owned = await loadOwnedHost(req);
    const host = await remoteHosts.testRemoteHost(req.params.id);
    await monitoring.logEvent(
      "remote_host_tested",
      `Tested remote host "${owned.label}" (${host.lastTestStatus})`,
      { userId: req.user.id, remoteHost: { id: host.id, status: host.lastTestStatus } },
    );
    res.json(host);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedHost(req);
    const host = await remoteHosts.deleteRemoteHost(req.params.id);
    await monitoring.logEvent("remote_host_deleted", `Deleted remote host "${host.label}"`, {
      userId: req.user.id,
      remoteHost: { id: host.id, label: host.label },
    });
    res.json(host);
  }),
);

module.exports = router;
