// @ts-nocheck
// Resolves the bearer headers for calling an agent's runtime sidecar (:9090),
// which authenticates every route except /health with the per-agent gateway
// token. Most agent objects passed around the backend already carry
// gateway_token, but some loading queries omit it (e.g. the auth-sync query);
// fall back to a cheap indexed lookup so no caller path can silently send an
// empty token and get a 401.

const db = require("./db");
const { buildRuntimeAuthHeaders } = require("../agent-runtime/lib/agentEndpoints");

async function runtimeAuthHeaders(agent) {
  let token = agent && agent.gateway_token ? agent.gateway_token : null;
  if (!token && agent && agent.id) {
    try {
      const result = await db.query("SELECT gateway_token FROM agents WHERE id = $1", [agent.id]);
      token = result.rows[0]?.gateway_token || null;
    } catch {
      token = null;
    }
  }
  return buildRuntimeAuthHeaders(token);
}

module.exports = { runtimeAuthHeaders };
