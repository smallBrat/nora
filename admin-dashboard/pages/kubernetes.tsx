import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { useToast } from "../components/Toast";
import { fetchWithAuth } from "../lib/api";

const EMPTY_FORM = {
  id: "",
  label: "",
  provider: "kubernetes",
  clusterName: "",
  enabled: true,
  isDefault: false,
  credentialMode: "mounted_path",
  kubeconfigPath: "",
  kubeconfigContent: "",
  kubeContext: "",
  namespace: "openclaw-agents",
  openclawNamespace: "",
  hermesNamespace: "",
  exposureMode: "cluster-ip",
  runtimeHost: "",
  runtimeNodePort: "",
  gatewayNodePort: "",
  serviceAnnotationsJson: "{}",
  loadBalancerSourceRanges: "",
  loadBalancerClass: "",
  loadBalancerReadyTimeoutMs: "600000",
  loadBalancerReadyIntervalMs: "5000",
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function buildForm(cluster = null) {
  if (!cluster) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    id: cluster.id || "",
    label: cluster.label || "",
    provider: cluster.provider || "kubernetes",
    clusterName: cluster.clusterName || "",
    enabled: cluster.enabled !== false,
    isDefault: Boolean(cluster.isDefault),
    credentialMode: cluster.credentialMode || "mounted_path",
    kubeconfigPath: cluster.kubeconfigPath || "",
    kubeconfigContent: "",
    kubeContext: cluster.kubeContext || "",
    namespace: cluster.namespace || "openclaw-agents",
    openclawNamespace: cluster.openclawNamespace || "",
    hermesNamespace: cluster.hermesNamespace || "",
    exposureMode: cluster.exposureMode || "cluster-ip",
    runtimeHost: cluster.runtimeHost || "",
    runtimeNodePort: cluster.runtimeNodePort ? String(cluster.runtimeNodePort) : "",
    gatewayNodePort: cluster.gatewayNodePort ? String(cluster.gatewayNodePort) : "",
    serviceAnnotationsJson: JSON.stringify(cluster.serviceAnnotations || {}, null, 2),
    loadBalancerSourceRanges: (cluster.loadBalancerSourceRanges || []).join(", "),
    loadBalancerClass: cluster.loadBalancerClass || "",
    loadBalancerReadyTimeoutMs: String(cluster.loadBalancerReadyTimeoutMs || 600000),
    loadBalancerReadyIntervalMs: String(cluster.loadBalancerReadyIntervalMs || 5000),
  };
}

function parseJsonObject(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Service annotations must be a JSON object.");
  }
  return parsed;
}

function buildPayload(form) {
  return {
    id: form.id,
    label: form.label,
    provider: form.provider,
    clusterName: form.clusterName,
    enabled: form.enabled,
    isDefault: form.isDefault,
    credentialMode: form.credentialMode,
    kubeconfigPath: form.credentialMode === "mounted_path" ? form.kubeconfigPath : "",
    kubeconfigContent: form.credentialMode === "encrypted_kubeconfig" ? form.kubeconfigContent : "",
    kubeContext: form.kubeContext,
    namespace: form.namespace,
    openclawNamespace: form.openclawNamespace,
    hermesNamespace: form.hermesNamespace,
    exposureMode: form.exposureMode,
    runtimeHost: form.runtimeHost,
    runtimeNodePort: form.runtimeNodePort,
    gatewayNodePort: form.gatewayNodePort,
    serviceAnnotations: parseJsonObject(form.serviceAnnotationsJson),
    loadBalancerSourceRanges: form.loadBalancerSourceRanges,
    loadBalancerClass: form.loadBalancerClass,
    loadBalancerReadyTimeoutMs: form.loadBalancerReadyTimeoutMs,
    loadBalancerReadyIntervalMs: form.loadBalancerReadyIntervalMs,
  };
}

