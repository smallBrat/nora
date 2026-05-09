---
name: add-integration
description: Add a new integration provider to the Nora integrations module. Generates the Provider strategy file under backend-api/integrations/providers/, an entry in catalog/catalog.json, a unit test, registration in integrationsService.ts, and (when applicable) trims legacy connectivityTests + envMaps entries. Handles api_key, oauth2 (with refreshCredentials), and basic auth providers. Triggers on "/add-integration <provider-id>" or any request to add/wire a new provider into the integrations registry.
---

# add-integration

Use this skill when the user wants to add a new integration provider (Slack, GitHub-style API tools, OAuth services, etc.) to the Nora platform. It codifies the workflow established during the SOLID refactor of `backend-api/integrations/`.

## When to invoke

- The user says "add a new integration for X" / "wire up X as a provider" / "/add-integration X".
- The user wants to migrate a provider that currently lives in `providers/legacy/connectivityTests.ts` to the strategy interface.
- The user is adding a brand-new provider that isn't in the legacy switch at all.

## Argument modes

The skill operates in two modes; pick based on the invocation:

**Template mode** — invoked with `/add-integration <id>` plus a JSON spec, or the user supplies the provider id along with auth type, env var, and any tool specs. Generate everything from the spec without further prompting.

**Interactive mode** — invoked with `/add-integration` (no args) or with just an id. Ask the user, in this order:

1. Provider id (lowercase, kebab-case if multi-word; matches the catalog id)
2. Display name (e.g. "GitHub", "Twitter / X")
3. Category (one of: `developer-tools`, `communication`, `ai-ml`, `cloud`, `databases`, `data`, `crm`, `payments`, `social`, `monitoring`, `devops`, `productivity`, `analytics`, `e-commerce`, `automation`)
4. Description (one-line, user-facing)
5. Auth type — exactly one of `api_key`, `oauth2`, `basic`, `webhook`, `custom`
6. Primary env var name (e.g. `GITHUB_TOKEN`, `LINKEDIN_ACCESS_TOKEN`)
7. API base URL or test endpoint (the URL the connectivity test should hit)
8. Optional config fields (key, label, type [text/password/url], required flag) — repeat or skip
9. Optional tool specs (catalog entries that the LLM gateway can invoke) — repeat or skip
10. **If `auth_type === "oauth2"`**: also collect the OAuth token URL and the scopes the refresh flow expects

Only ask one batch of questions. If the user wants more fields/tools afterwards, they can re-edit the catalog JSON manually.

## Files the skill touches

**Creates:**
- `backend-api/integrations/providers/<id>.ts` — strategy implementation
- `backend-api/__tests__/providers/<id>Provider.test.ts` — focused unit tests

**Edits (in this order):**
- `backend-api/integrations/catalog/catalog.json` — append the catalog entry
- `backend-api/integrations/services/integrationsService.ts` — import + register
- `backend-api/integrations/index.ts` — re-export the new provider
- `backend-api/integrations/providers/legacy/connectivityTests.ts` — delete the entry if the provider was previously legacy
- `backend-api/integrations/providers/legacy/envMaps.ts` — delete its env-map rows if previously legacy
- `backend-api/integrations/AGENTS.md` — add the new provider to the migrated list
- **`backend-api/routes/integrations.ts` — when `auth_type === "oauth2"`, append the constants block + start/callback routes from `templates/oauth_routes.ts.tmpl`. The frontend (`frontend-dashboard/components/agents/IntegrationsTab.tsx`) already routes to `/api/agents/:id/integrations/<id>/oauth/start` whenever the catalog reports `authType: "oauth2"` — no frontend changes needed.**

**Never touches:**
- `agent-runtime/lib/integrationTools.ts` — runtime side; reads from synced catalog
- `backend-api/integrations/services/hermesManifest.ts` — generates per-provider Hermes files automatically from synced catalog data, no per-provider edits needed
- The shim files (`backend-api/integrations.ts`, `backend-api/integrationRuntimeFiles.ts`)

**Hermes / OpenClaw runtime support is automatic**: once the provider is registered and the catalog has an entry, both runtimes pick it up via the existing sync paths (`getIntegrationsForSync` → `buildIntegrationToolCatalogEntries` for OpenClaw, `buildHermesIntegrationInstallCommand` for Hermes). No per-runtime code is required.

## Strategy file templates

Pick the template that matches the auth type. Copy as the body of `backend-api/integrations/providers/<id>.ts` and substitute the placeholders.

Templates in this skill directory:
- `templates/api_key.ts.tmpl` — simple API-key/Bearer providers (github, slack, …)
- `templates/oauth2.ts.tmpl` — OAuth 2.0 with `refreshCredentials` + `sanitizeForSync` (twitter, linkedin, …)
- `templates/basic.ts.tmpl` — Basic auth with site-URL validation (jira, bitbucket, …)
- `templates/test.ts.tmpl` — unit-test scaffold for the provider
- `templates/oauth_routes.ts.tmpl` — **only for `oauth2` providers**: constants + start/callback routes appended to `backend-api/routes/integrations.ts`

Read each with the Read tool when generating. Substitute the `{{PLACEHOLDER}}` tokens.

## OAuth2 — additional steps

If `auth_type === "oauth2"`, the strategy file alone is not enough — the dashboard's "Authorize with X" button needs an OAuth start route, and LinkedIn/Twitter style flows need a callback route to exchange the code for tokens. Generate both from `templates/oauth_routes.ts.tmpl` and append to `backend-api/routes/integrations.ts`.

