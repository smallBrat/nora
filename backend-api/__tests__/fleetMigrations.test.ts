// @ts-nocheck
/**
 * __tests__/fleetMigrations.test.ts — fleet runtime transition planning,
 * persistence, and rollback. Mocks db so we can assert SQL parameters and
 * status transitions without standing up Postgres.
 */

const mockDb = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
};
jest.mock("../db", () => mockDb);
jest.mock("../agentVersions", () => ({
  recordVersionBestEffort: jest.fn().mockResolvedValue(null),
  recordVersion: jest.fn().mockResolvedValue({ id: "v-1", versionNumber: 2 }),
}));

const fleet = require("../fleetMigrations");

beforeEach(() => {
  mockDb.query.mockReset();
});

describe("normalizeSelection", () => {
  it("rejects unknown deploy_target", () => {
    expect(() => fleet.normalizeSelection({ deploy_target: "moon" }, "from")).toThrow(/deploy_target/);
  });
  it("rejects unknown sandbox_profile", () => {
    expect(() => fleet.normalizeSelection({ sandbox_profile: "weird" }, "to")).toThrow(/sandbox_profile/);
  });
  it("accepts a fully-specified selection", () => {
    const sel = fleet.normalizeSelection(
      { runtime_family: "openclaw", deploy_target: "k8s", sandbox_profile: "standard" },
      "to",
    );
    expect(sel).toEqual({
      runtime_family: "openclaw",
      deploy_target: "k8s",
      sandbox_profile: "standard",
    });
  });
});

describe("planMigration", () => {
  it("uses agent_ids ANY-array query when ids are provided", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "a-1",
          name: "One",
          runtime_family: "openclaw",
          deploy_target: "docker",
          sandbox_profile: "standard",
        },
      ],
    });
    const plan = await fleet.planMigration({
      source: {},
      target: { deploy_target: "k8s" },
      agentIds: ["a-1"],
    });
    expect(plan.agentCount).toBe(1);
    expect(plan.evaluations[0].desired.deploy_target).toBe("k8s");
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/ANY\(\$1::uuid\[\]\)/);
  });

  it("filters by source selection when no agent_ids given", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await fleet.planMigration({
      source: { runtime_family: "openclaw", deploy_target: "docker" },
      target: { deploy_target: "k8s" },
    });
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).toMatch(/runtime_family = \$1/);
    expect(sql).toMatch(/deploy_target = \$2/);
    expect(params).toEqual(["openclaw", "docker"]);
  });
});

describe("createMigration", () => {
  it("dry_run inserts with status=completed and started_at set", async () => {
    mockDb.query
      // findCandidateAgents (planMigration)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "a-1",
            name: "One",
            runtime_family: "openclaw",
            deploy_target: "docker",
            sandbox_profile: "standard",
            template_payload: {},
          },
        ],
      })
      // findCandidateAgents (capture before)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "a-1",
            name: "One",
            runtime_family: "openclaw",
            deploy_target: "docker",
            sandbox_profile: "standard",
            template_payload: {},
          },
        ],
      })
      // INSERT into fleet_migrations
      .mockResolvedValueOnce({
        rows: [
          {
            id: "m-1",
            initiated_by: "u-1",
            status: "completed",
            source_selection: {},
            target_selection: { deploy_target: "k8s" },
            agent_ids: ["a-1"],
            before_state: { "a-1": { deploy_target: "docker" } },
            after_state: {},
            errors: [],
            dry_run: true,
            started_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
      });

    const result = await fleet.createMigration({
      source: {},
      target: { deploy_target: "k8s" },
      agentIds: ["a-1"],
      dryRun: true,
      initiatedBy: "u-1",
    });
    expect(result.migration.dryRun).toBe(true);
    expect(result.migration.status).toBe("completed");
    expect(result.plan.agentCount).toBe(1);

    // No version snapshots written for dry runs.
    const agentVersions = require("../agentVersions");
    expect(agentVersions.recordVersionBestEffort).not.toHaveBeenCalled();
  });

  it("real run inserts status=queued and snapshots versions per agent", async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          { id: "a-1", name: "One", template_payload: { foo: 1 } },
          { id: "a-2", name: "Two", template_payload: { foo: 2 } },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: "a-1", name: "One", template_payload: { foo: 1 } },
          { id: "a-2", name: "Two", template_payload: { foo: 2 } },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "m-2",
            status: "queued",
            source_selection: {},
            target_selection: { deploy_target: "k8s" },
            agent_ids: ["a-1", "a-2"],
            before_state: {},
            errors: [],
            dry_run: false,
            created_at: new Date().toISOString(),
          },
        ],
      });

    const agentVersions = require("../agentVersions");
    agentVersions.recordVersionBestEffort.mockClear();

    const result = await fleet.createMigration({
      target: { deploy_target: "k8s" },
      agentIds: ["a-1", "a-2"],
      dryRun: false,
      initiatedBy: "u-1",
    });
    expect(result.migration.status).toBe("queued");
    expect(agentVersions.recordVersionBestEffort).toHaveBeenCalledTimes(2);
  });
});

describe("listMigrations / getMigration", () => {
  it("listMigrations clamps limit", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await fleet.listMigrations({ limit: 9999 });
    expect(mockDb.query.mock.calls[0][1]).toEqual([200]);
  });

  it("getMigration returns null when absent", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    expect(await fleet.getMigration("m-x")).toBeNull();
  });
});

describe("markRolledBack", () => {
  it("flips status to rolled_back and stores after_state", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "m-1",
          status: "rolled_back",
          source_selection: {},
          target_selection: {},
          agent_ids: [],
          before_state: {},
          after_state: { restoredAgents: ["a-1"] },
          errors: [],
          dry_run: false,
          rolled_back_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });
    const out = await fleet.markRolledBack("m-1", { restoredAgents: ["a-1"] });
    expect(out.status).toBe("rolled_back");
    expect(out.afterState).toEqual({ restoredAgents: ["a-1"] });
  });
});
