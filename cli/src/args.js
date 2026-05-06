// Tiny argv parser — no external dependency. Recognizes:
//   --flag value       (next token is the value unless it starts with --)
//   --flag=value
//   --flag             (boolean true)
//   positional args (everything that isn't a flag)
// Returns { positional: string[], flags: Record<string, string|boolean> }.

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq >= 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        i += 1;
        continue;
      }
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[name] = true;
        i += 1;
      } else {
        flags[name] = next;
        i += 2;
      }
    } else {
      positional.push(token);
      i += 1;
    }
  }
  return { positional, flags };
}

module.exports = { parseArgs };
