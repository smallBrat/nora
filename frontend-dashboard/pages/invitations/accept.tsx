import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Layout from "../../components/layout/Layout";
import { useI18n } from "../../lib/i18n";
import {
  acceptInvitation,
  setActiveWorkspaceId,
  type WorkspaceRole,
} from "../../lib/workspaceClient";

type State =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; workspaceId: string; role: WorkspaceRole }
  | { kind: "error"; message: string };

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { t } = useI18n();
  const tokenParam = typeof router.query.token === "string" ? router.query.token : "";
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!router.isReady) return;
    if (!tokenParam) {
      setState({ kind: "error", message: t("Invitation token required") });
      return;
    }
    setState({ kind: "pending" });
    acceptInvitation(tokenParam)
      .then((result) => {
        setActiveWorkspaceId(result.workspaceId);
        setState({ kind: "success", workspaceId: result.workspaceId, role: result.role });
      })
      .catch((err: any) => {
        setState({ kind: "error", message: err?.message || t("Failed to send invitation") });
      });
  }, [router.isReady, tokenParam, t]);

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
          {t("Accept invitation")}
        </h1>

        {state.kind === "pending" && (
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-bold">{t("Loading workspaces...")}</span>
          </div>
        )}

        {state.kind === "success" && (
          <div className="flex flex-col items-center gap-4 bg-white border border-emerald-200 rounded-[2.5rem] p-10 shadow-xl shadow-emerald-200/30">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <p className="text-base font-bold text-slate-900">{t("Joined workspace")}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-black">
              {t(state.role.charAt(0).toUpperCase() + state.role.slice(1))}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/workspaces/${state.workspaceId}/members`)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3.5 rounded-2xl shadow-xl shadow-blue-500/30"
            >
              {t("Members & invitations")}
            </button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-col items-center gap-4 bg-white border border-red-200 rounded-[2.5rem] p-10 shadow-xl shadow-red-200/30">
            <XCircle size={48} className="text-red-500" />
            <p className="text-base font-bold text-slate-900">{state.message}</p>
            <button
              type="button"
              onClick={() => router.push("/workspaces")}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-6 py-3.5 rounded-2xl"
            >
              {t("Manage workspaces")}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
