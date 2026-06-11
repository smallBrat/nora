// Connection resolution for the Nora MCP server.
//
// Precedence: explicit MCP env vars (NORA_API_URL / NORA_API_KEY), then the
// CLI-compatible env vars (NORA_HOST / NORA_TOKEN), then the CLI's on-disk
// config at ~/.nora/config.json — so `nora login` is all the setup an MCP
// client needs.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CONFIG_PATH = path.join(os.homedir(), ".nora", "config.json");

function readCliConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function loadConnection(env = process.env) {
  const disk = readCliConfig();
  const baseUrl = env.NORA_API_URL || env.NORA_HOST || disk.host || null;
  const apiKey = env.NORA_API_KEY || env.NORA_TOKEN || disk.token || null;
  return { baseUrl, apiKey };
}

export function requireConnection(env = process.env) {
  const { baseUrl, apiKey } = loadConnection(env);
  if (!baseUrl) {
    throw new Error(
      "Nora host is not configured. Set NORA_API_URL (e.g. https://nora.example.com) or run `nora login --host https://...`.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "No Nora API key found. Set NORA_API_KEY to a workspace API key (nora_...) or run `nora login --token nora_...`.",
    );
  }
  return { baseUrl, apiKey };
}
