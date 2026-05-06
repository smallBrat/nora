// @ts-nocheck
// Workspace-scoped alert rules. Each rule matches events by event_pattern
// (literal "agent.error" or suffix-glob "agent.*") and delivers to one or more
// channels. v1 channels: { type: "webhook", url, headers? }. Delivery is
// best-effort and inline (no retry queue yet); failures are recorded on the
// rule's last_error and logged.

const db = require("./db");

const SUPPORTED_CHANNEL_TYPES = new Set(["webhook", "email"]);
const DELIVERY_TIMEOUT_MS = 5000;
const MAX_PATTERN_LENGTH = 100;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_RECIPIENTS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeName(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    const error = new Error("name is required");
    error.statusCode = 400;
    throw error;
  }
  return s.slice(0, MAX_NAME_LENGTH);
}

function normalizePattern(value) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    const error = new Error("event_pattern is required");
    error.statusCode = 400;
    throw error;
  }
  if (s.length > MAX_PATTERN_LENGTH) {
    const error = new Error("event_pattern is too long");
    error.statusCode = 400;
    throw error;
  }
  return s;
}

function normalizeChannels(value) {
  if (!Array.isArray(value) || value.length === 0) {
    const error = new Error("at least one channel is required");
    error.statusCode = 400;
    throw error;
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      const error = new Error(`channel #${index + 1} must be an object`);
      error.statusCode = 400;
      throw error;
    }
    const type = String(entry.type || "").trim();
    if (!SUPPORTED_CHANNEL_TYPES.has(type)) {
      const error = new Error(
        `channel #${index + 1}: unsupported type "${type}"; expected one of ${[...SUPPORTED_CHANNEL_TYPES].join(", ")}`,
      );
      error.statusCode = 400;
      throw error;
    }
    if (type === "webhook") {
      const url = String(entry.url || "").trim();
      if (!/^https?:\/\//i.test(url)) {
        const error = new Error(`channel #${index + 1}: webhook url must start with http(s)://`);
        error.statusCode = 400;
        throw error;
      }
      const headers =
        entry.headers && typeof entry.headers === "object" && !Array.isArray(entry.headers)
          ? entry.headers
          : undefined;
      return { type, url, ...(headers ? { headers } : {}) };
    }
    if (type === "email") {
      const rawTo = Array.isArray(entry.to) ? entry.to : [];
      const cleanTo = [];
      for (const value of rawTo) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed && !cleanTo.includes(trimmed)) cleanTo.push(trimmed);
      }
      if (cleanTo.length === 0) {
        const error = new Error(`channel #${index + 1}: email channel requires at least one recipient in "to"`);
        error.statusCode = 400;
        throw error;
      }
      if (cleanTo.length > MAX_EMAIL_RECIPIENTS) {
        const error = new Error(
          `channel #${index + 1}: email channel allows at most ${MAX_EMAIL_RECIPIENTS} recipients`,
        );
        error.statusCode = 400;
        throw error;
      }
      for (const value of cleanTo) {
        if (!EMAIL_RE.test(value)) {
          const error = new Error(`channel #${index + 1}: "${value}" is not a valid email address`);
          error.statusCode = 400;
          throw error;
        }
      }
      const subjectPrefix =
        typeof entry.subjectPrefix === "string" ? entry.subjectPrefix.trim().slice(0, 60) : "";
      return {
        type,
        to: cleanTo,
        ...(subjectPrefix ? { subjectPrefix } : {}),
      };
    }
    return { type };
  });
}

function patternMatches(pattern, eventType) {
  if (!pattern || !eventType) return false;
  if (pattern === eventType) return true;
  if (pattern === "*") return true;
  // suffix glob: "agent.*" matches "agent.error", "agent.warning", etc.
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return eventType === prefix || eventType.startsWith(`${prefix}.`);
  }
  return false;
}

