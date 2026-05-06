import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  History,
  Loader2,
  RotateCcw,
  Tag,
  GitBranch,
} from "lucide-react";
import Layout from "../../../components/layout/Layout";
import { useToast } from "../../../components/Toast";
import { useI18n } from "../../../lib/i18n";
import {
  type AgentVersion,
  listAgentVersions,
  rollbackAgent,
} from "../../../lib/workspaceClient";

const SOURCE_BADGES: Record<AgentVersion["source"], string> = {
  edit: "bg-slate-50 text-slate-700 border-slate-200",
  deploy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  redeploy: "bg-blue-50 text-blue-700 border-blue-200",
  duplicate: "bg-violet-50 text-violet-700 border-violet-200",
  "hub-install": "bg-indigo-50 text-indigo-700 border-indigo-200",
  restore: "bg-amber-50 text-amber-700 border-amber-200",
  rollback: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function AgentVersionsPage() {
  const router = useRouter();
  const agentId = typeof router.query.id === "string" ? router.query.id : null;
  const { t } = useI18n();
  const toast = useToast();

  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function reload() {
    if (!agentId) return;
    setLoading(true);
    try {
      const rows = await listAgentVersions(agentId);
      setVersions(rows);
      if (rows.length && !selectedId) setSelectedId(rows[0].id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function handleRollback(version: AgentVersion) {
    if (!agentId) return;
    if (
      !confirm(
        `Roll back to v${version.versionNumber}?\n\nA new version will be created with the current config so you can return to it. The agent will redeploy if it has a running container.`,
      )
    )
      return;
    setRolling(version.id);
    try {
      const result = await rollbackAgent(agentId, version.id);
      toast.success(
        `Rolled back to v${version.versionNumber}.${result.redeployed ? " Redeploying…" : ""}`,
      );
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "Rollback failed");
    } finally {
      setRolling(null);
    }
  }

  const selected = versions.find((v) => v.id === selectedId) || null;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => router.push(`/agents/${agentId}`)}
            className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600"
          >
            <ArrowLeft size={16} />
            {t("Back to agent")}
          </button>
          <div className="flex items-center gap-2 text-slate-700">
            <History size={20} />
            <span className="text-sm font-black uppercase tracking-widest">
              {t("Version history")}
            </span>
          </div>
        </header>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">
            <Loader2 size={28} className="animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3 bg-white border border-slate-200 rounded-[2.5rem] border-dashed">
            <GitBranch size={36} className="text-slate-300" />
            <span className="text-sm font-bold">{t("No version history yet.")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <aside className="lg:col-span-1 bg-white border border-slate-200 rounded-[2rem] p-4 shadow-sm">
              <ul className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
                {versions.map((version, idx) => {
                  const isCurrent = idx === 0;
                  const isSelected = version.id === selectedId;
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(version.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                          isSelected
                            ? "bg-blue-50 border border-blue-200"
                            : "hover:bg-slate-50 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Tag size={12} className="text-slate-400" />
                          <span className="text-sm font-black text-slate-900">
                            v{version.versionNumber}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
                              {t("Current")}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${SOURCE_BADGES[version.source]}`}
                          >
                            {version.source}
                          </span>
                        </div>
                        {version.message && (
                          <div className="text-xs text-slate-700 mb-1 truncate">
                            {version.message}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500">
                          {new Date(version.createdAt).toLocaleString()}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <main className="lg:col-span-2 bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
              {selected ? (
                <>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-900">
                        v{selected.versionNumber}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {selected.source} · {new Date(selected.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {versions[0]?.id !== selected.id && (
                      <button
                        type="button"
                        onClick={() => handleRollback(selected)}
                        disabled={rolling === selected.id}
                        className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 active:scale-95 disabled:opacity-50"
                      >
                        {rolling === selected.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RotateCcw size={14} />
                        )}
                        {t("Roll back to this version")}
                      </button>
                    )}
                  </div>
                  {selected.message && (
                    <div className="text-sm text-slate-700 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      {selected.message}
                    </div>
                  )}
                  <pre className="bg-slate-950 text-slate-100 text-xs rounded-xl p-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.config, null, 2)}
                  </pre>
                </>
              ) : (
                <div className="text-sm text-slate-500 text-center py-8">
                  {t("Select a version to inspect.")}
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </Layout>
  );
}
