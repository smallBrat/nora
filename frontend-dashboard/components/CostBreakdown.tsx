import { Calculator } from "lucide-react";
import type { AgentCostEntry } from "../lib/workspaceClient";

function formatUsd(value?: number | null): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value?: number | null): string {
  return Number(value || 0).toLocaleString();
}

function formatRate(value?: number | null): string {
  return value === undefined || value === null ? "fallback" : `$${Number(value).toFixed(6)}`;
}

function rateSourceLabel(source?: string | null): string {
  switch (source) {
    case "model":
      return "model split";
    case "model_total":
      return "model total";
    case "fallback":
      return "fallback";
    case "unknown":
      return "unknown model";
    default:
      return source || "fallback";
  }
}

export default function CostBreakdown({ agent }: { agent: AgentCostEntry }) {
  const tokenDetails = agent.cost_details?.tokens || {};
  const models = tokenDetails.models || [];

  return (
    <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-black uppercase text-slate-500">
        <Calculator size={14} className="text-blue-600" />
        Token usage details
      </summary>

      <div className="mt-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-slate-400">Tokens by model</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatNumber(tokenDetails.input_tokens)} input ·{" "}
                {formatNumber(tokenDetails.output_tokens)} output ·{" "}
                {formatNumber(tokenDetails.total_tokens ?? agent.total_tokens)} total
              </p>
            </div>
            <p className="text-sm font-black text-slate-900">{formatUsd(agent.token_cost)}</p>
          </div>

          {models.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
              No token usage recorded for this date range.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-400">
                  <tr>
                    <th className="py-2 pr-4 font-black uppercase">Model</th>
                    <th className="py-2 pr-4 font-black uppercase">Input</th>
                    <th className="py-2 pr-4 font-black uppercase">Output</th>
                    <th className="py-2 pr-4 font-black uppercase">Total</th>
                    <th className="py-2 pr-4 font-black uppercase">Rates</th>
                    <th className="py-2 pr-4 text-right font-black uppercase">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {models.map((model) => (
                    <tr key={`${model.provider || "none"}:${model.model}`}>
                      <td className="max-w-[220px] py-3 pr-4">
                        <p className="truncate font-bold text-slate-900">{model.model}</p>
                        <p className="text-slate-400">
                          {model.provider || "no provider"} · {rateSourceLabel(model.rate_source)}
                        </p>
                      </td>
                      <td className="py-3 pr-4">{formatNumber(model.input_tokens)}</td>
                      <td className="py-3 pr-4">{formatNumber(model.output_tokens)}</td>
                      <td className="py-3 pr-4">{formatNumber(model.total_tokens)}</td>
                      <td className="py-3 pr-4">
                        <span>in {formatRate(model.rates?.input_per_1k)}</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span>out {formatRate(model.rates?.output_per_1k)}</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span>total {formatRate(model.rates?.per_1k)}</span>
                      </td>
                      <td className="py-3 pr-4 text-right font-black text-slate-900">
                        {formatUsd(model.token_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
