// @ts-nocheck
// Coverage for the scheduled-run executor: action dispatch (prompt/lifecycle),
// failure -> markRun + throw (so BullMQ retries), and missing-agent handling.

const mockDb = { query: jest.fn() };
jest.mock("../db", () => mockDb);

const mockMarkRun = jest.fn().mockResolvedValue(undefined);
jest.mock("../agentSchedules", () => ({ markRun: mockMarkRun }));

const mockLogEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("../monitoring", () => ({ logEvent: mockLogEvent }));

const mockRecordTokenUsage = jest.fn().mockResolvedValue(undefined);
jest.mock("../metrics", () => ({ recordTokenUsage: mockRecordTokenUsage }));

const mockContainer = {
  restart: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
};
jest.mock("../containerManager", () => mockContainer);

const mockAddDeploymentJob = jest.fn().mockResolvedValue(undefined);
jest.mock("../redisQueue", () => ({ addDeploymentJob: mockAddDeploymentJob }));

const mockRpcCall = jest.fn().mockResolvedValue({ result: { message: { usage: {} } } });
jest.mock("../gatewayProxy", () => ({ rpcCall: mockRpcCall }));

jest.mock("../runtimeAuth", () => ({ runtimeAuthHeaders: jest.fn().mockResolvedValue({}) }));
jest.mock("../agentRuntimeFields", () => ({
  resolveAgentRuntimeFamily: (a) => a.runtime_family || "openclaw",
}));
jest.mock("../../agent-runtime/lib/agentEndpoints", () => ({
  runtimeUrlForAgent: (a, p) => `http://runtime${p}`,
}));

const { runScheduledAction } = require("../scheduleRunner");

const OPENCLAW_AGENT = { id: "a1", name: "Op", user_id: "u1", runtime_family: "openclaw" };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue({ rows: [OPENCLAW_AGENT] });
});

it("delivers a prompt to an OpenClaw agent via rpcCall and records the run", async () => {
  const out = await runScheduledAction({
    scheduleId: "s1",
    agentId: "a1",
    actionType: "prompt",
    prompt: "hello",
    createdBy: "u1",
  });
  expect(out).toEqual({ ok: true, status: "success" });
  expect(mockRpcCall).toHaveBeenCalledWith(
    OPENCLAW_AGENT,
    "chat.send",
    expect.objectContaining({ message: "hello" }),
    expect.any(Number),
  );
  expect(mockMarkRun).toHaveBeenCalledWith("s1", "success");
  expect(mockLogEvent).toHaveBeenCalledWith(
    "agent.schedule.run",
    expect.any(String),
    expect.objectContaining({ result: expect.objectContaining({ ok: true }) }),
  );
});

it.each([
  ["restart", "restart"],
  ["stop", "stop"],
  ["start", "start"],
])("dispatches the %s lifecycle action to containerManager", async (action, fn) => {
  const out = await runScheduledAction({ scheduleId: "s1", agentId: "a1", actionType: action });
  expect(out.ok).toBe(true);
  expect(mockContainer[fn]).toHaveBeenCalledWith(OPENCLAW_AGENT);
});

it("redeploy enqueues a deployment job", async () => {
  await runScheduledAction({ scheduleId: "s1", agentId: "a1", actionType: "redeploy" });
  expect(mockAddDeploymentJob).toHaveBeenCalledWith(OPENCLAW_AGENT);
});

it("records agent_missing without throwing when the agent is gone", async () => {
  mockDb.query.mockResolvedValue({ rows: [] });
  const out = await runScheduledAction({
    scheduleId: "s1",
    agentId: "gone",
    actionType: "restart",
  });
  expect(out).toEqual({ ok: false, status: "agent_missing" });
  expect(mockMarkRun).toHaveBeenCalledWith("s1", "agent_missing");
  expect(mockContainer.restart).not.toHaveBeenCalled();
});

it("on action failure, records the failure and rethrows (for BullMQ retry)", async () => {
  mockContainer.restart.mockRejectedValueOnce(new Error("boom"));
  await expect(
    runScheduledAction({ scheduleId: "s1", agentId: "a1", actionType: "restart" }),
  ).rejects.toThrow("boom");
  expect(mockMarkRun).toHaveBeenCalledWith("s1", expect.stringContaining("failed: boom"));
  expect(mockLogEvent).toHaveBeenCalledWith(
    "agent.schedule.run",
    expect.stringContaining("failed"),
    expect.objectContaining({ result: expect.objectContaining({ ok: false }) }),
  );
});

it("rejects a payload missing required fields", async () => {
  await expect(runScheduledAction({ scheduleId: "s1" })).rejects.toThrow(/requires/);
});
