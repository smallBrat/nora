// @ts-nocheck
// workspace manager backed by PostgreSQL

const db = require("./db");

async function createWorkspace(userId, name) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      "INSERT INTO workspaces(user_id, name) VALUES($1, $2) RETURNING *",
      [userId, name],
    );
    const workspace = insert.rows[0];
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspace.id, userId],
    );
    await client.query("COMMIT");
    return workspace;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listWorkspaces(userId) {
  // Returns every workspace where the user is a member, plus their role.
  // Falls back to the legacy single-owner field for any workspace that
  // hasn't been backfilled yet (the schema migration backfills them).
  const result = await db.query(
    `SELECT w.*, COALESCE(m.role, CASE WHEN w.user_id = $1 THEN 'owner' ELSE NULL END) AS role
       FROM workspaces w
       LEFT JOIN workspace_members m
         ON m.workspace_id = w.id AND m.user_id = $1
      WHERE m.user_id = $1 OR w.user_id = $1
      ORDER BY w.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function addAgent(workspaceId, agentId, role = "member", userId = null) {
  if (userId) {
    const ownership = await db.query(
      `SELECT w.id
       FROM workspaces w
       JOIN agents a ON a.id = $2
       WHERE w.id = $1 AND w.user_id = $3 AND a.user_id = $3`,
      [workspaceId, agentId, userId]
    );
    if (!ownership.rows[0]) throw new Error("Workspace or agent not found");
  }

  const result = await db.query(
    "INSERT INTO workspace_agents(workspace_id, agent_id, role) VALUES($1, $2, $3) RETURNING *",
    [workspaceId, agentId, role]
  );
  return result.rows[0];
}

async function getWorkspaceAgents(workspaceId, userId = null) {
  const params = [workspaceId];
  let query =
    "SELECT wa.*, a.name as agent_name, a.status as agent_status FROM workspace_agents wa JOIN agents a ON wa.agent_id = a.id WHERE wa.workspace_id = $1";

  if (userId) {
    params.push(userId);
    query += " AND a.user_id = $2";
  }

  query += " ORDER BY wa.created_at DESC";
  const result = await db.query(query, params);
  return result.rows;
}

module.exports = { createWorkspace, listWorkspaces, addAgent, getWorkspaceAgents };
