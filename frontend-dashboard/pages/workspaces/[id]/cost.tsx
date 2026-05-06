import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { DollarSign, Loader2, Save, AlertTriangle } from "lucide-react";
import Layout from "../../../components/layout/Layout";
import { useToast } from "../../../components/Toast";
import { useI18n } from "../../../lib/i18n";
import {
  type WorkspaceBudget,
  type WorkspaceCost,
  deleteBudget,
  getWorkspaceCost,
  listBudgets,
  upsertBudget,
} from "../../../lib/workspaceClient";

const PERIOD_DAYS_OPTIONS = [7, 30, 90];
const BUDGET_PERIODS: Array<"daily" | "weekly" | "monthly"> = ["daily", "weekly", "monthly"];

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function WorkspaceCostPage() {
  const router = useRouter();
  const workspaceId = typeof router.query.id === "string" ? router.query.id : null;
  const { t } = useI18n();
  const toast = useToast();

  const [periodDays, setPeriodDays] = useState(30);
  const [cost, setCost] = useState<WorkspaceCost | null>(null);
  const [budgets, setBudgets] = useState<WorkspaceBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetPeriod, setBudgetPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetThreshold, setBudgetThreshold] = useState("80");

  async function reload() {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [costRes, budgetsRes] = await Promise.all([
        getWorkspaceCost(workspaceId, { periodDays }),
        listBudgets(workspaceId),
      ]);
      setCost(costRes);
      setBudgets(budgetsRes);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load cost data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [workspaceId, periodDays]);

  async function handleSaveBudget(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || !budgetLimit) return;
    setSavingBudget(true);
    try {
      await upsertBudget(workspaceId, {
        period: budgetPeriod,
        limitUsd: Number(budgetLimit),
        softThresholdPct: Number(budgetThreshold) || 80,
      });
      setBudgetLimit("");
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save budget");
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleDeleteBudget(budget: WorkspaceBudget) {
    if (!workspaceId) return;
    if (!confirm(`Remove the ${budget.period} budget?`)) return;
    try {
      await deleteBudget(workspaceId, budget.id);
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete budget");
    }
  }

  const sortedAgents = useMemo(() => {
    if (!cost) return [];
    return [...cost.perAgent].sort((a, b) => b.total_cost - a.total_cost);
  }, [cost]);

  return (
    <Layout>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-[2rem] md:rounded-[3rem] bg-white border border-slate-200 shadow-2xl shadow-slate-200/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
              <DollarSign size={28} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none mb-1">
                {t("Cost dashboard")}
              </h1>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest opacity-80 leading-none">
                {workspaceId}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {PERIOD_DAYS_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setPeriodDays(days)}
                className={`text-xs font-bold px-3 py-2 rounded-xl ${
                  periodDays === days
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </header>

        {cost?.crossings && cost.crossings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-[2.5rem] p-6 shadow-sm flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 mt-1 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-black text-slate-900 mb-1">{t("Budget alerts")}</h3>
              <ul className="text-xs text-slate-700 space-y-1">
                {cost.crossings.map((crossing, i) => (
                  <li key={i}>
                    {crossing.bucket === "hard" ? "🚨" : "⚠️"} {crossing.budget.period} budget at{" "}
                    {crossing.pct}% — {formatUsd(crossing.currentUsd)} of{" "}
                    {formatUsd(crossing.budget.limitUsd)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-2">{t("Total spend")}</h2>
          {loading ? (
            <div className="h-24 flex items-center justify-center text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-4xl md:text-5xl font-black text-slate-900">
                {formatUsd(cost?.totalUsd || 0)}
              </span>
              <span className="text-xs text-slate-500 font-bold">
                {t("over the last")} {periodDays} {t("days")}
              </span>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-4">{t("Per-agent breakdown")}</h2>
          {sortedAgents.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              {t("No agents in this workspace.")}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sortedAgents.map((agent) => (
                <li key={agent.agentId} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {agent.agentName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t("Compute")} {formatUsd(agent.compute_cost)} · {t("Tokens")}{" "}
                      {formatUsd(agent.token_cost)} · {agent.uptime_hours.toFixed(1)} {t("hrs")}
                    </div>
                  </div>
                  <span className="text-sm font-black text-slate-900">
                    {formatUsd(agent.total_cost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-4">{t("Budgets")}</h2>
          <form
            onSubmit={handleSaveBudget}
            className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end mb-6"
          >
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t("Period")}
              </span>
              <select
                value={budgetPeriod}
                onChange={(e) => setBudgetPeriod(e.target.value as typeof budgetPeriod)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none"
              >
                {BUDGET_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(p.charAt(0).toUpperCase() + p.slice(1))}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t("Limit (USD)")}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="100.00"
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t("Soft alert (%)")}
              </span>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="80"
                className="w-24 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none"
                value={budgetThreshold}
                onChange={(e) => setBudgetThreshold(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={savingBudget}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-lg shadow-blue-500/30 active:scale-95 disabled:opacity-50"
            >
              {savingBudget ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t("Save budget")}
            </button>
          </form>
          {budgets.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {budgets.map((budget) => (
                <li key={budget.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {t(budget.period.charAt(0).toUpperCase() + budget.period.slice(1))} ·{" "}
                      {formatUsd(budget.limitUsd)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t("Soft alert at")} {budget.softThresholdPct}%
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBudget(budget)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-700"
                  >
                    {t("Remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
