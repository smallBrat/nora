import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { fetchWithAuth } from "../../../lib/api";
import { useToast } from "../../Toast";
import { emitAgentDataChanged, subscribeToAgentDataChanged } from "../agentEvents";

function getJobId(job, fallback = "") {
  return String(job?.id || job?.cronId || fallback);
}

function parseCronMinutes(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "* * * * *") return "1";
  const everyMinutes = trimmed.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutes) return everyMinutes[1];
  return "";
}

function getScheduleMinutes(job) {
  const schedule = job?.schedule;
  if (Number.isFinite(Number(schedule?.everyMs))) {
    return String(Math.max(1, Math.round(Number(schedule.everyMs) / 60000)));
  }
  if (Number.isFinite(Number(schedule?.interval))) {
    return String(Math.max(1, Math.round(Number(schedule.interval) / 60)));
  }
  if (typeof schedule?.expr === "string") return parseCronMinutes(schedule.expr);
  if (typeof schedule?.cron === "string") return parseCronMinutes(schedule.cron);
  if (typeof schedule === "string") return parseCronMinutes(schedule);

  const cadence = job?.cadence;
  if (Number.isFinite(Number(cadence?.everyMs))) {
    return String(Math.max(1, Math.round(Number(cadence.everyMs) / 60000)));
  }
  if (typeof cadence?.expr === "string") return parseCronMinutes(cadence.expr);
  if (typeof cadence?.cron === "string") return parseCronMinutes(cadence.cron);
  if (typeof cadence === "string") return parseCronMinutes(cadence);
  return "";
}

function formatMinutesLabel(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes <= 0) return "Unknown cadence";
  return minutes === 1 ? "Every 1 minute" : `Every ${minutes} minutes`;
}

function buildSchedulePayload(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return {
    kind: "interval",
    everyMs: Math.max(1, Math.round(minutes)) * 60 * 1000,
  };
}

function getMessageValue(job) {
  return job?.message || job?.payload?.message || "";
}

