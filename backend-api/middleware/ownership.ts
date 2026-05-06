// @ts-nocheck
const db = require("../db");

// Role hierarchy for workspace_members.role. Higher index = more privileged.
// Routes ask for a minimum role; any equal-or-higher role is accepted.
const WORKSPACE_ROLE_RANK = { viewer: 0, editor: 1, admin: 2, owner: 3 };

function rankRole(role) {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_RANK, role)
    ? WORKSPACE_ROLE_RANK[role]
    : -1;
}

function roleSatisfies(actual, required) {
  const a = rankRole(actual);
  const r = rankRole(required);
  // Fail-safe: an unknown role on either side means "no, never satisfied".
  if (a < 0 || r < 0) return false;
  return a >= r;
}

async function findOwnedAgent(agentId, userId) {
  if (!agentId) return null;
  const result = await db.query(
    `SELECT id, user_id, name, status, host, container_id, backend_type, runtime_family,
            deploy_target, sandbox_profile, clawhub_skills, gateway_token,
            gateway_host_port, gateway_host, gateway_port, runtime_host, runtime_port
       FROM agents
      WHERE id = $1 AND user_id = $2`,
    [agentId, userId],
  );
  return result.rows[0] || null;
}

// Returns the full agent row when the caller has at least requiredRole on the agent.
// Access path: caller is the agent's direct owner (legacy single-owner — fast path),
// OR caller is a workspace member of any workspace the agent belongs to via
// workspace_agents, where their workspace role meets requiredRole. Direct ownership
// implies "owner" role on the resource and always satisfies any requiredRole.
async function findAccessibleAgent(agentId, userId, requiredRole = "viewer") {
  if (!agentId || !userId) return null;
  if (!Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_RANK, requiredRole)) {
    throw new Error(`Unknown workspace role: ${requiredRole}`);
  }
  const agentResult = await db.query("SELECT * FROM agents WHERE id = $1", [agentId]);
  const row = agentResult.rows[0];
  if (!row) return null;

  // Fast path — direct ownership grants the highest role.
  if (row.user_id === userId) {
    return { ...row, effective_role: "owner" };
  }

  // Slow path — check workspace membership through workspace_agents.
  const memberResult = await db.query(
    `SELECT m.role
       FROM workspace_agents wa
       JOIN workspace_members m
         ON m.workspace_id = wa.workspace_id AND m.user_id = $2
      WHERE wa.agent_id = $1
      ORDER BY
        CASE m.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'editor' THEN 2
          WHEN 'viewer' THEN 3
        END
      LIMIT 1`,
    [agentId, userId],
  );
  const memberRole = memberResult.rows[0]?.role;
  if (!memberRole) return null;
  if (!roleSatisfies(memberRole, requiredRole)) return null;
  return { ...row, effective_role: memberRole };
}

async function findOwnedWorkspace(workspaceId, userId) {
  if (!workspaceId) return null;
  const result = await db.query(
    "SELECT id, user_id, name, created_at FROM workspaces WHERE id = $1 AND user_id = $2",
    [workspaceId, userId],
  );
  return result.rows[0] || null;
}

// Returns { id, user_id, name, created_at, role } when the caller is a member,
// otherwise null. Role comes from workspace_members. Falls back to workspaces.user_id
// for legacy single-owner workspaces that have not been backfilled yet — the schema
// migration backfills them, so this fallback should be a no-op on healthy installs.
async function findWorkspaceMembership(workspaceId, userId) {
  if (!workspaceId || !userId) return null;
  const result = await db.query(
    `SELECT w.id, w.user_id, w.name, w.created_at, m.role
       FROM workspaces w
       LEFT JOIN workspace_members m
         ON m.workspace_id = w.id AND m.user_id = $2
      WHERE w.id = $1`,
    [workspaceId, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.role) return row;
  if (row.user_id === userId) return { ...row, role: "owner" };
  return null;
}

function requireOwnedAgent(paramName = "id", attachAs = "agent") {
  return async (req, res, next) => {
    try {
      const agentId = req.params[paramName];
      const agent = await findOwnedAgent(agentId, req.user.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      req[attachAs] = agent;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

function requireOwnedWorkspace(paramName = "id", attachAs = "workspace") {
  return async (req, res, next) => {
    try {
      const workspaceId = req.params[paramName];
      const workspace = await findOwnedWorkspace(workspaceId, req.user.id);
      if (!workspace) return res.status(404).json({ error: "Workspace not found" });
      req[attachAs] = workspace;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// Role-aware agent guard. Mirrors requireOwnedAgent but accepts workspace
// members through findAccessibleAgent. Use this when you want a single role
// floor across a whole router.use prefix.
function requireAccessibleAgent(requiredRole = "viewer", paramName = "id", attachAs = "agent") {
  if (!Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_RANK, requiredRole)) {
    throw new Error(`Unknown workspace role: ${requiredRole}`);
  }
  return async (req, res, next) => {
    try {
      const agentId = req.params[paramName];
      const agent = await findAccessibleAgent(agentId, req.user.id, requiredRole);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      req[attachAs] = agent;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// Role-aware workspace guard. Use this on new routes; existing single-owner
// routes can keep using requireOwnedWorkspace until they migrate.
function requireWorkspaceRole(requiredRole, paramName = "id", attachAs = "workspace") {
  if (!Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_RANK, requiredRole)) {
    throw new Error(`Unknown workspace role: ${requiredRole}`);
  }
  return async (req, res, next) => {
    try {
      const workspaceId = req.params[paramName];
      const membership = await findWorkspaceMembership(workspaceId, req.user.id);
      if (!membership) return res.status(404).json({ error: "Workspace not found" });
      if (!roleSatisfies(membership.role, requiredRole)) {
        return res.status(403).json({ error: "Insufficient workspace permissions" });
      }
      req[attachAs] = membership;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

module.exports = {
  WORKSPACE_ROLE_RANK,
  rankRole,
  roleSatisfies,
  findOwnedAgent,
  findAccessibleAgent,
  findOwnedWorkspace,
  findWorkspaceMembership,
  requireOwnedAgent,
  requireOwnedWorkspace,
  requireAccessibleAgent,
  requireWorkspaceRole,
};
