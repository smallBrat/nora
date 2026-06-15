import { useState, useEffect, useCallback } from "react";
import Layout from "../../components/layout/Layout";
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  PlugZap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { fetchWithAuth } from "../../lib/api";
import { useToast } from "../../components/Toast";

const EMPTY_FORM = {
  id: "",
  label: "",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshAuthMode: "key",
  sshPrivateKey: "",
  sshPassphrase: "",
  sshPassword: "",
  gatewayHost: "",
};

function sshTarget(host) {
  const user = host.sshUser ? `${host.sshUser}@` : "";
  const port = host.sshPort && host.sshPort !== 22 ? `:${host.sshPort}` : "";
  return `${user}${host.sshHost || "—"}${port}`;
}

function StatusBadge({ host }) {
  if (!host.enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        Disabled
      </span>
    );
  }
  if (host.connected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 size={12} /> Connected
      </span>
    );
  }
  if (!host.configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle size={12} /> Needs setup
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      <XCircle size={12} /> Untested
    </span>
  );
}

export default function RemoteHostsPage() {
  const toast = useToast();
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const editing = Boolean(editingId);

  const loadHosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/remote-hosts");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      setHosts(await res.json());
    } catch (error) {
      toast.error(error.message || "Failed to load remote hosts");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId("");
  }

  function startEdit(host) {
    setEditingId(host.id);
    setForm({
      ...EMPTY_FORM,
      id: host.id,
      label: host.label || "",
      sshHost: host.sshHost || "",
      sshPort: String(host.sshPort || 22),
      sshUser: host.sshUser || "",
      sshAuthMode: host.sshAuthMode || "key",
      gatewayHost: host.gatewayHost && host.gatewayHost !== host.sshHost ? host.gatewayHost : "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveHost(event) {
    event.preventDefault();
    if (!form.sshHost.trim() || !form.sshUser.trim()) {
      toast.error("SSH host and username are required");
      return;
    }
    setSaving(true);
    try {
      // On edit, blank secret fields are preserved server-side, so we only send
      // what the operator actually typed.
      const payload: Record<string, unknown> = {
        label: form.label,
        sshHost: form.sshHost,
        sshPort: Number(form.sshPort) || 22,
        sshUser: form.sshUser,
        sshAuthMode: form.sshAuthMode,
        gatewayHost: form.gatewayHost,
      };
      if (!editing) payload.id = form.id || form.label;
      if (form.sshAuthMode === "password") {
        if (form.sshPassword) payload.sshPassword = form.sshPassword;
      } else {
        if (form.sshPrivateKey) payload.sshPrivateKey = form.sshPrivateKey;
        if (form.sshPassphrase) payload.sshPassphrase = form.sshPassphrase;
      }
      const res = await fetchWithAuth(
        editing ? `/api/remote-hosts/${encodeURIComponent(editingId)}` : "/api/remote-hosts",
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success(editing ? "Remote host updated" : "Remote host registered");
      resetForm();
      await loadHosts();
    } catch (error) {
      toast.error(error.message || "Failed to save remote host");
    } finally {
      setSaving(false);
    }
  }

  async function testHost(host) {
    setTestingId(host.id);
    try {
      const res = await fetchWithAuth(`/api/remote-hosts/${encodeURIComponent(host.id)}/test`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Test failed");
      if (payload.lastTestStatus === "ok") toast.success("Docker is reachable over SSH");
      else toast.error(payload.lastTestMessage || "Connection test failed");
      await loadHosts();
    } catch (error) {
      toast.error(error.message || "Connection test failed");
    } finally {
      setTestingId("");
    }
  }

  async function deleteHost(host) {
    if (typeof window !== "undefined" && !window.confirm(`Delete remote host "${host.label}"?`)) {
      return;
    }
    setDeletingId(host.id);
    try {
      const res = await fetchWithAuth(`/api/remote-hosts/${encodeURIComponent(host.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed");
      toast.success("Remote host deleted");
      if (editingId === host.id) resetForm();
      await loadHosts();
    } catch (error) {
      toast.error(error.message || "Failed to delete remote host");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
            <Server size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Remote Hosts</h1>
            <p className="text-sm text-slate-500">
              Register your own machines (Mac, VPS, or cloud instances) so Nora can deploy agents to
              them over SSH. Credentials are encrypted at rest.
            </p>
          </div>
        </div>

        {/* Add / edit form */}
        <form
          onSubmit={saveHost}
          className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {editing ? `Edit "${form.label || editingId}"` : "Register a remote host"}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Label</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => updateField("label", e.target.value)}
                placeholder="My Laptop"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Gateway address <span className="text-slate-400">(optional)</span>
              </span>
              <input
                type="text"
                value={form.gatewayHost}
                onChange={(e) => updateField("gatewayHost", e.target.value)}
                placeholder="defaults to the SSH host"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">SSH host</span>
              <input
                type="text"
                value={form.sshHost}
                onChange={(e) => updateField("sshHost", e.target.value)}
                placeholder="192.168.1.50 or host.example.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-1 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Port</span>
                <input
                  type="number"
                  value={form.sshPort}
                  onChange={(e) => updateField("sshPort", e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1 block text-sm font-medium text-slate-700">SSH user</span>
                <input
                  type="text"
                  value={form.sshUser}
                  onChange={(e) => updateField("sshUser", e.target.value)}
                  placeholder="operator"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Authentication</span>
              <select
                value={form.sshAuthMode}
                onChange={(e) => updateField("sshAuthMode", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              >
                <option value="key">SSH private key</option>
                <option value="password">Password</option>
              </select>
            </label>
          </div>

          {form.sshAuthMode === "password" ? (
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">SSH password</span>
              <input
                type="password"
                value={form.sshPassword}
                onChange={(e) => updateField("sshPassword", e.target.value)}
                placeholder={editing ? "Leave blank to keep the stored password" : ""}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              />
            </label>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  SSH private key
                </span>
                <textarea
                  value={form.sshPrivateKey}
                  onChange={(e) => updateField("sshPrivateKey", e.target.value)}
                  rows={5}
                  placeholder={
                    editing
                      ? "Leave blank to keep the stored key"
                      : "-----BEGIN OPENSSH PRIVATE KEY-----"
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs"
                />
              </label>
              <label className="block max-w-sm">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Key passphrase <span className="text-slate-400">(optional)</span>
                </span>
                <input
                  type="password"
                  value={form.sshPassphrase}
                  onChange={(e) => updateField("sshPassphrase", e.target.value)}
                  placeholder={editing ? "Leave blank to keep" : ""}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
                />
              </label>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {editing ? "Save changes" : "Register host"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Host list */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Your hosts</h2>
          <button
            onClick={loadHosts}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading remote hosts…
          </div>
        ) : hosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No remote hosts yet. Register one above to deploy agents to your own machine.
          </div>
        ) : (
          <div className="space-y-3">
            {hosts.map((host) => (
              <div
                key={host.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{host.label}</span>
                      <StatusBadge host={host} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {sshTarget(host)} · {host.executionTargetId}
                    </p>
                    {host.lastTestStatus === "failed" && host.lastTestMessage && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        {host.lastTestMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => testHost(host)}
                      disabled={testingId === host.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {testingId === host.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <PlugZap size={14} />
                      )}
                      Test
                    </button>
                    <button
                      onClick={() => startEdit(host)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteHost(host)}
                      disabled={deletingId === host.id}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-60"
                      aria-label="Delete host"
                    >
                      {deletingId === host.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