function serializeRule(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    name: row.name,
    eventPattern: row.event_pattern,
    channels: Array.isArray(row.channels) ? row.channels : [],
    enabled: row.enabled,
    lastFiredAt: row.last_fired_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRules(workspaceId) {
  const result = await db.query(
    `SELECT id, workspace_id, created_by, name, event_pattern, channels, enabled,
            last_fired_at, last_error, created_at, updated_at
       FROM alert_rules
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId],
  );
  return result.rows.map(serializeRule);
}

async function getRule(ruleId, workspaceId) {
  const result = await db.query(
    `SELECT id, workspace_id, created_by, name, event_pattern, channels, enabled,
            last_fired_at, last_error, created_at, updated_at
       FROM alert_rules
      WHERE id = $1 AND workspace_id = $2`,
    [ruleId, workspaceId],
  );
  return result.rows[0] ? serializeRule(result.rows[0]) : null;
}

async function createRule(workspaceId, createdBy, payload = {}) {
  const name = normalizeName(payload.name);
  const eventPattern = normalizePattern(payload.eventPattern || payload.event_pattern);
  const channels = normalizeChannels(payload.channels);
  const enabled = payload.enabled !== false;

  const result = await db.query(
    `INSERT INTO alert_rules (workspace_id, created_by, name, event_pattern, channels, enabled)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, workspace_id, created_by, name, event_pattern, channels, enabled,
               last_fired_at, last_error, created_at, updated_at`,
    [workspaceId, createdBy || null, name, eventPattern, JSON.stringify(channels), enabled],
  );
  return serializeRule(result.rows[0]);
}

async function updateRule(ruleId, workspaceId, payload = {}) {
  const fields = [];
  const params = [ruleId, workspaceId];
  let next = 3;

  if (payload.name !== undefined) {
    fields.push(`name = $${next++}`);
    params.push(normalizeName(payload.name));
  }
  if (payload.eventPattern !== undefined || payload.event_pattern !== undefined) {
    fields.push(`event_pattern = $${next++}`);
    params.push(normalizePattern(payload.eventPattern || payload.event_pattern));
  }
  if (payload.channels !== undefined) {
    fields.push(`channels = $${next++}::jsonb`);
    params.push(JSON.stringify(normalizeChannels(payload.channels)));
  }
  if (payload.enabled !== undefined) {
    fields.push(`enabled = $${next++}`);
    params.push(Boolean(payload.enabled));
  }

  if (fields.length === 0) return getRule(ruleId, workspaceId);

  fields.push("updated_at = NOW()");
  const result = await db.query(
    `UPDATE alert_rules SET ${fields.join(", ")}
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, workspace_id, created_by, name, event_pattern, channels, enabled,
                last_fired_at, last_error, created_at, updated_at`,
    params,
  );
  return result.rows[0] ? serializeRule(result.rows[0]) : null;
}

async function deleteRule(ruleId, workspaceId) {
  const result = await db.query(
    "DELETE FROM alert_rules WHERE id = $1 AND workspace_id = $2 RETURNING id",
    [ruleId, workspaceId],
  );
  return Boolean(result.rows[0]);
}

async function recordFiring(ruleId, error) {
  await db
    .query(
      `UPDATE alert_rules
          SET last_fired_at = NOW(),
              last_error = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [ruleId, error || null],
    )
    .catch((err) => {
      console.error("Failed to record alert rule firing:", err.message);
    });
}

async function deliverEmail(channel, payload) {
  // Lazy-require so test suites that don't mock mailer don't pull it in.
  const mailer = require("./mailer");
  const subjectPrefix = channel.subjectPrefix ? `[${channel.subjectPrefix}] ` : "";
  const subject = `${subjectPrefix}Nora alert: ${payload.eventType}`;
  const lines = [
    `Event: ${payload.eventType}`,
    payload.message ? `Message: ${payload.message}` : null,
    payload.firedAt ? `Fired at: ${payload.firedAt}` : null,
    payload.ruleName ? `Rule: ${payload.ruleName}` : null,
    "",
    "Context:",
    JSON.stringify(payload.metadata || {}, null, 2),
  ].filter(Boolean);
  const result = await mailer.sendMail({
    to: channel.to,
    subject,
    text: lines.join("\n"),
  });
  if (!result.delivered) {
    throw new Error(result.error || "email delivery failed");
  }
}

async function deliverWebhook(channel, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(channel.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Nora-Alerts/1.0",
        ...(channel.headers || {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// Find rules whose pattern matches the event type and fire them. Designed for
// fire-and-forget use from monitoring.logEvent — never throws, so a misbehaving
// webhook can't block event recording.
async function evaluateAndDeliver(eventType, message, metadata = {}) {
  if (!eventType) return;
  let rules;
  try {
    const result = await db.query(
      `SELECT id, workspace_id, name, event_pattern, channels
         FROM alert_rules
        WHERE enabled = true`,
    );
    rules = result.rows;
  } catch (err) {
    console.error("Failed to load alert rules for evaluation:", err.message);
    return;
  }

  // Workspace context lets a rule scope itself to events for its own workspace
  // when the event metadata carries a workspace id. Without that scoping, every
  // rule would fire for every workspace's events.
  const eventWorkspaceId = metadata?.workspace?.id || metadata?.workspaceId || null;

  const matches = rules.filter((rule) => {
    if (!patternMatches(rule.event_pattern, eventType)) return false;
    if (eventWorkspaceId && rule.workspace_id !== eventWorkspaceId) return false;
    return true;
  });

  if (matches.length === 0) return;

  const payload = { eventType, message, metadata, firedAt: new Date().toISOString() };
  await Promise.all(
    matches.map(async (rule) => {
      const channels = Array.isArray(rule.channels) ? rule.channels : [];
      const errors = [];
      for (const channel of channels) {
        try {
          const channelPayload = { ...payload, ruleId: rule.id, ruleName: rule.name };
          if (channel.type === "webhook") {
            await deliverWebhook(channel, channelPayload);
          } else if (channel.type === "email") {
            await deliverEmail(channel, channelPayload);
          }
        } catch (err) {
          errors.push(`${channel.type}:${err.message}`);
        }
      }
      await recordFiring(rule.id, errors.join("; ") || null);
    }),
  );
}

module.exports = {
  SUPPORTED_CHANNEL_TYPES,
  createRule,
  deleteRule,
  evaluateAndDeliver,
  getRule,
  listRules,
  patternMatches,
  serializeRule,
  updateRule,
};
