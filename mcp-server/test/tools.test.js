import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";
import { ApiError } from "../src/client.js";

// Records calls and replays canned responses keyed by "METHOD path".
function mockApi(responses = {}) {
  const calls = [];
  function respond(method, path, opts) {
    calls.push({ method, path, opts });
    const key = `${method} ${path}`;
    if (key in responses) {
      const value = responses[key];
      if (value instanceof Error) return Promise.reject(value);
      return Promise.resolve(value);
    }
    return Promise.resolve({ ok: true, key });
  }
  return {
    calls,
    get: (path, opts) => respond("GET", path, opts),
    post: (path, body, opts) => respond("POST", path, { ...(opts || {}), body }),
    delete: (path, opts) => respond("DELETE", path, opts),
  };
}

async function connect(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test("registers read and write tools; delete_agent only when destructive is allowed", async () => {
  const api = mockApi();
  const safe = await connect(createServer({ api, env: {} }));
  const safeNames = (await safe.listTools()).tools.map((t) => t.name).sort();
  assert.ok(safeNames.includes("list_agents"));
  assert.ok(safeNames.includes("deploy_agent"));
  assert.ok(safeNames.includes("get_agent_cost"));
  assert.ok(!safeNames.includes("delete_agent"));

  const destructive = await connect(
    createServer({ api, env: { NORA_MCP_ALLOW_DESTRUCTIVE: "true" } }),
  );
  const destructiveNames = (await destructive.listTools()).tools.map((t) => t.name);
  assert.ok(destructiveNames.includes("delete_agent"));
});

test("list_agents returns raw API JSON and passes scope", async () => {
  const agents = [{ id: "a1", name: "Ops", status: "running" }];
  const api = mockApi({ "GET /api/agents": agents });
  const client = await connect(createServer({ api, env: {} }));
  const result = await client.callTool({ name: "list_agents", arguments: { scope: "owned" } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), agents);
  assert.deepEqual(api.calls[0], {
    method: "GET",
    path: "/api/agents",
    opts: { query: { scope: "owned" } },
  });
});

test("deploy_agent forwards the request body to /api/agents/deploy", async () => {
  const api = mockApi({ "POST /api/agents/deploy": { id: "new", status: "queued" } });
  const client = await connect(createServer({ api, env: {} }));
  const result = await client.callTool({
    name: "deploy_agent",
    arguments: { name: "Researcher", runtime_family: "openclaw", vcpu: 2, ram_mb: 4096 },
  });
  assert.deepEqual(JSON.parse(result.content[0].text), { id: "new", status: "queued" });
  assert.equal(api.calls[0].path, "/api/agents/deploy");
  assert.deepEqual(api.calls[0].opts.body, {
    name: "Researcher",
    runtime_family: "openclaw",
    vcpu: 2,
    ram_mb: 4096,
  });
});

test("lifecycle tools hit the expected endpoints", async () => {
  const api = mockApi();
  const client = await connect(createServer({ api, env: { NORA_MCP_ALLOW_DESTRUCTIVE: "true" } }));
  await client.callTool({ name: "start_agent", arguments: { id: "a1" } });
  await client.callTool({ name: "stop_agent", arguments: { id: "a1" } });
  await client.callTool({ name: "restart_agent", arguments: { id: "a1" } });
  await client.callTool({ name: "redeploy_agent", arguments: { id: "a1" } });
  await client.callTool({ name: "delete_agent", arguments: { id: "a1" } });
  assert.deepEqual(
    api.calls.map((c) => `${c.method} ${c.path}`),
    [
      "POST /api/agents/a1/start",
      "POST /api/agents/a1/stop",
      "POST /api/agents/a1/restart",
      "POST /api/agents/a1/redeploy",
      "DELETE /api/agents/a1",
    ],
  );
});

test("per-agent observability tools use the /api/agents/:id paths", async () => {
  const api = mockApi();
  const client = await connect(createServer({ api, env: {} }));
  await client.callTool({
    name: "get_agent_metrics",
    arguments: { id: "a1", type: "token_usage" },
  });
  await client.callTool({ name: "get_agent_metrics_summary", arguments: { id: "a1" } });
  await client.callTool({ name: "get_agent_cost", arguments: { id: "a1", periodDays: 7 } });
  assert.equal(api.calls[0].path, "/api/agents/a1/metrics");
  assert.deepEqual(api.calls[0].opts.query, { type: "token_usage" });
  assert.equal(api.calls[1].path, "/api/agents/a1/metrics/summary");
  assert.equal(api.calls[2].path, "/api/agents/a1/cost");
  assert.deepEqual(api.calls[2].opts.query, { periodDays: 7 });
});

test("API errors surface as isError tool results with status and message", async () => {
  const api = mockApi({
    "GET /api/agents/missing": new ApiError(404, "Agent not found"),
  });
  const client = await connect(createServer({ api, env: {} }));
  const result = await client.callTool({ name: "get_agent", arguments: { id: "missing" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Nora API error 404: Agent not found/);
});

test("tool annotations mark reads read-only and destructive writes destructive", async () => {
  const client = await connect(createServer({ api: mockApi(), env: {} }));
  const tools = (await client.listTools()).tools;
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.equal(byName.list_agents.annotations.readOnlyHint, true);
  assert.equal(byName.get_platform_metrics.annotations.readOnlyHint, true);
  assert.equal(byName.stop_agent.annotations.destructiveHint, true);
  assert.equal(byName.deploy_agent.annotations.destructiveHint, false);
});
