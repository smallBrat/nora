import ActiveIntegrationRow from "./ActiveIntegrationRow";

export default function ActiveIntegrationsPanel({ integrations, selectedId, onSelect }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Active Integrations</h3>
          <p className="mt-1 text-xs text-slate-500">
            Connected integrations appear here with their latest health state.
          </p>
        </div>
        <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">
          {integrations.length} connected
        </div>
      </div>
      <div className="space-y-3">
        {integrations.map((integration: any) => (
          <ActiveIntegrationRow
            key={integration.id}
            integration={integration}
            selected={integration.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
