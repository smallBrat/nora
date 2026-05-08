// @ts-nocheck
// Locks in the exact SQL strings and parameter order produced by the
// integrations repository so future refactors can't silently drift.

const { createIntegrationsRepository } = require("../integrations/repository/integrationsRepository");
const {
  createOAuthStatesRepository,
} = require("../integrations/repository/oauthStatesRepository");

function makeDb(rows = []) {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      return { rows };
    }),
  };
}

describe("createIntegrationsRepository", () => {
  it("upserts a catalog item with the canonical SQL", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.upsertCatalogItem({
      id: "github",
      name: "GitHub",
      icon: "icon",
      category: "developer-tools",
      description: "GitHub integration",
      authType: "api_key",
      rawJson: '{"id":"github"}',
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.calls[0].sql).toContain("INSERT INTO integration_catalog");
    expect(db.calls[0].sql).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(db.calls[0].params).toEqual([
      "github",
      "GitHub",
      "icon",
      "developer-tools",
      "GitHub integration",
      "api_key",
      '{"id":"github"}',
    ]);
  });

  it("filters catalog rows by category when provided", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.getCatalogByCategory("social");

    expect(db.calls[0].sql).toContain("WHERE enabled = true");
    expect(db.calls[0].sql).toContain("AND category = $1");
    expect(db.calls[0].sql).toContain("ORDER BY category, name");
    expect(db.calls[0].params).toEqual(["social"]);
  });

  it("omits the category filter when no category is provided", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.getCatalogByCategory();

    expect(db.calls[0].sql).not.toContain("AND category");
    expect(db.calls[0].params).toEqual([]);
  });

  it("inserts an integration with agent/provider/catalog/access_token/config", async () => {
    const db = makeDb([{ id: "int-1", agent_id: "agent-1", provider: "github" }]);
    const repo = createIntegrationsRepository(db);

    const row = await repo.insertIntegration({
      agentId: "agent-1",
      provider: "github",
      catalogId: "github",
      encryptedToken: "enc(token)",
      encryptedConfigJson: '{"key":"value"}',
    });

    expect(db.calls[0].sql).toBe(
      "INSERT INTO integrations(agent_id, provider, catalog_id, access_token, config) VALUES($1, $2, $3, $4, $5) RETURNING *",
    );
    expect(db.calls[0].params).toEqual([
      "agent-1",
      "github",
      "github",
      "enc(token)",
      '{"key":"value"}',
    ]);
    expect(row).toEqual({ id: "int-1", agent_id: "agent-1", provider: "github" });
  });

  it("deletes sibling integrations excluding a given id", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.deleteSiblingIntegrations({
      agentId: "agent-1",
      provider: "twitter",
      excludeId: "int-twitter",
    });

    expect(db.calls[0].sql).toBe(
      "DELETE FROM integrations WHERE agent_id = $1 AND provider = $2 AND id <> $3",
    );
    expect(db.calls[0].params).toEqual(["agent-1", "twitter", "int-twitter"]);
  });

  it("lists all integrations for an agent with catalog join", async () => {
    const db = makeDb([{ id: "int-1" }]);
    const repo = createIntegrationsRepository(db);

    const rows = await repo.listForAgent("agent-1");

    expect(db.calls[0].sql).toContain("FROM integrations i");
    expect(db.calls[0].sql).toContain("LEFT JOIN integration_catalog ic ON i.catalog_id = ic.id");
    expect(db.calls[0].sql).toContain("WHERE i.agent_id = $1");
    expect(db.calls[0].sql).toContain("ORDER BY i.created_at DESC");
    expect(db.calls[0].params).toEqual(["agent-1"]);
    expect(rows).toEqual([{ id: "int-1" }]);
  });

  it("lists active integrations with catalog metadata for sync", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.listActiveForAgent("agent-1");

    expect(db.calls[0].sql).toContain("WHERE i.agent_id = $1 AND i.status = 'active'");
    expect(db.calls[0].sql).toContain("ic.auth_type, ic.config_schema");
    expect(db.calls[0].params).toEqual(["agent-1"]);
  });

  it("lists active env sources without catalog join", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.listActiveEnvSourcesForAgent("agent-1");

    expect(db.calls[0].sql).toBe(
      "SELECT id, provider, catalog_id, access_token, config FROM integrations WHERE agent_id = $1 AND status = 'active'",
    );
    expect(db.calls[0].params).toEqual(["agent-1"]);
  });

  it("deletes an integration scoped to its agent and returns id+provider", async () => {
    const db = makeDb([{ id: "int-1", provider: "github" }]);
    const repo = createIntegrationsRepository(db);

    const removed = await repo.deleteIntegration({
      integrationId: "int-1",
      agentId: "agent-1",
    });

    expect(db.calls[0].sql).toBe(
      "DELETE FROM integrations WHERE id = $1 AND agent_id = $2 RETURNING id, provider",
    );
    expect(db.calls[0].params).toEqual(["int-1", "agent-1"]);
    expect(removed).toEqual({ id: "int-1", provider: "github" });
  });

  it("returns null when delete affects no rows", async () => {
    const db = makeDb([]);
    const repo = createIntegrationsRepository(db);

    const removed = await repo.deleteIntegration({
      integrationId: "missing",
      agentId: "agent-1",
    });

    expect(removed).toBeNull();
  });

  it("finds an integration by id+agent", async () => {
    const db = makeDb([{ id: "int-1" }]);
    const repo = createIntegrationsRepository(db);

    const row = await repo.findIntegration({
      integrationId: "int-1",
      agentId: "agent-1",
    });

    expect(db.calls[0].sql).toBe(
      "SELECT * FROM integrations WHERE id = $1 AND agent_id = $2",
    );
    expect(db.calls[0].params).toEqual(["int-1", "agent-1"]);
    expect(row).toEqual({ id: "int-1" });
  });

  it("updates access_token and config", async () => {
    const db = makeDb();
    const repo = createIntegrationsRepository(db);

    await repo.updateAccessTokenAndConfig({
      id: "int-1",
      encryptedToken: "enc(new)",
      encryptedConfigJson: '{"updated":true}',
    });

    expect(db.calls[0].sql).toBe(
      "UPDATE integrations SET access_token = $1, config = $2 WHERE id = $3",
    );
    expect(db.calls[0].params).toEqual(["enc(new)", '{"updated":true}', "int-1"]);
  });
});

