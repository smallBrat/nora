import { ChevronRight, Mail, Clock3 } from "lucide-react";

export default function ActiveIntegrationRow({ integration, selected, onSelect }: any) {
  const providerName = integration.name || integration.catalog_name || integration.provider;
  const mailboxIdentity =
    integration.config?.auth?.username ||
    integration.config?.smtp?.fromAddress ||
    integration.config?.from_address ||
    "Connected integration";
  const providerPreset = integration.config?.providerPreset || integration.provider;
  const cronEnabled = Boolean(integration?.config?.cron?.enabled && integration?.cron_job_id);
  const statusText = cronEnabled
    ? `Reminder cron active every ${integration.config?.cron?.intervalMinutes || 60} minutes`
    : "No reminder cron configured";

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
            <div className={`h-2.5 w-2.5 rounded-full ${cronEnabled ? "bg-blue-500" : "bg-slate-300"}`} />
            <span className="truncate text-sm font-bold text-slate-900">{providerName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {providerPreset}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Mail size={12} />
            <span className="truncate">{mailboxIdentity}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <Clock3 size={12} />
            <span className="truncate">{statusText}</span>
          </div>
        </div>
        <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400" />
      </div>
    </button>
  );
}
