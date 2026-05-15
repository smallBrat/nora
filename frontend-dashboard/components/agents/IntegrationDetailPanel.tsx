import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Shield,
  Clock,
  ChevronDown,
  RefreshCw,
  Save,
  Unplug,
  Link2,
  Loader2,
} from "lucide-react";

const REDACTED_SECRET = "[REDACTED]";
const EMAIL_CONNECTION_ADVANCED_KEYS = new Set([
  "imap.host",
  "imap.port",
  "imap.secure",
  "smtp.host",
  "smtp.port",
  "smtp.secure",
]);

const EMAIL_CRON_KEYS = new Set([
  "cron.enabled",
  "cron.intervalMinutes",
  "cron.prompt",
]);

function connectionStatusLabel(integration: any) {
  return integration?.status || "active";
}

function authModeLabel(config: any) {
  return config?.auth?.mode || "unknown";
}

function providerPresetLabel(config: any, provider: string) {
  return config?.providerPreset || provider || "custom";
}

function readFieldValue(source: any, key: string) {
  return key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), source);
}

function normalizeFieldValue(field: any, value: any) {
  if (field.type === "checkbox") return Boolean(value ?? field.defaultValue ?? false);
  if (field.type === "number") {
    if (value == null || value === "") return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : "";
  }
  if (field.type === "password") return "";
  return value ?? field.defaultValue ?? "";
}

function buildInitialValues(integration: any, configFields: any[]) {
  return (configFields || []).reduce((acc, field) => {
    acc[field.key] = normalizeFieldValue(field, readFieldValue(integration?.config || {}, field.key));
    return acc;
  }, {} as Record<string, any>);
}

