const { save, load, CONFIG_PATH } = require("../config");

function normalizeHost(value) {
  if (!value) return null;
  let host = String(value).trim();
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`;
  return host.replace(/\/+$/, "");
}

async function run(_args, flags) {
  const host = normalizeHost(flags.host);
  const token = typeof flags.token === "string" ? flags.token.trim() : null;
  const workspaceId = typeof flags.workspace === "string" ? flags.workspace.trim() : null;

  if (!host && !load().host) {
    throw new Error("Specify --host on first login (e.g. --host https://nora.example.com)");
  }
  if (!token) {
    throw new Error("--token is required (mint one at /app/workspaces/<id>/api-keys)");
  }
  if (!token.startsWith("nora_")) {
    throw new Error("Token does not look like a Nora API key (expected nora_ prefix)");
  }

  const next = save({
    host: host || undefined,
    token,
    workspaceId: workspaceId || undefined,
  });

  console.log(`Saved credentials to ${CONFIG_PATH}`);
  console.log(`Host:      ${next.host}`);
  console.log(`Token:     ${token.slice(0, 16)}…`);
  if (next.workspaceId) console.log(`Workspace: ${next.workspaceId}`);
}

module.exports = { run, describe: "Save Nora host + API token to ~/.nora/config.json" };