function statusClass(status) {
  if (status === "ok") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function registryCardClass(cluster, selected) {
  if (!selected) return "border-slate-200 bg-slate-50 hover:bg-white";
  if (cluster.lastTestStatus === "ok") return "border-emerald-300 bg-emerald-50";
  if (cluster.lastTestStatus === "failed") return "border-red-300 bg-red-50";
  return "border-slate-300 bg-white ring-2 ring-slate-100";
}

export default function KubernetesAdminPage() {
  const toast = useToast();
  const [clusters, setClusters] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const selectedIdRef = useRef("");
  const formRef = useRef(null);

  const selectedCluster = useMemo(
    () => clusters.find((cluster) => cluster.id === selectedId) || null,
    [clusters, selectedId],
  );
  const editing = Boolean(selectedCluster);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadClusters = useCallback(
    async (preferredId = "", options = { selectFirst: true }) => {
      const selectFirst = options.selectFirst !== false;
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/admin/kubernetes-clusters");
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.error || "Failed to load Kubernetes clusters");
        const nextClusters = Array.isArray(payload) ? payload : [];
        const desiredId = preferredId ?? selectedIdRef.current;
        setClusters(nextClusters);
        const nextSelected =
          (desiredId && nextClusters.find((cluster) => cluster.id === desiredId)?.id) ||
          (selectFirst ? nextClusters[0]?.id : "") ||
          "";
        setSelectedId(nextSelected);
        if (nextSelected) {
          setForm(buildForm(nextClusters.find((cluster) => cluster.id === nextSelected)));
        } else {
          setForm(EMPTY_FORM);
        }
      } catch (error) {
        console.error("Failed to load Kubernetes clusters:", error);
        toast.error(error.message || "Failed to load Kubernetes clusters");
        setClusters([]);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    loadClusters(undefined, { selectFirst: true });
  }, [loadClusters]);

  useEffect(() => {
    setForm(buildForm(selectedCluster));
  }, [selectedCluster]);

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "label" && !editing && !current.id) {
        next.id = slugify(value);
      }
      return next;
    });
  }

  function startNew() {
    setSelectedId("");
    setForm(EMPTY_FORM);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function saveCluster(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const response = await fetchWithAuth(
        editing
          ? `/api/admin/kubernetes-clusters/${encodeURIComponent(selectedCluster.id)}`
          : "/api/admin/kubernetes-clusters",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "Failed to save Kubernetes cluster");
      toast.success("Kubernetes cluster saved");
      setSelectedId(saved.id);
      await loadClusters(saved.id);
    } catch (error) {
      console.error("Failed to save Kubernetes cluster:", error);
      toast.error(error.message || "Failed to save Kubernetes cluster");
    } finally {
      setSaving(false);
    }
  }

  async function testCluster(clusterId) {
    setTestingId(clusterId);
    try {
      const response = await fetchWithAuth(
        `/api/admin/kubernetes-clusters/${encodeURIComponent(clusterId)}/test`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Kubernetes test failed");
      toast.success(payload.lastTestStatus === "ok" ? "Kubernetes API reachable" : "Test recorded");
      await loadClusters();
    } catch (error) {
      console.error("Failed to test Kubernetes cluster:", error);
      toast.error(error.message || "Failed to test Kubernetes cluster");
    } finally {
      setTestingId("");
    }
  }

  async function setClusterEnabled(enabled) {
    if (!selectedCluster) return;
    setTogglingId(selectedCluster.id);
    try {
      const payload = buildPayload({ ...form, enabled });
      const response = await fetchWithAuth(
        `/api/admin/kubernetes-clusters/${encodeURIComponent(selectedCluster.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "Failed to update Kubernetes cluster");
      toast.success(enabled ? "Kubernetes cluster enabled" : "Kubernetes cluster disabled");
      setForm((current) => ({ ...current, enabled }));
      await loadClusters(saved.id || selectedCluster.id);
    } catch (error) {
      console.error("Failed to update Kubernetes cluster:", error);
      toast.error(error.message || "Failed to update Kubernetes cluster");
    } finally {
      setTogglingId("");
    }
  }

  async function deleteCluster(clusterId) {
    setDeletingId(clusterId);
    try {
      const response = await fetchWithAuth(
        `/api/admin/kubernetes-clusters/${encodeURIComponent(clusterId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Failed to delete Kubernetes cluster");
      toast.success("Kubernetes cluster deleted");
      setSelectedId("");
      setForm(EMPTY_FORM);
      await loadClusters();
    } catch (error) {
      console.error("Failed to delete Kubernetes cluster:", error);
      toast.error(error.message || "Failed to delete Kubernetes cluster");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">
            Runtime Placement
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Kubernetes clusters
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
            Register each cluster Nora can deploy to. Enabled clusters with a passing test appear as
            separate Kubernetes execution targets in the operator Deploy flow.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
        >
          <Plus size={16} />
          Add cluster
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-950">Registry</h2>
            <button
              type="button"
              onClick={() =>
                loadClusters(undefined, { selectFirst: Boolean(selectedIdRef.current) })
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
              title="Refresh clusters"
            >
              <RefreshCw size={15} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              <Loader2 size={16} className="animate-spin text-red-600" />
              Loading clusters
            </div>
          ) : clusters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              No Kubernetes clusters are registered yet.
            </div>
          ) : (
            <div className="space-y-3">
              {clusters.map((cluster) => (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => setSelectedId(cluster.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${registryCardClass(
                    cluster,
                    selectedId === cluster.id,
                  )}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{cluster.label}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {cluster.clusterName || cluster.id}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass(cluster.lastTestStatus)}`}
                    >
                      {cluster.lastTestStatus || "untested"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                      {cluster.providerLabel || cluster.provider}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">
                      {cluster.exposureMode}
                    </span>
                    {cluster.isDefault ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        default
                      </span>
                    ) : null}
                    {!cluster.enabled ? (
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600">
                        disabled
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <form
          ref={formRef}
          onSubmit={saveCluster}
          className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                <Boxes size={20} />
              </span>
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editing ? "Edit cluster" : "Add cluster"}
                </h2>
                <p className="text-xs font-semibold text-slate-500">
                  Execution target id: {form.id ? `k8s:${form.id}` : "k8s:<cluster-id>"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setClusterEnabled(!form.enabled)}
                    disabled={togglingId === selectedCluster.id}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-bold disabled:opacity-60 ${
                      form.enabled
                        ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {togglingId === selectedCluster.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Power size={15} />
                    )}
                    {form.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => testCluster(selectedCluster.id)}
                    disabled={testingId === selectedCluster.id}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {testingId === selectedCluster.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Test
                  </button>
                </>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save
              </button>
            </div>
          </div>

          {selectedCluster?.lastTestStatus === "failed" ? (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <p className="font-semibold">{selectedCluster.lastTestMessage}</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Cluster id">
              <input
                value={form.id}
                onChange={(event) => updateField("id", slugify(event.target.value))}
                disabled={editing}
                className="input"
                placeholder="aks-eastus2"
              />
            </Field>
            <Field label="Label">
              <input
                value={form.label}
                onChange={(event) => updateField("label", event.target.value)}
                className="input"
                placeholder="AKS East US 2"
              />
            </Field>
            <Field label="Provider">
              <select
                value={form.provider}
                onChange={(event) => updateField("provider", event.target.value)}
                className="input"
              >
                <option value="kubernetes">Generic Kubernetes</option>
                <option value="k3s">K3s</option>
                <option value="aks">AKS</option>
                <option value="gke">GKE</option>
                <option value="eks">EKS</option>
              </select>
            </Field>
            <Field label="Actual cluster name">
              <input
                value={form.clusterName}
                onChange={(event) => updateField("clusterName", event.target.value)}
                className="input"
                placeholder="nora-dns-vjb9kjjz"
              />
            </Field>
            <Field label="Credential mode">
              <select
                value={form.credentialMode}
                onChange={(event) => updateField("credentialMode", event.target.value)}
                className="input"
              >
                <option value="mounted_path">Mounted kubeconfig path</option>
                <option value="encrypted_kubeconfig">Encrypted kubeconfig</option>
              </select>
            </Field>
            <Field label="Kube context">
              <input
                value={form.kubeContext}
                onChange={(event) => updateField("kubeContext", event.target.value)}
                className="input"
                placeholder="optional"
              />
            </Field>

            {form.credentialMode === "mounted_path" ? (
              <Field label="Kubeconfig path" wide>
                <input
                  value={form.kubeconfigPath}
                  onChange={(event) => updateField("kubeconfigPath", event.target.value)}
                  className="input"
                  placeholder="/kubeconfigs/aks-eastus2"
                />
              </Field>
            ) : (
              <Field label="Kubeconfig content" wide>
                <textarea
                  value={form.kubeconfigContent}
                  onChange={(event) => updateField("kubeconfigContent", event.target.value)}
                  className="input min-h-32 font-mono text-xs"
                  placeholder={
                    editing ? "Leave empty to keep the stored kubeconfig" : "Paste kubeconfig YAML"
                  }
                />
              </Field>
            )}

            <Field label="Fallback namespace">
              <input
                value={form.namespace}
                onChange={(event) => updateField("namespace", event.target.value)}
                className="input"
              />
            </Field>
            <Field label="OpenClaw namespace">
              <input
                value={form.openclawNamespace}
                onChange={(event) => updateField("openclawNamespace", event.target.value)}
                className="input"
                placeholder={form.namespace}
              />
            </Field>
            <Field label="Hermes namespace">
              <input
                value={form.hermesNamespace}
                onChange={(event) => updateField("hermesNamespace", event.target.value)}
                className="input"
                placeholder={form.namespace}
              />
            </Field>
            <Field label="Exposure mode">
              <select
                value={form.exposureMode}
                onChange={(event) => updateField("exposureMode", event.target.value)}
                className="input"
              >
                <option value="cluster-ip">ClusterIP</option>
                <option value="node-port">NodePort</option>
                <option value="load-balancer">LoadBalancer</option>
              </select>
            </Field>
            <Field label="Runtime host">
              <input
                value={form.runtimeHost}
                onChange={(event) => updateField("runtimeHost", event.target.value)}
                className="input"
                placeholder="NodePort host only"
              />
            </Field>
            <Field label="Runtime node port">
              <input
                value={form.runtimeNodePort}
                onChange={(event) => updateField("runtimeNodePort", event.target.value)}
                className="input"
                inputMode="numeric"
              />
            </Field>
            <Field label="Gateway node port">
              <input
                value={form.gatewayNodePort}
                onChange={(event) => updateField("gatewayNodePort", event.target.value)}
                className="input"
                inputMode="numeric"
              />
            </Field>
            <Field label="Load balancer class">
              <input
                value={form.loadBalancerClass}
                onChange={(event) => updateField("loadBalancerClass", event.target.value)}
                className="input"
              />
            </Field>
            <Field label="Source ranges">
              <input
                value={form.loadBalancerSourceRanges}
                onChange={(event) => updateField("loadBalancerSourceRanges", event.target.value)}
                className="input"
                placeholder="203.0.113.10/32, 198.51.100.0/24"
              />
            </Field>
            <Field label="LB timeout ms">
              <input
                value={form.loadBalancerReadyTimeoutMs}
                onChange={(event) => updateField("loadBalancerReadyTimeoutMs", event.target.value)}
                className="input"
                inputMode="numeric"
              />
            </Field>
            <Field label="LB interval ms">
              <input
                value={form.loadBalancerReadyIntervalMs}
                onChange={(event) => updateField("loadBalancerReadyIntervalMs", event.target.value)}
                className="input"
                inputMode="numeric"
              />
            </Field>
            <Field label="Service annotations JSON" wide>
              <textarea
                value={form.serviceAnnotationsJson}
                onChange={(event) => updateField("serviceAnnotationsJson", event.target.value)}
                className="input min-h-28 font-mono text-xs"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => updateField("enabled", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Enabled
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => updateField("isDefault", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Default target
              </label>
            </div>
            {editing ? (
              <button
                type="button"
                onClick={() => deleteCluster(selectedCluster.id)}
                disabled={deletingId === selectedCluster.id}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {deletingId === selectedCluster.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0.75rem 0.9rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: rgb(15 23 42);
          outline: none;
        }
        .input:focus {
          border-color: rgb(248 113 113);
          background: white;
          box-shadow: 0 0 0 3px rgb(248 113 113 / 0.16);
        }
        .input:disabled {
          opacity: 0.65;
        }
      `}</style>
    </AdminLayout>
  );
}

function Field({ label, children, wide = false }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
