// @ts-nocheck
const express = require("express");

const {
  createAgentBackup,
  createRestoreDraft,
  deleteBackup,
  getAgentBackupSchedule,
  getBackupDownload,
  listAgentBackups,
  updateAgentBackupSchedule,
} = require("../backups");
const { addBackupJob } = require("../redisQueue");
const monitoring = require("../monitoring");
const { createMutationFailureAuditMiddleware } = require("../auditLog");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();
router.use(createMutationFailureAuditMiddleware("backup"));

router.get(
  "/:id/backups",
  asyncHandler(async (req, res) => {
    res.json(await listAgentBackups(req.user.id, req.params.id));
  }),
);

router.post(
  "/:id/backups",
  asyncHandler(async (req, res) => {
    const backup = await createAgentBackup({
      userId: req.user.id,
      agentId: req.params.id,
      actorId: req.user.id,
      name: req.body?.name || "",
    });
    await addBackupJob({ backupId: backup.id });
    await monitoring.logEvent("backup_agent_queued", `Agent backup "${backup.name}" queued`, {
      actor: { userId: req.user.id, email: req.user.email || null, role: req.user.role || null },
      backup: { id: backup.id, kind: backup.kind, status: backup.status },
      agent: { id: req.params.id, ownerUserId: req.user.id },
    });
    res.status(202).json({ backup });
  }),
);

router.get(
  "/:id/backups/schedule",
  asyncHandler(async (req, res) => {
    res.json(await getAgentBackupSchedule(req.user.id, req.params.id));
  }),
);

router.put(
  "/:id/backups/schedule",
  asyncHandler(async (req, res) => {
    const result = await updateAgentBackupSchedule(req.user.id, req.params.id, req.body || {});
    await monitoring.logEvent(
      "backup_agent_schedule_updated",
      result.schedule.enabled
        ? `Agent backup schedule enabled (${result.schedule.frequency})`
        : "Agent backup schedule disabled",
      {
        actor: { userId: req.user.id, email: req.user.email || null, role: req.user.role || null },
        agent: { id: req.params.id, ownerUserId: req.user.id },
        schedule: result.schedule,
      },
    );
    res.json(result);
  }),
);

router.get(
  "/:id/backups/:backupId/download",
  asyncHandler(async (req, res) => {
    const { buffer, filename } = await getBackupDownload({
      backupId: req.params.backupId,
      userId: req.user.id,
      agentId: req.params.id,
    });
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }),
);

router.delete(
  "/:id/backups/:backupId",
  asyncHandler(async (req, res) => {
    res.json(
      await deleteBackup({
        backupId: req.params.backupId,
        userId: req.user.id,
        agentId: req.params.id,
      }),
    );
  }),
);

router.post(
  "/:id/backups/:backupId/restore",
  asyncHandler(async (req, res) => {
    const mode = String(req.body?.mode || "copy")
      .trim()
      .toLowerCase();
    if (mode !== "copy") {
      return res.status(403).json({
        error:
          "Only admins can restore a backup in place. Use copy restore from the operator dashboard.",
      });
    }

    const result = await createRestoreDraft({
      backupId: req.params.backupId,
      userId: req.user.id,
      agentId: req.params.id,
    });
    await monitoring.logEvent(
      "backup_agent_restore_draft_created",
      "Agent backup restore draft created",
      {
        actor: { userId: req.user.id, email: req.user.email || null, role: req.user.role || null },
        agent: { id: req.params.id, ownerUserId: req.user.id },
        backup: { id: req.params.backupId },
        restore: { mode: "copy", draftId: result.draft?.id || null },
      },
    );
    res.json(result);
  }),
);

module.exports = router;
