const AGENT_DATA_CHANGED_EVENT = "nora:agent-data-changed";

type AgentDataChangedDetail = {
  agentId: string;
  scope?: "integrations" | "cron" | "all";
};

export function emitAgentDataChanged(detail: AgentDataChangedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENT_DATA_CHANGED_EVENT, { detail }));
}

export function subscribeToAgentDataChanged(
  agentId: string,
  onChange: (detail: AgentDataChangedDetail) => void,
) {
  if (typeof window === "undefined") return () => {};

  function handleEvent(event: Event) {
    const detail = (event as CustomEvent<AgentDataChangedDetail>).detail;
    if (!detail || detail.agentId !== agentId) return;
    onChange(detail);
  }

  window.addEventListener(AGENT_DATA_CHANGED_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(AGENT_DATA_CHANGED_EVENT, handleEvent as EventListener);
  };
}
