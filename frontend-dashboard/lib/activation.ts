import { fetchWithAuth } from "./api";

const VALIDATED_AGENTS_KEY = "nora.activation.validatedAgents.v1";
const VALIDATION_EVENT = "nora:agent-validated";

type ValidationSource = "openclaw_chat" | "hermes_chat" | "chat_history" | string;

type ValidationRecord = {
  agentId: string;
  source: ValidationSource;
  validatedAt: string;
};

type ValidationState = Record<string, ValidationRecord>;

function readValidationState(): ValidationState {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VALIDATED_AGENTS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeValidationState(state: ValidationState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VALIDATED_AGENTS_KEY, JSON.stringify(state));
  } catch {
    // Local storage can be blocked in private or restricted browser contexts.
  }
}

export function hasValidatedAgent(agentId?: string | null) {
  const state = readValidationState();
  if (agentId) return Boolean(state[agentId]);
  return Object.keys(state).length > 0;
}

export function markAgentValidated(agentId: string | null | undefined, source: ValidationSource) {
  if (!agentId || typeof window === "undefined") return;

  const state = readValidationState();
  const record = {
    agentId,
    source,
    validatedAt: new Date().toISOString(),
  };
  writeValidationState({
    ...state,
    [agentId]: record,
  });
  window.dispatchEvent(new CustomEvent(VALIDATION_EVENT, { detail: record }));
}

export async function markAgentValidatedFromGatewayHistory(agentId: string | null | undefined) {
  if (!agentId) return false;

  try {
    const sessionsRes = await fetchWithAuth(`/api/agents/${agentId}/gateway/sessions`);
    if (!sessionsRes.ok) return false;

    const data = await sessionsRes.json().catch(() => null);
    const sessions = Array.isArray(data) ? data : data?.sessions || [];
    const main = sessions.find((session) => session.key === "main") || sessions[0];
    const key = main?.key || main?.id || null;
    if (!key) return false;

    const sessionRes = await fetchWithAuth(
      `/api/agents/${agentId}/gateway/sessions/${encodeURIComponent(key)}`,
    );
    if (!sessionRes.ok) return false;

    const session = await sessionRes.json().catch(() => null);
    const history = session?.messages || session?.history || session?.conversation || [];
    if (!Array.isArray(history)) return false;

    const hasUser = history.some((message) =>
      ["user", "human"].includes(String(message?.role || message?.type || "").toLowerCase()),
    );
    const hasAssistant = history.some((message) =>
      ["assistant", "ai"].includes(String(message?.role || message?.type || "").toLowerCase()),
    );

    if (!hasUser || !hasAssistant) return false;
    markAgentValidated(agentId, "chat_history");
    return true;
  } catch {
    return false;
  }
}

export function subscribeAgentValidation(listener: (record?: ValidationRecord) => void) {
  if (typeof window === "undefined") return () => {};

  const handleValidation = (event: Event) => {
    listener((event as CustomEvent<ValidationRecord>).detail);
  };
  const handleStorage = () => listener();
  window.addEventListener(VALIDATION_EVENT, handleValidation);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(VALIDATION_EVENT, handleValidation);
    window.removeEventListener("storage", handleStorage);
  };
}
