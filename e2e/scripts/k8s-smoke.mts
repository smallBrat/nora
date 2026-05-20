#!/usr/bin/env tsx
// @ts-nocheck
import { execFileSync } from "node:child_process";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4100";
const K8S_NAMESPACE = process.env.K8S_NAMESPACE || "openclaw-agents";
const KUBECTL_BIN = process.env.KUBECTL_BIN || "kubectl";
const POLL_INTERVAL_MS = Number.parseInt(process.env.K8S_SMOKE_POLL_MS || "5000", 10);
// First boot can spend several minutes installing OpenClaw and bundled plugins.
const POLL_TIMEOUT_MS = Number.parseInt(process.env.K8S_SMOKE_TIMEOUT_MS || "600000", 10);
const RUNTIME_FAMILIES = (process.env.K8S_SMOKE_RUNTIME_FAMILIES || "openclaw")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const RUNTIMES = {
  openclaw: {
    label: "OpenClaw",
    deploymentName: (agentId) => `oclaw-agent-${agentId}`,
    embedPath: (agentId, token) =>
      `/agents/${agentId}/gateway/embed?token=${encodeURIComponent(token)}`,
  },
  hermes: {
    label: "Hermes",
    deploymentName: (agentId) => `hermes-agent-${agentId}`,
    embedPath: (agentId, token) =>
      `/agents/${agentId}/hermes-ui/embed?token=${encodeURIComponent(token)}`,
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(path, { method = "GET", token = null, body, expectOk = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (expectOk && !response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }

  return { response, body: parsed };
}

function kubectl(...args) {
  return execFileSync(KUBECTL_BIN, args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function waitForAgentStatus(token, agentId, allowedStatuses) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const { body } = await api(`/agents/${agentId}`, { token });
    if (allowedStatuses.includes(body.status)) {
      return body;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for agent ${agentId} to reach one of: ${allowedStatuses.join(", ")}`);
}

async function waitForGateway(token, agentId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const { response } = await api(`/agents/${agentId}/gateway/status`, {
      token,
      expectOk: false,
    });
    if (response.ok) return;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for gateway readiness on agent ${agentId}`);
}

async function waitForHermesUi(token, agentId) {
  const startedAt = Date.now();
  let last = null;

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const { response, body } = await api(`/agents/${agentId}/hermes-ui`, {
      token,
      expectOk: false,
    });
    last = body;
    if (response.ok && body?.health?.ok && body?.dashboard?.ready) return;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Hermes UI readiness on agent ${agentId}; last response: ${JSON.stringify(
      last
    )}`
  );
}

async function waitForRuntimeSurface(token, agent) {
  if (agent.runtime_family === "hermes") {
    await waitForHermesUi(token, agent.id);
    return;
  }
  await waitForGateway(token, agent.id);
}

function assertK8sResources(runtimeFamily, agentId) {
  const runtime = RUNTIMES[runtimeFamily];
  kubectl("get", "deployment", runtime.deploymentName(agentId), "-n", K8S_NAMESPACE);
  kubectl("get", "service", runtime.deploymentName(agentId), "-n", K8S_NAMESPACE);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

async function fetchRuntimeEmbed(runtimeFamily, agentId, token) {
  const runtime = RUNTIMES[runtimeFamily];
  const embedResponse = await fetch(`${API_BASE_URL}${runtime.embedPath(agentId, token)}`);
  if (!embedResponse.ok) {
    throw new Error(`${runtime.label} embed returned ${embedResponse.status}`);
  }
}

async function main() {
  const stamp = Date.now();
  const email = `k8s-smoke-${stamp}@example.com`;
  const password = "SmokePassword123!";
  let token = null;
  const agentIds = [];
  const results = [];

  try {
    const unsupportedRuntime = RUNTIME_FAMILIES.find((runtimeFamily) => !RUNTIMES[runtimeFamily]);
    if (unsupportedRuntime) {
      throw new Error(
        `Unsupported K8S_SMOKE_RUNTIME_FAMILIES entry: ${unsupportedRuntime}. Supported values: ${Object.keys(
          RUNTIMES
        ).join(", ")}`
      );
    }

    await api("/auth/signup", {
      method: "POST",
      body: { email, password },
    });

    const login = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    token = login.body.token;

    for (const runtimeFamily of RUNTIME_FAMILIES) {
      const runtime = RUNTIMES[runtimeFamily];
      const deploy = await api("/agents/deploy", {
        method: "POST",
        token,
        body: {
          name: `${runtime.label} K8s Smoke ${stamp}`,
          runtime_family: runtimeFamily,
          backend_type: "k8s",
          deploy_target: "k8s",
        },
      });
      const agentId = deploy.body.id;
      agentIds.push(agentId);

      const runningAgent = await waitForAgentStatus(token, agentId, [
        "running",
        "warning",
        "error",
      ]);
      if (runningAgent.status === "error") {
        throw new Error(`Agent ${agentId} entered error state`);
      }
      if (runningAgent.runtime_family !== runtimeFamily) {
        throw new Error(
          `Expected runtime_family=${runtimeFamily}, received ${runningAgent.runtime_family}`
        );
      }
      if (runningAgent.backend_type !== "k8s") {
        throw new Error(`Expected backend_type=k8s, received ${runningAgent.backend_type}`);
      }

      assertK8sResources(runtimeFamily, agentId);

      let surfaceUrl = null;
      if (runtimeFamily === "openclaw") {
        const gatewayUrl = await api(`/agents/${agentId}/gateway-url`, { token });
        surfaceUrl = gatewayUrl.body.url;
        if (!isHttpUrl(surfaceUrl)) {
          throw new Error(`Unexpected gateway URL payload: ${JSON.stringify(gatewayUrl.body)}`);
        }
      } else {
        const hermesUi = await api(`/agents/${agentId}/hermes-ui`, { token });
        surfaceUrl = hermesUi.body?.dashboard?.url || hermesUi.body?.url;
        if (!isHttpUrl(surfaceUrl)) {
          throw new Error(`Unexpected Hermes UI payload: ${JSON.stringify(hermesUi.body)}`);
        }
      }

      await waitForRuntimeSurface(token, runningAgent);
      await fetchRuntimeEmbed(runtimeFamily, agentId, token);

      await api(`/agents/${agentId}/stop`, { method: "POST", token });
      await waitForAgentStatus(token, agentId, ["stopped"]);

      await api(`/agents/${agentId}/start`, { method: "POST", token });
      const restartedAgent = await waitForAgentStatus(token, agentId, ["running", "warning"]);
      await waitForRuntimeSurface(token, restartedAgent);

      await api(`/agents/${agentId}/restart`, { method: "POST", token });
      const restartedAgainAgent = await waitForAgentStatus(token, agentId, ["running", "warning"]);
      await waitForRuntimeSurface(token, restartedAgainAgent);

      results.push({
        runtimeFamily,
        agentId,
        surfaceUrl,
        deployment: runtime.deploymentName(agentId),
      });
    }

    console.log(JSON.stringify({
      ok: true,
      agents: results,
      namespace: K8S_NAMESPACE,
    }));
  } finally {
    if (token) {
      for (const agentId of agentIds.reverse()) {
        await api(`/agents/${agentId}`, {
          method: "DELETE",
          token,
          expectOk: false,
        });
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
