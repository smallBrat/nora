const api = require("../client");
const { load, save } = require("../config");

function table(rows, columns) {
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((row) => String(col.value(row) ?? "").length)),
  );
  const fmt = (cells) => cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ");
  console.log(fmt(columns.map((c) => c.header)));
  console.log(fmt(widths.map((w) => "-".repeat(w))));
  for (const row of rows) console.log(fmt(columns.map((c) => c.value(row))));
}

async function list() {
  const rows = await api.get("/api/workspaces");
  const active = load().workspaceId;
  table(rows, [
    { header: "ID", value: (r) => r.id },
    { header: "NAME", value: (r) => r.name },
    { header: "ROLE", value: (r) => r.role || "—" },
    { header: "ACTIVE", value: (r) => (r.id === active ? "✓" : "") },
  ]);
}

async function use(args) {
  const id = args[0];
  if (!id) throw new Error("usage: nora workspaces use <workspace-id>");
  save({ workspaceId: id });
  console.log(`Active workspace set to ${id}`);
}

async function show() {
  const cfg = load();
  if (!cfg.workspaceId) {
    console.log("No active workspace. Run `nora workspaces use <id>`.");
    return;
  }
  console.log(cfg.workspaceId);
}

module.exports = {
  describe: "List, switch, or print the active workspace",
  subcommands: {
    list: { run: list, describe: "List workspaces you can access" },
    use: { run: use, describe: "Set the active workspace (writes ~/.nora/config.json)" },
    show: { run: show, describe: "Print the active workspace id" },
  },
};