Required substitutions in addition to the strategy template:
- `{{AUTHORIZE_URL}}` — provider's authorization endpoint (e.g. `https://www.linkedin.com/oauth/v2/authorization`)
- `{{TOKEN_URL}}` — token-exchange endpoint
- `{{USERINFO_URL}}` — endpoint to fetch the connected user's profile after exchange
- `{{SCOPES_ARRAY}}` — JS array literal of scope strings
- `{{IDENTITY_FIELD}}` — JSON field on the userinfo response that names the user (e.g. `name`, `username`, `login`)
- `{{ID_CAP}}` — provider id capitalized (e.g. `Linkedin`, `Twitter`)
- `{{ID_CAP_UPPER}}` — provider id uppercased (e.g. `LINKEDIN`, `TWITTER`) for constant names

The catalog entry for OAuth2 providers must declare `client_id` (required, type=text) and `client_secret` (required, type=password) as configFields — these are what the dashboard collects before kicking off the OAuth flow. Optionally include `default_username` (type=text, not required) for display.

**Frontend wiring is automatic:** `IntegrationsTab.tsx` checks `item.authType === "oauth2"` and routes to `POST /api/agents/:id/integrations/<id>/oauth/start`. Once `oauth_routes.ts.tmpl` is appended, the flow works end-to-end after a backend restart (which re-seeds the catalog table from the JSON file).

## Catalog entry template

Append to `backend-api/integrations/catalog/catalog.json` (it's a JSON array). Do not introduce trailing commas. Match the existing style (2-space indent, double quotes):

```json
{
  "id": "<id>",
  "name": "<Display Name>",
  "icon": "<id>",
  "category": "<category>",
  "description": "<one-line description>",
  "authType": "<api_key|oauth2|basic|webhook|custom>",
  "configFields": [
    { "key": "<primary_field>", "label": "<Label>", "type": "password", "required": true, "placeholder": "..." }
  ],
  "capabilities": ["read"],
  "toolSpecs": [],
  "api": { "type": "rest", "baseUrl": "<base-url>" },
  "mcp": { "available": false },
  "usageHints": []
}
```

For OAuth2 providers, the catalog `configFields` should not include `client_id`, `client_secret`, or `refresh_token` — those are stored encrypted but should be marked as runtime-managed in the provider's `sanitizeForSync`.

## Registration

Edit `backend-api/integrations/services/integrationsService.ts`:

1. Add an import alongside the others: `const { <id>Provider } = require("../providers/<id>");`
2. Add `<id>Provider` to the array passed to `providerRegistry.register`.

Edit `backend-api/integrations/index.ts`:

3. Add `export { <id>Provider } from "./providers/<id>";` next to the other provider exports.

## Legacy cleanup (only if the provider was already in legacy)

If the provider id appears in `backend-api/integrations/providers/legacy/connectivityTests.ts`:

- Remove the `<id>: async () => { ... }` entry verbatim. Leave the surrounding object commas correct.
- Remove the corresponding row from `INTEGRATION_ENV_MAP` in `backend-api/integrations/providers/legacy/envMaps.ts`. Replace with a `// <id> → migrated to providers/<id>.ts` marker comment if helpful.
- Remove any `<id>.<configKey>` rows from `INTEGRATION_CONFIG_ENV_MAP` in the same file. The new provider's `mapToEnv` is canonical.

If the provider was never in legacy, skip this step.

## Documentation

Append the new provider to the migrated-providers list in `backend-api/integrations/AGENTS.md` (the diagram block under "Architecture" and the prose description).

## Validation steps

After all edits, run these in order. If any fails, report the failure and stop — do not auto-revert.

```bash
cd /home/projects/nora/backend-api && npx prettier --write \
  'integrations/providers/<id>.ts' \
  '__tests__/providers/<id>Provider.test.ts' \
  'integrations/services/integrationsService.ts' \
  'integrations/index.ts' \
  'integrations/catalog/catalog.json' \
  'integrations/providers/legacy/*.ts'

cd /home/projects/nora/backend-api && npx tsc --noEmit

cd /home/projects/nora/backend-api && npm test -- --no-coverage
```

Surface counts at the end: "Tests: <pass>/<total> passing, prettier clean, tsc clean".

## Reporting back

After validation, report:

- Path of the new provider file and test file
- The catalog entry id
- Whether legacy entries were removed (yes/no)
- The test/typecheck/format results
- One-liner: `git status` so the user sees the diff scope before committing

Do NOT commit or push automatically. Leave that to the user.

## Common pitfalls

- **OAuth2 providers must implement `refreshCredentials` AND `sanitizeForSync`**: refresh handles token rotation; sanitize strips `client_id`/`client_secret`/`refresh_token` from anything written to the runtime.
- **Provider ids are case-sensitive and lowercase**: `docker-hub`, not `DockerHub`. Matches the catalog `id` and the existing `INTEGRATION_ENV_MAP` keys.
- **`mapToEnv` should only emit env entries for fields the runtime actually needs.** Don't blindly mirror every `configField` — only the ones that map to documented env vars (e.g. `LINKEDIN_ACCESS_TOKEN`, `JIRA_BASE_URL`, etc.).
- **Tests must use `deps.fetch`, not `global.fetch` directly**, so the test can pass a mocked fetch through the deps argument.
- **Don't skip the AGENTS.md update**. The `Maintenance Rule` in `backend-api/integrations/AGENTS.md` requires it on any provider/architecture change.

## Reference

- SOLID refactor commits that established this pattern: `929e5da` … `b3e59a4` on master.
- Plan file: `/root/.claude/plans/scan-all-backend-api-code-cosmic-locket.md` (project-local, not in git).
- Provider interface: `backend-api/integrations/types/provider.ts`.
- Concrete examples to mirror: `providers/github.ts` (api_key), `providers/twitter.ts` (oauth2 with refresh + sanitize), `providers/jira.ts` (basic auth with site URL validation).
