// @ts-nocheck
/**
 * __tests__/agentVersions.test.ts — agent configuration history + rollback.
 * Mocks db so we can assert SQL shape and version-number monotonicity.
 */

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockDb = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
};
jest.mock("../db", () => mockDb);

const agentVersions = require("../agentVersions");

beforeEach(() => {
  mockDb.query.mockReset();
  mockClient.query.mockReset().mockResolvedValue({ rows: [] });
  mockClient.release.mockReset();
});

describe("recordVersion", () => {
  it("rejects unknown source values", async () => {
    await expect(agentVersions.recordVersion("a-1", { foo: 1 }, { source: "wat" })).rejects.toThrow(
      /Unknown agent version source/,
    );
  });

  it("assigns version_number as max+1 inside a transaction", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ n: 4 }] }) // SELECT MAX(version_number) + 1
      .mockResolvedValueOnce({
        rows: [
          {
            id: "v-1",
            agent_id: "a-1",
            version_number: 4,
            config: { foo: "bar" },
            created_by: "u-1",
            message: "test",
            source: "edit",
            created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const version = await agentVersions.recordVersion(
      "a-1",
      { foo: "bar" },
      { createdBy: "u-1", message: "test", source: "edit" },
    );

    expect(version).toMatchObject({ versionNumber: 4, source: "edit", config: { foo: "bar" } });
    // BEGIN, SELECT, INSERT, COMMIT
    expect(mockClient.query).toHaveBeenCalledTimes(4);
    expect(mockClient.query.mock.calls[0][0]).toBe("BEGIN");
    expect(mockClient.query.mock.calls[3][0]).toBe("COMMIT");
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back on insert failure and releases the client", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ n: 1 }] }) // SELECT
      .mockRejectedValueOnce(new Error("insert failed")); // INSERT

    await expect(agentVersions.recordVersion("a-1", {}, {})).rejects.toThrow(/insert failed/);
    // The rollback call (whatever its result) must have been attempted.
    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls).toContain("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe("listVersions / getVersion / getLatestVersion", () => {
  it("listVersions clamps the limit to [1, 200]", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await agentVersions.listVersions("a-1", { limit: 999 });
    const params = mockDb.query.mock.calls[0][1];
    expect(params[1]).toBe(200);
  });

  it("getVersion returns null when not found", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    expect(await agentVersions.getVersion("a-1", "v-x")).toBeNull();
  });

  it("getLatestVersion returns the highest version_number", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: "v-9",
          agent_id: "a-1",
          version_number: 9,
          config: {},
          source: "edit",
          created_at: new Date().toISOString(),
        },
      ],
    });
    const v = await agentVersions.getLatestVersion("a-1");
    expect(v.versionNumber).toBe(9);
  });
});

describe("recordVersionBestEffort", () => {
  it("swallows errors so callers never see them", async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockRejectedValueOnce(new Error("boom")); // SELECT
    await expect(
      agentVersions.recordVersionBestEffort("a-1", {}, { source: "edit" }),
    ).resolves.toBeNull();
  });
});
