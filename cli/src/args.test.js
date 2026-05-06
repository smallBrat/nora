// Run with: node --test cli/src/args.test.js

const test = require("node:test");
const assert = require("node:assert");
const { parseArgs } = require("./args");

test("parses positional + flags with separated value", () => {
  const result = parseArgs(["agents", "list", "--limit", "20"]);
  assert.deepStrictEqual(result.positional, ["agents", "list"]);
  assert.deepStrictEqual(result.flags, { limit: "20" });
});

test("parses --flag=value form", () => {
  const result = parseArgs(["login", "--host=https://nora.example.com"]);
  assert.strictEqual(result.flags.host, "https://nora.example.com");
});

test("treats lone --flag as boolean true", () => {
  const result = parseArgs(["agents", "list", "--verbose", "--limit", "5"]);
  assert.strictEqual(result.flags.verbose, true);
  assert.strictEqual(result.flags.limit, "5");
});

test("--flag followed by another --flag treats first as boolean", () => {
  const result = parseArgs(["--help"]);
  assert.deepStrictEqual(result.flags, { help: true });
  assert.deepStrictEqual(result.positional, []);
});
