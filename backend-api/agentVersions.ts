// @ts-nocheck
// Per-agent configuration version history. Each row captures a snapshot of
// the agent's template_payload at a point in time; rollback restores a prior
// row and triggers the existing redeploy path.
//
// Version numbers are assigned monotonically per agent inside a transaction
// so concurrent writes can't collide on the UNIQUE(agent_id, version_number)
// constraint.

const db = require("./db");

const VALID_SOURCES = new Set([
  "edit",
  "deploy",
  "redeploy",
  "duplicate",
  "hub-install",
  "restore",
  "rollback",
]);

function serializeVersion(row) {
  return {
    id: row.id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    config: row.config || {},
    createdBy: row.created_by,
    message: row.message || null,
    source: row.source,
    createdAt: row.created_at,
  };
}

async function recordVersion(
  agentId,
  config,
  { createdBy = null, message = null, source = "edit" } = {},
) {
  if (!agentId) throw new Error("agentId is required");
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Unknown agent version source: ${source}`);
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const next = await client.query(
      "SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM agent_versions WHERE agent_id = $1",
      [agentId],
    );
    const versionNumber = next.rows[0].n;
    const insert = await client.query(
      `INSERT INTO agent_versions (agent_id, version_number, config, created_by, message, source)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING id, agent_id, version_number, config, created_by, message, source, created_at`,
      [agentId, versionNumber, JSON.stringify(config || {}), createdBy, message, source],
    );
    await client.query("COMMIT");
    return serializeVersion(insert.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Best-effort version recording. Wraps recordVersion so a failure here
// (e.g., transient DB issue) never blocks the actual agent mutation that
// triggered it. Callers should NOT await this in critical paths.
function recordVersionBestEffort(agentId, config, options = {}) {
  return Promise.resolve(recordVersion(agentId, config, options)).catch((err) => {
    console.error(`Failed to record agent version for ${agentId}:`, err.message);
    return null;
  });
}

async function listVersions(agentId, { limit = 50 } = {}) {
  const result = await db.query(
    `SELECT id, agent_id, version_number, config, created_by, message, source, created_at
       FROM agent_versions
      WHERE agent_id = $1
      ORDER BY version_number DESC
      LIMIT $2`,
    [agentId, Math.max(1, Math.min(200, limit))],
  );
  return result.rows.map(serializeVersion);
}

async function getVersion(agentId, versionId) {
  const result = await db.query(
    `SELECT id, agent_id, version_number, config, created_by, message, source, created_at
       FROM agent_versions
      WHERE agent_id = $1 AND id = $2`,
    [agentId, versionId],
  );
  return result.rows[0] ? serializeVersion(result.rows[0]) : null;
}

async function getLatestVersion(agentId) {
  const result = await db.query(
    `SELECT id, agent_id, version_number, config, created_by, message, source, created_at
       FROM agent_versions
      WHERE agent_id = $1
      ORDER BY version_number DESC
      LIMIT 1`,
    [agentId],
  );
  return result.rows[0] ? serializeVersion(result.rows[0]) : null;
}

module.exports = {
  VALID_SOURCES,
  getLatestVersion,
  getVersion,
  listVersions,
  recordVersion,
  recordVersionBestEffort,
  serializeVersion,
};
