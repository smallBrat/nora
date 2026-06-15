// @ts-nocheck
/**
 * embedAgentColumns.ts — the agent-row columns the embed proxies must load.
 *
 * Both embed proxies resolve their upstream target through the gateway SSRF
 * allowlist (gatewayProxy.resolveSafe*Target → allowedGatewayHostsForAgent →
 * resolveHermesDashboardAddress). That allowlist authorizes the target by
 * reading several agent fields off the row the embed lookup returns:
 *
 *   - deploy_target        routes the docker vs k8s vs remote-docker policy
 *   - execution_target_id  looks up the agent's registered remote host
 *   - user_id              owner-scopes that remote host (cross-tenant guard)
 *   - gateway_host/_port   k8s/remote exposure address (LoadBalancer/NodePort)
 *   - runtime_host/_port   the Hermes dashboard host (local container)
 *
 * A lookup that omits any of these silently mis-authorizes the target — e.g. a
 * remote-docker agent gets normalized to "docker" and its registered host is
 * rejected, or (worse) the owner check short-circuits because user_id is
 * undefined. Keep these lists in sync with what allowedGatewayHostsForAgent /
 * resolveHermesDashboardAddress actually consume.
 */

// Hermes dashboard embed proxy (server.ts proxyEmbeddedHermes →
// resolveSafeHermesDashboardTarget).
const HERMES_EMBED_AGENT_COLUMNS = [
  "host",
  "runtime_host",
  "runtime_port",
  "status",
  "runtime_family",
  "backend_type",
  "deploy_target",
  "execution_target_id",
  "user_id",
  "gateway_host",
  "gateway_port",
];

// OpenClaw gateway embed proxy (server.ts proxyEmbeddedGateway). The SSRF
// allowlist is not yet wired into this path; the deploy_target/execution_target_id/
// user_id fields will be added here when it is (so the same owner-scoped policy
// applies), mirroring HERMES_EMBED_AGENT_COLUMNS.
const GATEWAY_EMBED_AGENT_COLUMNS = [
  "host",
  "gateway_token",
  "gateway_host_port",
  "gateway_host",
  "gateway_port",
  "status",
];

module.exports = { HERMES_EMBED_AGENT_COLUMNS, GATEWAY_EMBED_AGENT_COLUMNS };
