// Persistence for the CLI: stores host + API key + active workspace id in
// ~/.nora/config.json (chmod 0600). Reads NORA_HOST and NORA_TOKEN env vars
// as overrides so CI workflows don't have to write to disk.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const CONFIG_DIR = path.join(os.homedir(), ".nora");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function readDisk() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeDisk(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function load() {
  const disk = readDisk();
  return {
    host: process.env.NORA_HOST || disk.host || null,
    token: process.env.NORA_TOKEN || disk.token || null,
    workspaceId: process.env.NORA_WORKSPACE_ID || disk.workspaceId || null,
    diskHost: disk.host || null,
    diskToken: disk.token || null,
    diskWorkspaceId: disk.workspaceId || null,
  };
}

function save({ host, token, workspaceId } = {}) {
  const current = readDisk();
  const next = { ...current };
  if (host !== undefined) next.host = host;
  if (token !== undefined) next.token = token;
  if (workspaceId !== undefined) next.workspaceId = workspaceId;
  writeDisk(next);
  return next;
}

function clear() {
  try {
    fs.unlinkSync(CONFIG_PATH);
  } catch {
    // already absent
  }
}

module.exports = {
  CONFIG_PATH,
  load,
  save,
  clear,
};
