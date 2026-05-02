// @ts-nocheck
/**
 * __tests__/billing.test.ts — Billing and effective agent cap coverage
 */

const DEFAULT_DEPLOYMENT_DEFAULTS = {
  vcpu: 4,
  ram_mb: 4096,
  disk_gb: 50,
};
const DEFAULT_BACKUP_PLAN_LIMITS = {
  free: {
    managed_backups_enabled: false,
    backup_limit_per_agent: 0,
    backup_storage_mb: 0,
    backup_retention_days: 0,
  },
  pro: {
    managed_backups_enabled: true,
    backup_limit_per_agent: 5,
    backup_storage_mb: 5120,
    backup_retention_days: 30,
  },
  enterprise: {
    managed_backups_enabled: true,
    backup_limit_per_agent: 30,
    backup_storage_mb: 102400,
    backup_retention_days: 180,
  },
};

function loadBillingModule({
  platformMode = "selfhosted",
  billingEnabled = "false",
  maxAgents = "50",
  backupLimitPerAgent,
  backupStorageMb,
  backupRetentionDays,
  backupPlanLimits = DEFAULT_BACKUP_PLAN_LIMITS,
} = {}) {
  jest.resetModules();

  process.env.PLATFORM_MODE = platformMode;
  process.env.BILLING_ENABLED = billingEnabled;
  process.env.MAX_AGENTS = maxAgents;
  if (backupLimitPerAgent == null) delete process.env.NORA_BACKUP_LIMIT_PER_AGENT;
  else process.env.NORA_BACKUP_LIMIT_PER_AGENT = String(backupLimitPerAgent);
  if (backupStorageMb == null) delete process.env.NORA_BACKUP_STORAGE_MB;
  else process.env.NORA_BACKUP_STORAGE_MB = String(backupStorageMb);
  if (backupRetentionDays == null) delete process.env.NORA_BACKUP_RETENTION_DAYS;
  else process.env.NORA_BACKUP_RETENTION_DAYS = String(backupRetentionDays);
  delete process.env.STRIPE_SECRET_KEY;

  const mockDb = { query: jest.fn() };
  const mockGetDeploymentDefaults = jest.fn().mockResolvedValue(DEFAULT_DEPLOYMENT_DEFAULTS);
  const mockGetBackupPlanLimits = jest.fn().mockResolvedValue(backupPlanLimits);

  jest.doMock("../db", () => mockDb);
  jest.doMock("../platformSettings", () => ({
    getBackupPlanLimits: mockGetBackupPlanLimits,
    getDeploymentDefaults: mockGetDeploymentDefaults,
  }));

  const billing = require("../billing");
  return { billing, mockDb, mockGetBackupPlanLimits, mockGetDeploymentDefaults };
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.PLATFORM_MODE;
  delete process.env.BILLING_ENABLED;
  delete process.env.MAX_AGENTS;
  delete process.env.NORA_BACKUP_LIMIT_PER_AGENT;
  delete process.env.NORA_BACKUP_STORAGE_MB;
  delete process.env.NORA_BACKUP_RETENTION_DAYS;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("billing effective agent caps", () => {
  it("returns the default 3-agent cap for non-admin self-hosted users when no override is set", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "user-1", role: "user", agent_limit_override: null }],
    });

    const subscription = await billing.getSubscription("user-1");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "selfhosted",
        status: "active",
        agent_limit: 3,
        base_agent_limit: 3,
        agent_limit_override: null,
        agent_limit_source: "default",
        is_unlimited: false,
      }),
    );
  });

  it("returns unlimited for admin users by default in self-hosted mode", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "admin-1", role: "admin", agent_limit_override: null }],
    });

    const subscription = await billing.getSubscription("admin-1");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "selfhosted",
        status: "active",
        agent_limit: null,
        base_agent_limit: null,
        agent_limit_override: null,
        agent_limit_source: "admin_default_unlimited",
        is_unlimited: true,
      }),
    );
  });

  it("applies PaaS admin overrides on top of the role defaults", async () => {
    const { billing, mockDb, mockGetDeploymentDefaults } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-2", role: "user", agent_limit_override: 12 }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      });

    const subscription = await billing.getSubscription("user-2");

    expect(mockGetDeploymentDefaults).toHaveBeenCalledTimes(1);
    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "pro",
        status: "active",
        agent_limit: 12,
        base_agent_limit: 3,
        agent_limit_override: 12,
        agent_limit_source: "admin_override",
        is_unlimited: false,
        vcpu: 4,
        ram_mb: 4096,
        disk_gb: 50,
      }),
    );
  });

  it("returns the default 3-agent cap for billing-disabled PaaS users when no override exists", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "false",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-3", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const subscription = await billing.getSubscription("user-3");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "free",
        status: "active",
        agent_limit: 3,
        base_agent_limit: 3,
        agent_limit_override: null,
        agent_limit_source: "default",
        is_unlimited: false,
        managed_backups_enabled: true,
        managed_backups_source: "billing_disabled",
        backup_limit_per_agent: 10,
        backup_storage_mb: 51200,
        backup_retention_days: 30,
      }),
    );
  });

  it("blocks deployments at the default cap with an admin message", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-4", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "free", status: "active" }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "3" }],
      });

    const result = await billing.enforceLimits("user-4");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Agent limit reached (3/3). Contact your administrator.",
        subscription: expect.objectContaining({
          agent_limit: 3,
          agent_limit_source: "default",
        }),
      }),
    );
  });

  it("blocks self-hosted deployments at an admin override with an admin message", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "selfhosted",
      maxAgents: "50",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-5", role: "user", agent_limit_override: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: "2" }],
      });

    const result = await billing.enforceLimits("user-5");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Agent limit reached (2/2). Contact your administrator.",
        subscription: expect.objectContaining({
          agent_limit: 2,
          agent_limit_source: "admin_override",
        }),
      }),
    );
  });

  it("preserves unlimited deploys for admin users in billing-disabled PaaS", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "false",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-6", role: "admin", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ count: "42" }],
      });

    const result = await billing.enforceLimits("user-6");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    expect(result.subscription).toEqual(
      expect.objectContaining({
        is_unlimited: true,
        agent_limit_source: "admin_default_unlimited",
      }),
    );
  });

  it("still blocks non-active PaaS subscriptions even when an override exists", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "user-7", role: "user", agent_limit_override: 25 }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "past_due" }],
      });

    const result = await billing.enforceLimits("user-7");

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Subscription is not active",
        subscription: expect.objectContaining({
          agent_limit: 25,
          agent_limit_source: "admin_override",
          status: "past_due",
        }),
      }),
    );
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });
});

