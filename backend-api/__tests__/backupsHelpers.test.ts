// @ts-nocheck
process.env.NORA_BACKUP_ENCRYPTION_KEY = "0".repeat(64);

const mockDb = { query: jest.fn() };

jest.mock("../db", () => mockDb);
jest.mock("../redisQueue", () => ({
  addBackupJob: jest.fn(),
  addDeploymentJob: jest.fn(),
}));
jest.mock("../platformSettings", () => ({
  getBackupSettings: jest.fn(async () => ({})),
  getBackupStorageConfig: jest.fn(async () => ({
    storageBackend: "local",
    localPath: "/tmp/test-backups",
  })),
}));
jest.mock("../billing", () => ({
  getEffectiveSubscription: jest.fn(),
}));
jest.mock("../agentMigrations", () => ({
  buildMigrationManifestFromAgent: jest.fn(),
  createMigrationDraft: jest.fn(),
  materializeManagedMigrationState: jest.fn(),
  packMigrationBundle: jest.fn(),
  parseUploadedMigrationBuffer: jest.fn(),
}));
jest.mock("../agentPayloads", () => ({
  createEmptyTemplatePayload: jest.fn(() => ({})),
  materializeTemplateWiring: jest.fn(),
  resolveContainerName: jest.fn(() => "container-name"),
  serializeAgent: jest.fn((row) => row),
}));

const fs = require("fs/promises");

const backups = require("../backups");

describe("storageKeyForBackup", () => {
  it("accepts the allowlisted kinds", () => {
    expect(backups.storageKeyForBackup({ id: "abc", kind: "agent" })).toBe("agent/abc.tgz.enc");
    expect(backups.storageKeyForBackup({ id: "abc", kind: "installation" })).toBe(
      "installation/abc.tgz.enc",
    );
  });

  it("rejects unknown kinds (path-traversal hardening)", () => {
    const tests = ["../etc/passwd", "", null, undefined, "snapshot", "agent/../foo"];
    for (const kind of tests) {
      expect(() => backups.storageKeyForBackup({ id: "x", kind })).toThrow(/Invalid backup kind/);
    }
  });
});

describe("pruneExpiredBackups", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  it("only flips status to 'deleted' when storage delete succeeded", async () => {
    // Two rows: one whose storage delete will succeed, one that throws.
    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "b1",
            kind: "agent",
            storage_key: "agent/b1.tgz.enc",
            storage_backend: "local",
            storage_config: {},
            expires_at: new Date(Date.now() - 1000).toISOString(),
            status: "ready",
          },
          {
            id: "b2",
            kind: "agent",
            storage_key: "agent/b2.tgz.enc",
            storage_backend: "local",
            storage_config: {},
            expires_at: new Date(Date.now() - 1000).toISOString(),
            status: "ready",
          },
        ],
      })
      // first deleteStorage succeeds (no DB call captured here, just fs.unlink).
      // Then UPDATE is issued for b1.
      .mockResolvedValueOnce({ rowCount: 1 });

    // Mock fs.unlink: succeed for b1, fail for b2.
    const realUnlink = fs.unlink;
    const unlinkSpy = jest.spyOn(fs, "unlink").mockImplementation((target) => {
      if (String(target).includes("b1")) return Promise.resolve();
      return Promise.reject(new Error("storage backend offline"));
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await backups.pruneExpiredBackups();
      expect(result).toEqual({ deleted: 1, scanned: 2 });

      // Only one UPDATE issued (for b1). b2 stays untouched on disk.
      const updateCalls = mockDb.query.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE backups"),
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][1]).toEqual(["b1"]);

      // The b2 storage failure was logged, not swallowed silently.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      unlinkSpy.mockRestore();
      warnSpy.mockRestore();
      fs.unlink = realUnlink;
    }
  });
});

describe("restoreBackupInPlace ownership defense-in-depth", () => {
  beforeEach(() => {
    mockDb.query.mockReset();
  });

  function mockBackupAndAgent(backupUserId, agentUserId, agentName = "my-agent") {
    mockDb.query
      // loadBackup -> SELECT * FROM backups WHERE id = $1 ...
      .mockResolvedValueOnce({
        rows: [
          {
            id: "backup-1",
            kind: "agent",
            user_id: backupUserId,
            agent_id: "agent-1",
            storage_key: "agent/backup-1.tgz.enc",
            storage_backend: "local",
            storage_config: {},
          },
        ],
      })
      // SELECT * FROM agents WHERE id = $1
      .mockResolvedValueOnce({
        rows: [{ id: "agent-1", user_id: agentUserId, name: agentName }],
      });
  }

  it("rejects a non-admin actor who does not own the target agent", async () => {
    mockBackupAndAgent("owner-1", "owner-1");
    await expect(
      backups.restoreBackupInPlace({
        backupId: "backup-1",
        targetAgentId: "agent-1",
        confirmAgentName: "my-agent",
        actor: { id: "intruder", role: "user" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a non-admin owner whose backup belongs to a different user", async () => {
    mockBackupAndAgent("other-owner", "current-user");
    await expect(
      backups.restoreBackupInPlace({
        backupId: "backup-1",
        targetAgentId: "agent-1",
        confirmAgentName: "my-agent",
        actor: { id: "current-user", role: "user" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("admin actor passes the ownership gate even when the backup belongs to another user", async () => {
    // The admin owns nothing; the backup and target agent both belong to
    // tenant-a. The ownership check must let the admin through; we then
    // hit readBackupArchive's READY_STATUSES guard (status is undefined on
    // our mock row), which throws 409 — proving the gate was open.
    mockBackupAndAgent("tenant-a", "tenant-a");
    await expect(
      backups.restoreBackupInPlace({
        backupId: "backup-1",
        targetAgentId: "agent-1",
        confirmAgentName: "my-agent",
        actor: { id: "admin-1", role: "admin" },
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: "Backup is not ready" });
  });
});
