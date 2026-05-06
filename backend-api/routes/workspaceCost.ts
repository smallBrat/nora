// @ts-nocheck
// Workspace-level cost dashboard + budget management.
// Mounted under /workspaces/:id/. cost reads at viewer; budget mutations at admin.

const express = require("express");
const monitoring = require("../monitoring");
const metrics = require("../metrics");
const budgets = require("../workspaceBudgets");
const { requireWorkspaceRole } = require("../middleware/ownership");

const router = express.Router({ mergeParams: true });

router.get("/cost", requireWorkspaceRole("viewer", "id"), async (req, res) => {
  try {
    const periodDays = Math.max(1, Math.min(365, Number(req.query.period_days) || 30));
    const summary = await metrics.getWorkspaceCost(req.params.id, { periodDays });

    // Evaluate budget crossings on every cost read. This is a cheap way to
    // surface alerts without standing up a separate cron — if the dashboard
    // is open or the API is polled, budgets get checked.
    const crossings = await budgets.evaluateBudgetCrossings(req.params.id, summary.totalUsd);
    for (const crossing of crossings) {
      const eventType =
        crossing.bucket === "hard" ? "workspace.budget_exceeded" : "workspace.budget_soft_exceeded";
      Promise.resolve(
        monitoring.logEvent(
          eventType,
          `Workspace ${req.params.id} budget ${crossing.bucket}: $${crossing.currentUsd.toFixed(2)} of $${crossing.budget.limitUsd}`,
          {
            workspace: { id: req.params.id },
            budget: {
              id: crossing.budget.id,
              period: crossing.budget.period,
              limitUsd: crossing.budget.limitUsd,
            },
            spend: { totalUsd: crossing.currentUsd, pct: crossing.pct },
          },
        ),
      ).catch((err) => console.error("Budget event emit failed:", err.message));
      budgets.recordBudgetAlert(crossing.budget.id, crossing.pct).catch(() => {});
    }

    res.json({ ...summary, crossings: crossings.map((c) => ({ ...c, budget: c.budget })) });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get("/budgets", requireWorkspaceRole("viewer", "id"), async (req, res) => {
  try {
    res.json(await budgets.listBudgets(req.params.id));
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.put("/budgets", requireWorkspaceRole("admin", "id"), async (req, res) => {
  try {
    const upserted = await budgets.upsertBudget(req.params.id, req.body || {});
    res.json(upserted);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.delete("/budgets/:budgetId", requireWorkspaceRole("admin", "id"), async (req, res) => {
  try {
    const deleted = await budgets.deleteBudget(req.params.budgetId, req.params.id);
    if (!deleted) return res.status(404).json({ error: "Budget not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

module.exports = router;