function formatRunTime(value) {
  if (!value) return "Not available yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function CronPanel({ agentId }) {
  const [jobs, setJobs] = useState([]);
  const [integrationLinks, setIntegrationLinks] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [detailForm, setDetailForm] = useState({ name: "", scheduleMinutes: "", message: "" });
  const [createForm, setCreateForm] = useState({ name: "", scheduleMinutes: "60", message: "" });
  const toast = useToast();

  async function fetchJobs() {
    setLoading(true);
    setError("");
    try {
      const [jobsRes, integrationsRes] = await Promise.all([
        fetchWithAuth(`/api/agents/${agentId}/gateway/cron`),
        fetchWithAuth(`/api/agents/${agentId}/integrations`),
      ]);
      const data = await jobsRes.json().catch(() => ({}));
      const integrationsData = await integrationsRes.json().catch(() => []);
      if (!jobsRes.ok) {
        throw new Error(data.error || `HTTP ${jobsRes.status}`);
      }
      const nextJobs = Array.isArray(data) ? data : data.jobs || [];
      const nextLinks = Array.isArray(integrationsData)
        ? integrationsData.reduce((acc, integration) => {
            if (integration?.cron_job_id) acc[String(integration.cron_job_id)] = integration;
            return acc;
          }, {} as Record<string, any>)
        : {};
      setJobs(nextJobs);
      setIntegrationLinks(nextLinks);
      setSelectedJobId((current) => {
        if (!nextJobs.length) return "";
        if (current && nextJobs.some((job, index) => getJobId(job, String(index)) === current)) {
          return current;
        }
        return getJobId(nextJobs[0], "0");
      });
    } catch (err) {
      setError(err.message || "Failed to load cron jobs");
      setJobs([]);
      setIntegrationLinks({});
      setSelectedJobId("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchJobs();
  }, [agentId]);

  useEffect(() => {
    return subscribeToAgentDataChanged(agentId, (detail) => {
      if (detail.scope === "integrations" || detail.scope === "all") {
        fetchJobs();
      }
    });
  }, [agentId]);

  const selectedJob = useMemo(
    () =>
      jobs.find((job, index) => getJobId(job, String(index)) === selectedJobId) || jobs[0] || null,
    [jobs, selectedJobId],
  );

  useEffect(() => {
    if (!selectedJob) {
      setDetailForm({ name: "", scheduleMinutes: "", message: "" });
      return;
    }

    setDetailForm({
      name: selectedJob?.name || "",
      scheduleMinutes: getScheduleMinutes(selectedJob),
      message: getMessageValue(selectedJob),
    });
  }, [selectedJob]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/gateway/cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          schedule: buildSchedulePayload(createForm.scheduleMinutes),
          message: createForm.message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to create cron job");
      }

      toast.success("Cron job created");
      setCreateForm({ name: "", scheduleMinutes: "60", message: "" });
      setShowCreateForm(false);
      await fetchJobs();
      emitAgentDataChanged({ agentId, scope: "cron" });
    } catch (nextError) {
      const message = nextError.message || "Failed to create cron job";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedJob) return;
    const cronId = getJobId(selectedJob);
    if (!cronId) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/gateway/cron/${cronId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: detailForm.name,
          schedule: buildSchedulePayload(detailForm.scheduleMinutes),
          message: detailForm.message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update cron job");
      }

      toast.success("Cron job updated");
      await fetchJobs();
      emitAgentDataChanged({ agentId, scope: "cron" });

      const nextSelectedId = getJobId(data?.job || data, data?.id || data?.cronId || "");
      if (nextSelectedId) {
        setSelectedJobId(nextSelectedId);
      }
    } catch (nextError) {
      const message = nextError.message || "Failed to update cron job";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cronId) {
    if (!cronId) return;

    setDeletingId(cronId);
    setError("");
    try {
      const res = await fetchWithAuth(`/api/agents/${agentId}/gateway/cron/${cronId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete cron job");
      }

      toast.success("Cron job deleted");
      await fetchJobs();
      emitAgentDataChanged({ agentId, scope: "cron" });
    } catch (nextError) {
      const message = nextError.message || "Failed to delete cron job";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId("");
    }
  }

  const selectedJobEnabled = selectedJob?.enabled !== false && selectedJob?.active !== false;
  const selectedJobLastRun = selectedJob?.last_run || selectedJob?.lastRun || null;
  const selectedLinkedIntegration = selectedJob ? integrationLinks[getJobId(selectedJob)] || null : null;
  const hasUnsavedChanges =
    !!selectedJob &&
    (detailForm.name !== (selectedJob?.name || "") ||
      detailForm.scheduleMinutes !== getScheduleMinutes(selectedJob) ||
      detailForm.message !== getMessageValue(selectedJob));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
            Cron Jobs
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            Select a scheduled job to edit its details.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Jobs run inside the agent runtime and can be updated from the detail panel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            <Plus size={12} />
            Add Job
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {showCreateForm ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Name</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Daily summary"
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                Run Every (minutes)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={createForm.scheduleMinutes}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, scheduleMinutes: event.target.value }))
                }
                placeholder="60"
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Message / Prompt</label>
            <textarea
              value={createForm.message}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, message: event.target.value }))
              }
              placeholder="Generate a daily summary report..."
              rows={4}
              required
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Create Job
            </button>
          </div>
        </form>
      ) : null}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <CalendarClock size={24} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-600">No cron jobs configured</p>
          <p className="mt-1 text-xs text-slate-500">
            Add a recurring job to start editing it from the detail panel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Scheduled Jobs</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Click a cron job to inspect and edit its configuration.
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
                {jobs.length} jobs
              </div>
            </div>
            <div className="space-y-3">
              {jobs.map((job, index) => {
                const jobId = getJobId(job, String(index));
                const enabled = job?.enabled !== false && job?.active !== false;
                return (
                  <button
                    key={jobId}
                    type="button"
                    onClick={() => setSelectedJobId(jobId)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                      selectedJobId === jobId
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {enabled ? (
                            <CheckCircle size={12} className="text-green-500" />
                          ) : (
                            <XCircle size={12} className="text-slate-300" />
                          )}
                          <span className="truncate text-sm font-bold text-slate-900">
                            {job?.name || "Unnamed"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Clock size={12} />
                          <span className="truncate font-mono text-blue-600">
                            {formatMinutesLabel(getScheduleMinutes(job))}
                          </span>
                        </div>
                        {getMessageValue(job) ? (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {getMessageValue(job)}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight size={16} className="mt-1 shrink-0 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="xl:sticky xl:top-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {selectedJob ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">
                          {selectedJob?.name || "Unnamed job"}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            selectedJobEnabled
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {selectedJobEnabled ? "Enabled" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Update how often this job runs and what prompt it sends.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">Name</label>
                      <input
                        type="text"
                        value={detailForm.name}
                        onChange={(event) =>
                          setDetailForm((current) => ({ ...current, name: event.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">
                        Run Every (minutes)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={detailForm.scheduleMinutes}
                        onChange={(event) =>
                          setDetailForm((current) => ({
                            ...current,
                            scheduleMinutes: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-600">
                        Message / Prompt
                      </label>
                      <textarea
                        value={detailForm.message}
                        onChange={(event) =>
                          setDetailForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        rows={5}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    {selectedLinkedIntegration ? (
                      <p className="text-xs text-slate-500">
                        Linked to the active {selectedLinkedIntegration.provider} integration. Deleting this job here will clear the reminder-cron link in that integration.
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Runtime Status
                      </p>
                      <dl className="mt-3 space-y-2 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">Job ID</dt>
                          <dd className="font-medium text-slate-900">{getJobId(selectedJob)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Last Run</dt>
                          <dd className="font-medium text-slate-900">
                            {formatRunTime(selectedJobLastRun)}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Actions
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving || !hasUnsavedChanges}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(getJobId(selectedJob))}
                          disabled={deletingId === getJobId(selectedJob)}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                        >
                          {deletingId === getJobId(selectedJob) ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Delete Job
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                  Select a cron job to edit its name, schedule, and prompt.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