export default function IntegrationDetailPanel({
  integration,
  catalogItem,
  onTest,
  onDisconnect,
  onSave,
  saving,
}: any) {
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [configExpanded, setConfigExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const configFields = useMemo(
    () => integration?.configFields || catalogItem?.configFields || [],
    [integration, catalogItem],
  );

  useEffect(() => {
    if (!integration) {
      setFormValues({});
      return;
    }
    setFormValues(buildInitialValues(integration, configFields));
    setConfigExpanded(false);
    setAdvancedExpanded(false);
  }, [integration, configFields]);

  if (!integration) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        Select an active integration to inspect and edit its configuration.
      </div>
    );
  }

  const name = integration.name || integration.catalog_name || integration.provider;
  const config = integration.config || {};
  const basicFields =
    integration.provider === "email"
      ? configFields.filter(
          (field: any) =>
            !EMAIL_CONNECTION_ADVANCED_KEYS.has(field.key) && !EMAIL_CRON_KEYS.has(field.key),
        )
      : configFields;
  const advancedConnectionFields =
    integration.provider === "email"
      ? configFields.filter((field: any) => EMAIL_CONNECTION_ADVANCED_KEYS.has(field.key))
      : [];
  const cronToggleField =
    integration.provider === "email"
      ? configFields.find((field: any) => field.key === "cron.enabled")
      : null;
  const cronConfigFields =
    integration.provider === "email"
      ? configFields.filter(
          (field: any) => field.key === "cron.intervalMinutes" || field.key === "cron.prompt",
        )
      : [];
  const hasCronAssociation = Boolean(integration?.cron_job_id);
  const cronEnabled = Boolean(formValues["cron.enabled"]);

  const hasUnsavedChanges = configFields.some((field: any) => {
    const original = normalizeFieldValue(field, readFieldValue(config, field.key));
    const current = formValues[field.key];
    return JSON.stringify(original) !== JSON.stringify(current);
  });

  function updateFieldValue(field: any, value: any) {
    setFormValues((current) => ({ ...current, [field.key]: value }));
  }

  async function handleSave() {
    const nextConfig = (configFields || []).reduce((acc, field) => {
      const value = formValues[field.key];
      if (field.type === "password") {
        if (typeof value === "string" && value.trim()) {
          acc[field.key] = value;
        }
        return acc;
      }
      acc[field.key] = value;
      return acc;
    }, {} as Record<string, any>);
    await onSave?.(integration, nextConfig);
  }

  function renderField(field: any) {
    const value = formValues[field.key];
    const existingValue = readFieldValue(config, field.key);
    const hasStoredSecret =
      field.type === "password" &&
      existingValue != null &&
      existingValue !== "" &&
      existingValue !== REDACTED_SECRET;

    return (
      <div key={field.key}>
        <label className="mb-1 block text-xs font-bold text-slate-600">
          {field.label} {field.required ? <span className="text-rose-500">*</span> : null}
        </label>
        {field.type === "textarea" ? (
          <textarea
            value={value ?? ""}
            onChange={(event) => updateFieldValue(field, event.target.value)}
            rows={4}
            placeholder={field.placeholder || ""}
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        ) : field.type === "select" ? (
          <select
            value={value ?? field.defaultValue ?? ""}
            onChange={(event) => updateFieldValue(field, event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">Select…</option>
            {(field.options || []).map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.type === "checkbox" ? (
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => updateFieldValue(field, event.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Enable
          </label>
        ) : (
          <input
            type={
              field.type === "password"
                ? "password"
                : field.type === "number"
                  ? "number"
                  : field.type === "email"
                    ? "email"
                    : field.type === "url"
                      ? "url"
                      : "text"
            }
            value={value ?? ""}
            onChange={(event) =>
              updateFieldValue(
                field,
                field.type === "number"
                  ? event.target.value === ""
                    ? ""
                    : Number(event.target.value)
                  : event.target.value,
              )
            }
            placeholder={
              field.type === "password" && (existingValue === REDACTED_SECRET || hasStoredSecret)
                ? "Leave blank to keep current secret"
                : field.placeholder || (field.type === "url" ? "https://..." : "")
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">{name}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {providerPresetLabel(config, integration.provider)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Update the connected integration and save the new config back to Nora.
          </p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {connectionStatusLabel(integration)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Mail size={12} />
            Mailbox Summary
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Mailbox Identity</dt>
              <dd className="font-medium text-slate-900">
                {config?.auth?.username || config?.smtp?.fromAddress || "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">From Address</dt>
              <dd className="font-medium text-slate-900">
                {config?.smtp?.fromAddress || config?.from_address || "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Auth Mode</dt>
              <dd className="font-medium capitalize text-slate-900">{authModeLabel(config)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Clock size={12} />
            Cron Setup
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Reminder Cron Enabled</dt>
              <dd className="font-medium text-slate-900">
                {config?.cron?.enabled ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Interval</dt>
              <dd className="font-medium text-slate-900">
                {config?.cron?.enabled
                  ? config?.cron?.intervalMinutes
                    ? `${config.cron.intervalMinutes} minutes`
                    : "Not configured"
                  : "Disabled"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Prompt</dt>
              <dd className="font-medium text-slate-900">
                {config?.cron?.enabled ? config?.cron?.prompt || "Not configured" : "Disabled"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Link2 size={12} />
            Actions
          </div>
          {hasCronAssociation ? (
            <p className="mt-3 text-xs text-slate-500">
              This integration manages cron job <span className="font-mono">{integration.cron_job_id}</span>.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges || configFields.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => onTest?.(integration)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              <RefreshCw size={12} />
              Retest
            </button>
            <button
              type="button"
              onClick={() => onDisconnect?.()}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
            >
              <Unplug size={12} />
              Disconnect
            </button>
          </div>
        </section>
      </div>

      {configFields.length > 0 ? (
        <div className="mt-6 space-y-4">
          <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <button
              type="button"
              onClick={() => setConfigExpanded((current) => !current)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Shield size={12} />
                Configuration
              </div>
              <ChevronDown
                size={14}
                className={`text-slate-400 transition-transform ${configExpanded ? "rotate-180" : ""}`}
              />
            </button>
            {configExpanded ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {basicFields.map(renderField)}
              </div>
            ) : null}
          </section>

          {advancedConnectionFields.length > 0 || cronToggleField || cronConfigFields.length > 0 ? (
            <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => setAdvancedExpanded((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <Shield size={12} />
                  Advanced
                </div>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform ${advancedExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {advancedExpanded ? (
                <div className="mt-3 space-y-4">
                  {advancedConnectionFields.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Connection Overrides
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Adjust IMAP and SMTP server settings only if you need something other than the provider preset defaults.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {advancedConnectionFields.map(renderField)}
                      </div>
                    </div>
                  ) : null}

                  {cronToggleField || cronConfigFields.length > 0 ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Reminder Cron
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Create a normal scheduled agent turn seeded from this mailbox connection.
                        </p>
                      </div>

                      {cronToggleField ? renderField(cronToggleField) : null}

                      {cronEnabled ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {cronConfigFields.map(renderField)}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          Turn on the reminder cron to choose how often it runs and what prompt it should use.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          This integration does not expose editable fields in the current catalog.
        </div>
      )}
    </div>
  );
}