describe("billing effective backup caps", () => {
  it("exposes paid managed-backup entitlements for active Pro users", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-user-1", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      });

    const subscription = await billing.getSubscription("backup-user-1");

    expect(subscription).toEqual(
      expect.objectContaining({
        managed_backups_enabled: true,
        backup_limit_per_agent: 5,
        backup_storage_mb: 5120,
        backup_retention_days: 30,
        backup_limit_source: "plan",
        backup_storage_source: "plan",
        backup_retention_source: "plan",
      }),
    );
  });

  it("uses admin-configured backup entitlements for each PaaS billing tier", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
      backupPlanLimits: {
        ...DEFAULT_BACKUP_PLAN_LIMITS,
        free: {
          managed_backups_enabled: true,
          backup_limit_per_agent: 2,
          backup_storage_mb: 256,
          backup_retention_days: 7,
        },
        pro: {
          managed_backups_enabled: true,
          backup_limit_per_agent: 12,
          backup_storage_mb: 8192,
          backup_retention_days: 45,
        },
      },
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-tier-user", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      });

    const subscription = await billing.getSubscription("backup-tier-user");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "pro",
        managed_backups_enabled: true,
        backup_limit_per_agent: 12,
        backup_storage_mb: 8192,
        backup_retention_days: 45,
      }),
    );
  });

  it("allows managed backups in PaaS mode when billing is disabled", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "false",
      backupLimitPerAgent: 4,
      backupStorageMb: 2048,
      backupRetentionDays: 21,
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-billing-off", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ used_bytes: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 0 }],
      });

    const result = await billing.enforceBackupLimits("backup-billing-off", { agentId: "agent-1" });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: true,
        subscription: expect.objectContaining({
          managed_backups_enabled: true,
          managed_backups_source: "billing_disabled",
          backup_limit_per_agent: 4,
          backup_storage_mb: 2048,
          backup_retention_days: 21,
        }),
      }),
    );
  });

  it("applies admin backup overrides on top of a free PaaS plan", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "backup-user-2",
            role: "user",
            agent_limit_override: null,
            managed_backups_enabled_override: true,
            backup_limit_per_agent_override: 7,
            backup_storage_mb_override: 2048,
            backup_retention_days_override: 14,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "free", status: "active" }],
      });

    const subscription = await billing.getSubscription("backup-user-2");

    expect(subscription).toEqual(
      expect.objectContaining({
        plan: "free",
        managed_backups_enabled: true,
        managed_backups_source: "admin_override",
        backup_limit_per_agent: 7,
        backup_limit_source: "admin_override",
        backup_storage_mb: 2048,
        backup_storage_source: "admin_override",
        backup_retention_days: 14,
        backup_retention_source: "admin_override",
      }),
    );
  });

  it("blocks managed backups on unpaid plans without an override", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-user-3", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "free", status: "active" }],
      });

    const result = await billing.enforceBackupLimits("backup-user-3", { agentId: "agent-1" });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Managed backups are not available on your current plan.",
        subscription: expect.objectContaining({
          managed_backups_enabled: false,
          backup_limit_per_agent: 0,
          backup_storage_mb: 0,
        }),
      }),
    );
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it("blocks managed backups when a paid PaaS subscription is not active", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-user-6", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "past_due" }],
      });

    const result = await billing.enforceBackupLimits("backup-user-6", { agentId: "agent-1" });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Subscription is not active",
        subscription: expect.objectContaining({
          plan: "pro",
          status: "past_due",
          managed_backups_enabled: true,
        }),
      }),
    );
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it("blocks managed backups at the per-agent backup count cap", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: "backup-user-4", role: "user", agent_limit_override: null }],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      })
      .mockResolvedValueOnce({
        rows: [{ used_bytes: "1048576" }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

    const result = await billing.enforceBackupLimits("backup-user-4", { agentId: "agent-1" });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Backup limit reached (5/5). Contact your administrator.",
        usage: expect.objectContaining({
          backup_count_for_agent: 5,
          backup_storage_used_bytes: 1048576,
        }),
      }),
    );
  });

  it("blocks managed backups at the storage cap", async () => {
    const { billing, mockDb } = loadBillingModule({
      platformMode: "paas",
      billingEnabled: "true",
    });

    mockDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "backup-user-5",
            role: "user",
            agent_limit_override: null,
            backup_limit_per_agent_override: 10,
            backup_storage_mb_override: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ plan: "pro", status: "active" }],
      })
      .mockResolvedValueOnce({
        rows: [{ used_bytes: String(1024 * 1024) }],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 0 }],
      });

    const result = await billing.enforceBackupLimits("backup-user-5", { agentId: "agent-1" });

    expect(result).toEqual(
      expect.objectContaining({
        allowed: false,
        error: "Backup storage limit reached. Delete old backups or contact your administrator.",
        usage: expect.objectContaining({
          backup_storage_used_bytes: 1024 * 1024,
        }),
      }),
    );
  });
});
