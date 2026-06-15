// @ts-nocheck
// Gateway host-port allocation — BYOC Phase B (B1).
//
// Replaces the collision-prone deterministic hash (19000 + id % 1000) that
// the docker adapter used to pick a published gateway port. That hash had no
// reservation and no collision detection, so two agents whose ids hashed to the
// same slot would fight over the port on a shared host. Here a port is reserved
// in `gateway_port_allocations` with a UNIQUE(host_key, port) constraint, picked
// atomically as the lowest free port in the range, scoped per host:
//   - host_key "local"      → the local Docker host (all local docker agents).
//   - host_key "remote:<id>" → a specific registered remote host.
// Allocation is idempotent per (agent, host) so redeploys keep the same port.

const db = require("./db");

const DEFAULT_RANGE_MIN = 19000;
const DEFAULT_RANGE_MAX = 19999;
const LOCAL_HOST_KEY = "local";
const MAX_RACE_RETRIES = 5;

function normalizeHostKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return key || LOCAL_HOST_KEY;
}

async function getGatewayPortAllocation(agentId) {
  if (!agentId) return null;
  try {
    const result = await db.query(
      "SELECT host_key, port FROM gateway_port_allocations WHERE agent_id = $1 LIMIT 1",
      [agentId],
    );
    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === "42P01") return null; // table not migrated yet
    throw error;
  }
}

// Reserve (or reuse) a published gateway port for an agent on a given host.
// Returns the port number. Throws (statusCode 503) when the host's range is
// exhausted.
async function allocateGatewayPort({
  hostKey,
  agentId,
  rangeMin = DEFAULT_RANGE_MIN,
  rangeMax = DEFAULT_RANGE_MAX,
} = {}) {
  if (!agentId) throw new Error("agentId is required to allocate a gateway port");
  const key = normalizeHostKey(hostKey);

  // Idempotent: an agent keeps its port across redeploys on the same host.
  const existing = await db.query(
    "SELECT port FROM gateway_port_allocations WHERE agent_id = $1 AND host_key = $2",
    [agentId, key],
  );
  if (existing.rows[0]) return existing.rows[0].port;

  for (let attempt = 0; attempt < MAX_RACE_RETRIES; attempt++) {
    try {
      // Claim the lowest free port for this host in one statement. The
      // UNIQUE(host_key, port) constraint makes concurrent claims race-safe:
      // the loser hits a unique violation and retries against the new state.
      const result = await db.query(
        `INSERT INTO gateway_port_allocations (host_key, agent_id, port)
         SELECT $1, $2, candidate.port
           FROM generate_series($3, $4) AS candidate(port)
          WHERE NOT EXISTS (
            SELECT 1 FROM gateway_port_allocations existing
             WHERE existing.host_key = $1 AND existing.port = candidate.port
          )
          ORDER BY candidate.port
          LIMIT 1
         RETURNING port`,
        [key, agentId, rangeMin, rangeMax],
      );
      if (result.rows[0]) return result.rows[0].port;
      // No row inserted → every port in the range is taken on this host.
      const error = new Error(
        `No free gateway port available on ${key} (range ${rangeMin}-${rangeMax}).`,
      );
      error.statusCode = 503;
      throw error;
    } catch (error) {
      if (error?.code === "23505") continue; // unique_violation — lost the race, retry
      throw error;
    }
  }

  const error = new Error(`Could not allocate a gateway port on ${key} after retries.`);
  error.statusCode = 503;
  throw error;
}

// Release every allocation an agent holds (called on destroy). Idempotent.
async function releaseGatewayPort(agentId) {
  if (!agentId) return;
  try {
    await db.query("DELETE FROM gateway_port_allocations WHERE agent_id = $1", [agentId]);
  } catch (error) {
    if (error?.code === "42P01") return;
    throw error;
  }
}

module.exports = {
  LOCAL_HOST_KEY,
  DEFAULT_RANGE_MIN,
  DEFAULT_RANGE_MAX,
  allocateGatewayPort,
  releaseGatewayPort,
  getGatewayPortAllocation,
};