describe("createOAuthStatesRepository", () => {
  it("inserts an OAuth state row with all 10 columns", async () => {
    const db = makeDb();
    const repo = createOAuthStatesRepository(db);
    const expiresAt = new Date("2030-01-01T00:00:00Z");

    await repo.insert({
      state: "state-1",
      provider: "twitter",
      userId: "user-1",
      agentId: "agent-1",
      codeVerifier: "verifier",
      clientId: "client-id",
      encryptedClientSecret: "enc(secret)",
      configJson: '{"default_username":"x"}',
      redirectPath: "/app/agents/1",
      expiresAt,
    });

    expect(db.calls[0].sql).toContain("INSERT INTO integration_oauth_states");
    expect(db.calls[0].sql).toContain("VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)");
    expect(db.calls[0].params).toEqual([
      "state-1",
      "twitter",
      "user-1",
      "agent-1",
      "verifier",
      "client-id",
      "enc(secret)",
      '{"default_username":"x"}',
      "/app/agents/1",
      expiresAt,
    ]);
  });

  it("consumes an OAuth state by joining onto agents", async () => {
    const db = makeDb([{ state: "state-1", agent_user_id: "user-1" }]);
    const repo = createOAuthStatesRepository(db);

    const row = await repo.consume({ state: "state-1", provider: "twitter" });

    expect(db.calls[0].sql).toContain("FROM integration_oauth_states s");
    expect(db.calls[0].sql).toContain("JOIN agents a ON a.id = s.agent_id");
    expect(db.calls[0].sql).toContain("WHERE s.state = $1 AND s.provider = $2");
    expect(db.calls[0].sql).toContain("a.user_id AS agent_user_id");
    expect(db.calls[0].params).toEqual(["state-1", "twitter"]);
    expect(row).toEqual({ state: "state-1", agent_user_id: "user-1" });
  });

  it("deletes an OAuth state by state token", async () => {
    const db = makeDb();
    const repo = createOAuthStatesRepository(db);

    await repo.delete("state-1");

    expect(db.calls[0].sql).toBe(
      "DELETE FROM integration_oauth_states WHERE state = $1",
    );
    expect(db.calls[0].params).toEqual(["state-1"]);
  });
});
