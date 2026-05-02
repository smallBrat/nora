// @ts-nocheck

const BACKUP_ENV_KEYS = [
  "NORA_BACKUP_STORAGE",
  "NORA_BACKUP_DIR",
  "NORA_BACKUP_S3_BUCKET",
  "NORA_BACKUP_S3_REGION",
  "NORA_BACKUP_S3_ENDPOINT",
  "NORA_BACKUP_S3_ACCESS_KEY_ID",
  "NORA_BACKUP_S3_SECRET_ACCESS_KEY",
  "NORA_BACKUP_S3_SESSION_TOKEN",
  "NORA_BACKUP_R2_BUCKET",
  "NORA_BACKUP_R2_REGION",
  "NORA_BACKUP_R2_ENDPOINT",
  "NORA_BACKUP_R2_ACCESS_KEY_ID",
  "NORA_BACKUP_R2_SECRET_ACCESS_KEY",
  "NORA_BACKUP_R2_SESSION_TOKEN",
  "NORA_BACKUP_SSH_HOST",
  "NORA_BACKUP_SSH_PORT",
  "NORA_BACKUP_SSH_USERNAME",
  "NORA_BACKUP_SSH_REMOTE_PATH",
  "NORA_BACKUP_SSH_PRIVATE_KEY",
  "NORA_BACKUP_SSH_PASSWORD",
  "AWS_S3_BUCKET",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
];

function clearBackupEnv() {
  for (const key of BACKUP_ENV_KEYS) delete process.env[key];
}

function loadPlatformSettings(env = {}) {
  jest.resetModules();
  clearBackupEnv();
  Object.assign(process.env, env);

  const mockDb = { query: jest.fn() };
  const decrypt = jest.fn((value) => {
    if (value === "stored-password") return "db-password";
    if (value === "stored-private-key") return "db-private-key";
    if (value === "stored-access-key") return "db-access-key";
    if (value === "stored-secret-key") return "db-secret-key";
    return value;
  });

  jest.doMock("../db", () => mockDb);
  jest.doMock("../crypto", () => ({
    decrypt,
    encrypt: jest.fn((value) => `encrypted:${value}`),
    ensureEncryptionConfigured: jest.fn(),
  }));

  const platformSettings = require("../platformSettings");
  return { platformSettings, mockDb, decrypt };
}

function backupSettingsRow(overrides = {}) {
  return {
    backup_storage_backend: "ssh",
    backup_local_path: "/var/lib/nora-backups",
    backup_s3_bucket: "",
    backup_s3_region: "us-east-1",
    backup_s3_endpoint: "",
    backup_s3_access_key_id_encrypted: null,
    backup_s3_secret_access_key_encrypted: null,
    backup_ssh_host: "storage.example.com",
    backup_ssh_port: 2222,
    backup_ssh_username: "backup",
    backup_ssh_remote_path: "/srv/nora",
    backup_ssh_private_key_encrypted: null,
    backup_ssh_password_encrypted: "stored-password",
    backup_installation_schedule_enabled: false,
    backup_installation_schedule_frequency: "daily",
    backup_installation_schedule_hour_utc: 2,
    backup_installation_schedule_day_of_week: 0,
    ...overrides,
  };
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  clearBackupEnv();
});

describe("backup storage settings", () => {
  it("uses the stored SSH password when setup leaves the env override blank", async () => {
    const { platformSettings, mockDb } = loadPlatformSettings({
      NORA_BACKUP_SSH_PASSWORD: "",
    });
    mockDb.query.mockResolvedValueOnce({ rows: [backupSettingsRow()] });

    const config = await platformSettings.getBackupStorageConfig();

    expect(config.storageBackend).toBe("ssh");
    expect(config.sshPassword).toBe("db-password");
  });

  it("lets a non-empty SSH password env override the stored credential", async () => {
    const { platformSettings, mockDb } = loadPlatformSettings({
      NORA_BACKUP_SSH_PASSWORD: "env-password",
    });
    mockDb.query.mockResolvedValueOnce({ rows: [backupSettingsRow()] });

    const config = await platformSettings.getBackupStorageConfig();

    expect(config.sshPassword).toBe("env-password");
  });

  it("expands escaped newlines in SSH private keys from env files", async () => {
    const { platformSettings, mockDb } = loadPlatformSettings({
      NORA_BACKUP_SSH_PRIVATE_KEY: "-----BEGIN KEY-----\\nabc\\n-----END KEY-----",
    });
    mockDb.query.mockResolvedValueOnce({ rows: [backupSettingsRow()] });

    const config = await platformSettings.getBackupStorageConfig();

    expect(config.sshPrivateKey).toBe("-----BEGIN KEY-----\nabc\n-----END KEY-----");
  });

  it("normalizes the default R2 signing region to auto", () => {
    const { platformSettings } = loadPlatformSettings();

    expect(
      platformSettings.parseRequiredBackupSettings({
        storageBackend: "r2",
        s3Region: "us-east-1",
      }).s3Region,
    ).toBe("auto");
  });

  it("validates backup plan limit settings", () => {
    const { platformSettings } = loadPlatformSettings();

    expect(
      platformSettings.parseRequiredBackupPlanLimits({
        plans: {
          free: {
            managed_backups_enabled: true,
            backup_limit_per_agent: "2",
            backup_storage_mb: "512",
            backup_retention_days: "7",
          },
        },
      }).free,
    ).toEqual({
      managed_backups_enabled: true,
      backup_limit_per_agent: 2,
      backup_storage_mb: 512,
      backup_retention_days: 7,
    });
  });
});
