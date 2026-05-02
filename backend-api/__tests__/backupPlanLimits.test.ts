// @ts-nocheck

const mockDb = { query: jest.fn() };
jest.mock("../db", () => mockDb);
jest.mock("../crypto", () => ({
  encrypt: jest.fn((v) => v),
  decrypt: jest.fn((v) => v),
}));

const platformSettings = require("../platformSettings");

describe("normalizeBackupPlanLimits (read path, forgiving)", () => {
  it("returns full DEFAULT_BACKUP_PLAN_LIMITS for null/undefined/empty input", () => {
    const expected = {
      free: { ...platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.free },
      pro: { ...platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.pro },
      enterprise: { ...platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.enterprise },
    };
    expect(platformSettings.normalizeBackupPlanLimits(null)).toEqual(expected);
    expect(platformSettings.normalizeBackupPlanLimits(undefined)).toEqual(expected);
    expect(platformSettings.normalizeBackupPlanLimits({})).toEqual(expected);
  });

  it("fills missing per-tier fields with defaults instead of throwing", () => {
    const result = platformSettings.normalizeBackupPlanLimits({
      pro: { backup_limit_per_agent: 10 },
    });
    expect(result.pro.backup_limit_per_agent).toBe(10);
    expect(result.pro.backup_storage_mb).toBe(
      platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.pro.backup_storage_mb,
    );
    expect(result.free).toEqual(platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.free);
  });

  it("ignores unknown plan keys silently (allowlist enforced by BACKUP_PLAN_KEYS)", () => {
    const result = platformSettings.normalizeBackupPlanLimits({
      free: { backup_limit_per_agent: 1 },
      ultimate: { backup_limit_per_agent: 9999 },
    });
    expect(Object.keys(result).sort()).toEqual(["enterprise", "free", "pro"]);
    expect(result).not.toHaveProperty("ultimate");
  });

  it("falls back to defaults when a tier is malformed (read path is forgiving)", () => {
    const result = platformSettings.normalizeBackupPlanLimits({ pro: "garbage" });
    expect(result.pro).toEqual(platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.pro);
  });
});

describe("parseRequiredBackupPlanLimits (write path, strict)", () => {
  it("rejects non-object payloads", () => {
    for (const bad of [null, "string", 1, true]) {
      expect(() => platformSettings.parseRequiredBackupPlanLimits(bad)).toThrow(
        /payload must be an object/,
      );
    }
    expect(() => platformSettings.parseRequiredBackupPlanLimits([])).toThrow(
      /payload must be an object/,
    );
  });

  it("rejects malformed tier entries (string instead of object)", () => {
    expect(() =>
      platformSettings.parseRequiredBackupPlanLimits({ plans: { pro: "garbage" } }),
    ).toThrow(/pro entry must be an object/);
  });

  it("rejects negative integers and non-numeric strings", () => {
    expect(() =>
      platformSettings.parseRequiredBackupPlanLimits({
        plans: {
          pro: {
            managed_backups_enabled: true,
            backup_limit_per_agent: -1,
            backup_storage_mb: 100,
            backup_retention_days: 7,
          },
        },
      }),
    ).toThrow(/pro\.backup_limit_per_agent must be an integer that is 0 or greater/);

    expect(() =>
      platformSettings.parseRequiredBackupPlanLimits({
        plans: {
          pro: {
            managed_backups_enabled: true,
            backup_limit_per_agent: "abc",
            backup_storage_mb: 100,
            backup_retention_days: 7,
          },
        },
      }),
    ).toThrow(/pro\.backup_limit_per_agent must be an integer/);
  });

  it("rejects zero limits when managed_backups_enabled is true (foot-gun guard)", () => {
    expect(() =>
      platformSettings.parseRequiredBackupPlanLimits({
        plans: {
          pro: {
            managed_backups_enabled: true,
            backup_limit_per_agent: 0,
            backup_storage_mb: 100,
            backup_retention_days: 7,
          },
        },
      }),
    ).toThrow(/backup_limit_per_agent must be greater than 0 when managed_backups_enabled is true/);
  });

  it("allows zero limits when managed_backups_enabled is false (free tier)", () => {
    const next = platformSettings.parseRequiredBackupPlanLimits({
      plans: {
        free: {
          managed_backups_enabled: false,
          backup_limit_per_agent: 0,
          backup_storage_mb: 0,
          backup_retention_days: 0,
        },
      },
    });
    expect(next.free).toEqual({
      managed_backups_enabled: false,
      backup_limit_per_agent: 0,
      backup_storage_mb: 0,
      backup_retention_days: 0,
    });
  });

  it("missing tier in payload inherits defaults (partial PUT)", () => {
    const next = platformSettings.parseRequiredBackupPlanLimits({
      plans: {
        pro: {
          managed_backups_enabled: true,
          backup_limit_per_agent: 10,
          backup_storage_mb: 10240,
          backup_retention_days: 60,
        },
      },
    });
    expect(next.pro.backup_limit_per_agent).toBe(10);
    expect(next.free).toEqual(platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.free);
    expect(next.enterprise).toEqual(platformSettings.DEFAULT_BACKUP_PLAN_LIMITS.enterprise);
  });
});
