# `@nora/cli`

Command-line interface for [Nora](https://github.com/solomon2773/nora). Talks to the public REST API exposed by every Nora installation.

## Install

```bash
npm install -g @nora/cli
# or run without installing
npx @nora/cli --help
```

Requires Node.js 24 or newer.

## First run

```bash
# 1. Mint an API key in the dashboard at /app/workspaces/<id>/api-keys
# 2. Tell the CLI where Nora lives and which token to use:
nora login --host https://nora.example.com --token nora_xxxxxxxx

# 3. Optionally pin a default workspace:
nora workspaces list
nora workspaces use <workspace-id>
```

Credentials are stored at `~/.nora/config.json` (mode 0600). `NORA_HOST`, `NORA_TOKEN`, and `NORA_WORKSPACE_ID` env vars override the on-disk config — use them in CI.

## Commands

```text
nora workspaces list             # workspaces you can access (with role)
nora workspaces use <id>         # set active workspace
nora workspaces show             # print active workspace id

nora agents list                 # agents in the workspace
nora agents get <id>             # full JSON for one agent
nora agents start  <id>
nora agents stop   <id>
nora agents restart <id>
nora agents redeploy <id>
nora agents versions <id>        # configuration history
nora agents rollback <id> <vid>  # restore a prior version

nora monitoring metrics          # current metrics
nora monitoring events --limit 50
nora monitoring tail --interval 5000
```

## Scopes

The token must carry the matching scope for the operation:

| Operation | Required scope |
|---|---|
| `agents list/get` | `agents:read` |
| `agents start/stop/restart/redeploy/rollback` | `agents:write` |
| `workspaces list/show/use` | `workspaces:read` |
| `monitoring *` | `monitoring:read` |

Issuing API keys, mutating workspace membership, and other privileged flows require session authentication and are not available through the CLI.

## License

Apache-2.0.
