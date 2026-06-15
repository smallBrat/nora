// @ts-nocheck
const mockDb = { query: jest.fn() };
jest.mock("../db", () => mockDb);

const {
  allocateGatewayPort,
  releaseGatewayPort,
  getGatewayPortAllocation,
  LOCAL_HOST_KEY,
} = require("../portAllocations");

// Route db.query on SQL shape. `insert` is an array of responses consumed in
// order (so we can simulate a unique-violation race then success).
function fakeDb({ existing = [], insertResponses = [] } = {}) {
  const calls = [];
  let insertIdx = 0;
  mockDb.query.mockImplementation(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT host_key, port FROM gateway_port_allocations")) {
      return { rows: existing };
    }
    if (sql.includes("SELECT port FROM gateway_port_allocations WHERE agent_id")) {
      return { rows: existing };
    }
    if (sql.includes("INSERT INTO gateway_port_allocations")) {
      const next = insertResponses[insertIdx++] ?? { rows: [] };
      if (next instanceof Error) throw next;
      return next;
    }
    if (sql.includes("DELETE FROM gateway_port_allocations")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { calls };
}

beforeEach(() => mockDb.query.mockReset());

describe("allocateGatewayPort", () => {
  it("reuses the agent's existing allocation (idempotent across redeploys)", async () => {
    const { calls } = fakeDb({ existing: [{ port: 19042 }] });
    const port = await allocateGatewayPort({ hostKey: "local", agentId: "a1" });
    expect(port).toBe(19042);
    // no INSERT attempted
    expect(calls.some((c) => c.sql.includes("INSERT INTO gateway_port_allocations"))).toBe(false);
  });

  it("claims the lowest free port for a fresh agent", async () => {
    fakeDb({ existing: [], insertResponses: [{ rows: [{ port: 19000 }] }] });
    const port = await allocateGatewayPort({ hostKey: "remote:my-vps", agentId: "a2" });
    expect(port).toBe(19000);
  });

  it("retries on a UNIQUE-violation race and succeeds", async () => {
    const raceError = new Error("duplicate key");
    raceError.code = "23505";
    fakeDb({ existing: [], insertResponses: [raceError, { rows: [{ port: 19001 }] }] });
    const port = await allocateGatewayPort({ hostKey: "local", agentId: "a3" });
    expect(port).toBe(19001);
  });

  it("throws 503 when the host's port range is exhausted", async () => {
    fakeDb({ existing: [], insertResponses: [{ rows: [] }] });
    await expect(
      allocateGatewayPort({ hostKey: "local", agentId: "a4", rangeMin: 19000, rangeMax: 19000 }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("defaults a blank host key to the local host", async () => {
    const { calls } = fakeDb({ existing: [], insertResponses: [{ rows: [{ port: 19000 }] }] });
    await allocateGatewayPort({ agentId: "a5" });
    const insert = calls.find((c) => c.sql.includes("INSERT INTO gateway_port_allocations"));
    expect(insert.params[0]).toBe(LOCAL_HOST_KEY);
  });

  it("requires an agentId", async () => {
    fakeDb();
    await expect(allocateGatewayPort({ hostKey: "local" })).rejects.toThrow(/agentId/i);
  });
});

describe("releaseGatewayPort", () => {
  it("deletes every allocation the agent holds", async () => {
    const { calls } = fakeDb();
    await releaseGatewayPort("a1");
    const del = calls.find((c) => c.sql.includes("DELETE FROM gateway_port_allocations"));
    expect(del.params).toEqual(["a1"]);
  });

  it("no-ops without an agentId", async () => {
    const { calls } = fakeDb();
    await releaseGatewayPort();
    expect(calls.length).toBe(0);
  });
});

describe("getGatewayPortAllocation", () => {
  it("returns null when the table has not been migrated yet", async () => {
    mockDb.query.mockReset();
    const undefinedTable = new Error('relation "gateway_port_allocations" does not exist');
    undefinedTable.code = "42P01";
    mockDb.query.mockRejectedValueOnce(undefinedTable);
    expect(await getGatewayPortAllocation("a1")).toBeNull();
  });
});
