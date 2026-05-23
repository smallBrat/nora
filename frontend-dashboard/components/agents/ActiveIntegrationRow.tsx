import { ChevronRight, Mail, Clock3 } from "lucide-react";

export default function ActiveIntegrationRow({ integration, selected, onSelect }: any) {
  const providerName = integration.name || integration.catalog_name || integration.provider;
  const isWecomIntegration = integration.provider === "wecom";
  const isEmailIntegration = integration.provider === "email";
  const mailboxIdentity =
    integration.config?.auth?.username ||
    integration.config?.smtp?.fromAddress ||
    integration.config?.from_address ||
    "Connected integration";
  const providerPreset = integration.config?.providerPreset || integration.provider;
  const cronEnabled = Boolean(integration?.config?.cron?.enabled && integration?.cron_job_id);
  const emailVerification = integration?.config?.verification || {};
  const emailVerificationSuccess =
    typeof emailVerification?.lastSuccess === "boolean" ? emailVerification.lastSuccess : null;
  const emailVerificationError = emailVerification?.lastError || "";
  const wecomMode = integration?.config?.mode || "bot";
  const wecomReadiness = integration?.config?.activation?.readiness || "pending_activation";
  const wecomLifecycle = integration?.config?.activation?.lifecycleStatus || "saved";
  const emailStatusText =
    emailVerificationSuccess === true
      ? "Connection verified"
      : emailVerificationSuccess === false
        ? emailVerificationError || "Connection test failed"
        : "Not yet verified";
  const statusText = cronEnabled
    ? `Reminder cron active every ${integration.config?.cron?.intervalMinutes || 60} minutes`
    : "No reminder cron configured";
  const summaryText = isWecomIntegration
    ? `${wecomMode.charAt(0).toUpperCase()}${wecomMode.slice(1)} mode`
    : mailboxIdentity;
  const detailText = isWecomIntegration
    ? `${wecomLifecycle.replace(/_/g, " ")} • ${wecomReadiness.replace(/_/g, " ")}`
    : isEmailIntegration
      ? emailStatusText
      : statusText;
  const stateDotClass = isWecomIntegration
    ? wecomReadiness === "ready"
      ? "bg-emerald-500"
      : wecomReadiness === "error"
        ? "bg-rose-500"
        : "bg-amber-500"
    : isEmailIntegration
      ? emailVerificationSuccess === true
        ? "bg-emerald-500"
        : emailVerificationSuccess === false
          ? "bg-rose-500"
          : "bg-amber-500"
      : cronEnabled
        ? "bg-blue-500"
        : "bg-slate-300";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(integration)}
      className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
        selected
          ? "border-blue-300 bg-blue-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${stateDotClass}`} />
            <span className="truncate text-sm font-bold text-slate-900">{providerName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {providerPreset}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Mail size={12} />
            <span className="truncate">{summaryText}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Clock3 size={12} />
            <span className="truncate">{detailText}</span>
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400" />
      </div>
    </button>
  );
}
