import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  DollarSign,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import CostBreakdown from "../components/CostBreakdown";
import Layout from "../components/layout/Layout";
import { useToast } from "../components/Toast";
import { useI18n } from "../lib/i18n";
import {
  type AgentCostEntry,
  type WorkspaceCostGroup,
  type WorkspaceCostSummary,
  getWorkspaceCostSummary,
} from "../lib/workspaceClient";

const PERIOD_DAYS_OPTIONS = [7, 30, 90];

function formatUsd(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value?: number | null): string {
  return Number(value || 0).toLocaleString();
}

function agentSearchText(agent: AgentCostEntry, workspaceName = ""): string {
  const models = agent.cost_details?.tokens?.models || [];
  return [
    workspaceName,
    agent.agentName,
    agent.agentId,
    agent.status,
    agent.runtime_family,
    agent.backend_type,
    ...models.flatMap((model) => [model.model, model.provider, model.rate_source]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function agentMatchesSearch(agent: AgentCostEntry, query: string, workspaceName = "") {
  if (!query) return true;
  return agentSearchText(agent, workspaceName).includes(query);
}

function CostAgentRow({ agent }: { agent: AgentCostEntry }) {
  return (
    <div className="py-3">
      <Link
        href={`/agents/${agent.agentId}`}
        className="flex items-center justify-between gap-4 rounded-xl px-1 py-2 transition-colors hover:bg-slate-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{agent.agentName}</p>
            <p className="truncate text-xs text-slate-500">
              {formatUsd(agent.token_cost)} token cost · {formatNumber(agent.total_tokens)} tokens
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-black text-slate-900">{formatUsd(agent.total_cost)}</span>
          <ArrowUpRight size={14} className="text-slate-400" />
        </div>
      </Link>
      <CostBreakdown agent={agent} />
    </div>
  );
}

function WorkspaceCostSection({
  workspace,
  searchQuery,
}: {
  workspace: WorkspaceCostGroup;
  searchQuery: string;
}) {
  const workspaceMatches = searchQuery
    ? workspace.workspaceName.toLowerCase().includes(searchQuery)
    : false;
  const sortedAgents = [...(workspace.perAgent || [])]
    .filter(
      (agent) =>
        workspaceMatches || agentMatchesSearch(agent, searchQuery, workspace.workspaceName),
    )
    .sort((a, b) => b.total_cost - a.total_cost);

  if (searchQuery && !workspaceMatches && sortedAgents.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/workspaces/${workspace.workspaceId}/cost`}
            className="inline-flex max-w-full items-center gap-2 text-lg font-black text-slate-900 hover:text-blue-600"
          >
            <FolderOpen size={18} className="shrink-0 text-blue-600" />
            <span className="truncate">{workspace.workspaceName}</span>
          </Link>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
            {workspace.role || "member"} · {sortedAgents.length} visible agent
            {sortedAgents.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Workspace total
          </p>
          <p className="text-2xl font-black text-slate-900">{formatUsd(workspace.totalUsd)}</p>
        </div>
      </div>

      {sortedAgents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
          {searchQuery ? "No agents match this search." : "No agents assigned to this workspace."}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sortedAgents.map((agent) => (
            <CostAgentRow key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function CostDashboardPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [periodDays, setPeriodDays] = useState(30);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<WorkspaceCostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const usingCustomRange = Boolean(periodStart || periodEnd);
  const searchQuery = search.trim().toLowerCase();

  async function reload() {
    setLoading(true);
    try {
      setSummary(
        await getWorkspaceCostSummary(
          usingCustomRange ? { periodStart, periodEnd } : { periodDays },
        ),
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to load cost dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [periodDays, periodStart, periodEnd]);

  const sortedWorkspaces = useMemo(
    () =>
      [...(summary?.workspaces || [])]
        .filter((workspace) => {
          if (!searchQuery) return true;
          const workspaceMatches = workspace.workspaceName.toLowerCase().includes(searchQuery);
          return (
            workspaceMatches ||
            (workspace.perAgent || []).some((agent) =>
              agentMatchesSearch(agent, searchQuery, workspace.workspaceName),
            )
          );
        })
        .sort((a, b) => b.totalUsd - a.totalUsd),
    [summary, searchQuery],
  );
  const sortedUnassigned = useMemo(
    () =>
      [...(summary?.unassigned?.perAgent || [])]
        .filter((agent) => agentMatchesSearch(agent, searchQuery, "Unassigned"))
        .sort((a, b) => b.total_cost - a.total_cost),
    [summary, searchQuery],
  );

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
              <DollarSign size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                {t("Cost dashboard")}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Workspace token spend, unique fleet totals, and per-agent usage links.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_DAYS_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  setPeriodStart("");
                  setPeriodEnd("");
                  setPeriodDays(days);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  !usingCustomRange && periodDays === days
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {days}d
              </button>
            ))}
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-black uppercase text-slate-400">Search</span>
            <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Workspace, agent, model, or provider"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase text-slate-400">Start date</span>
              <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <CalendarDays size={16} className="shrink-0 text-slate-400" />
                <input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                />
              </span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase text-slate-400">End date</span>
              <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <CalendarDays size={16} className="shrink-0 text-slate-400" />
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                />
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                setPeriodStart("");
                setPeriodEnd("");
              }}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              Clear dates
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Unique fleet total
            </p>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {loading && !summary ? "..." : formatUsd(summary?.uniqueFleetTotalUsd || 0)}
            </p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Workspace totals
            </p>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {loading && !summary ? "..." : formatUsd(summary?.workspaceTotalUsd || 0)}
            </p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Unassigned owned agents
            </p>
            <p className="mt-3 text-3xl font-black text-slate-900">
              {loading && !summary ? "..." : sortedUnassigned.length}
            </p>
          </div>
        </section>

        {loading && !summary ? (
          <div className="flex h-64 items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white text-slate-400">
            <Loader2 size={28} className="animate-spin text-blue-500" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              {sortedWorkspaces.map((workspace) => (
                <WorkspaceCostSection
                  key={workspace.workspaceId}
                  workspace={workspace}
                  searchQuery={searchQuery}
                />
              ))}
            </div>

            {sortedUnassigned.length > 0 ? (
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">Unassigned owned agents</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Add these agents to a workspace when they should be visible to a team.
                    </p>
                  </div>
                  <Link
                    href="/workspaces"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    Manage workspaces
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {sortedUnassigned.map((agent) => (
                    <CostAgentRow key={agent.agentId} agent={agent} />
                  ))}
                </div>
              </section>
            ) : null}

            {sortedWorkspaces.length === 0 && sortedUnassigned.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-12 text-center">
                <DollarSign size={34} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-600">
                  {searchQuery
                    ? "No workspace, agent, or model matches this search."
                    : "No workspace or agent cost data is available yet."}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Layout>
  );
}
