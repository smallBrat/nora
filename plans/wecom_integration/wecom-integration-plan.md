# WeCom Integration Plan

This plan breaks WeCom into small, testable phases with the same general Nora pattern used by the
existing integration plans: backend contracts first, then operator UI, then runtime activation and
status semantics. The source of truth for scope, ownership, reusable pieces, and open questions is
[wecom_integration_manifest.md](/Users/justinchan/Desktop/repos/nora/plans/wecom_integration/wecom_integration_manifest.md).

---

## Phase 0: Scope Lock And Catalog Scaffolding
### Goal
Create the minimum catalog and backend scaffolding so WeCom can exist as a first-class integration
without committing prematurely to every plugin capability.

### Backend
Files to create/modify:
- `backend-api/integrations/catalog/catalog.json`
- `backend-api/integrations/providers/wecom/index.ts`
- `backend-api/integrations/index.ts`
- `backend-api/integrations/services/integrationsService.ts`
- `backend-api/routes/integrations.ts`

Tasks:
- Add a `wecom` catalog entry.
- Add config fields for:
  - top-level mode selector
  - default account basics
  - optional extra named accounts in a simple v1 shape
  - Bot mode basics
  - Agent mode basics
  - default policy fields
  - collapsed Advanced sections for media/network/dynamic-agent-style plugin options
- Create a placeholder `wecomProvider` registration.
- Reserve any WeCom-specific route stubs if needed for later activation/test status work.
- Define an explicit draft activation-state model for WeCom that is stronger than Nora's current
  generic “active integration row exists” behavior.

Do NOT touch:
- actual plugin install commands
- rich multi-account account-card UX
- dynamic agents as a Nora product feature
- built-in WeCom skills as separate Nora product surfaces

### Frontend
Files to create/modify:
- `frontend-dashboard/components/agents/IntegrationCard.tsx`
- `frontend-dashboard/components/agents/IntegrationDetailPanel.tsx`

Tasks:
- Make the integration form capable of mode-first rendering:
  - user picks Bot / Agent / Both
  - mode-specific sections appear below
- Support the agreed UX direction:
  - advanced sections present but collapsed
  - defaults prefilled
- Keep the initial multi-account UX simple and compatible with the existing integrations form
  pattern rather than introducing a large custom account-management UI.
- Preserve generic catalog-driven behavior for all other integrations.

### Acceptance Criteria
- [ ] WeCom exists in the catalog and renders in the Integrations UI.
- [ ] The UI can conditionally show mode-specific fields from a single WeCom integration entry.
- [ ] A placeholder provider can be registered without breaking startup.
- [ ] The plan for WeCom activation state is explicit enough to guide later backend/UI work.

### ✅ Gate
Do not proceed until the simple v1 multi-account shape and activation-state semantics are confirmed.

---

## Phase 1: Config Storage, Validation, And Redacted Readback
### Goal
Persist WeCom config cleanly through the existing integrations system.

### Backend
Files to create/modify:
- `backend-api/integrations/providers/wecom/index.ts`
- `backend-api/integrations/services/integrationsService.ts`
- `backend-api/integrations/repository/integrationsRepository.ts`
- `backend-api/__tests__/integrations.test.ts`

Tasks:
- Implement `normalizeWecomConfigInput(...)`.
- Define which WeCom fields are secrets and ensure they are encrypted/redacted.
- Support create, list, update, and disconnect through the existing integration pipeline.
- Ensure stored config reads back in a UI-friendly nested shape.
- Support the chosen simple multi-account shape without breaking generic form editing.
- Introduce the backend representation for saved-vs-activation state if that does not fit cleanly
  inside the current generic integration `status` semantics.

### Frontend
Files to create/modify:
- `frontend-dashboard/components/agents/IntegrationsTab.tsx`
- `frontend-dashboard/components/agents/IntegrationCard.tsx`
- `frontend-dashboard/components/agents/IntegrationDetailPanel.tsx`

Tasks:
- Submit WeCom config through the existing connect/save flow.
- Preserve password/secret field behavior on edit.
- Keep the UX mode-first and default-prefilled.
- Ensure the form can preserve/edit the simple multi-account shape without turning into a bespoke
  WeCom-only management screen.

### Acceptance Criteria
- [ ] WeCom integrations can be created and updated through the generic integrations routes.
- [ ] Sensitive WeCom config is encrypted at rest and redacted on read.
- [ ] Mode-specific defaults render and persist correctly.
- [ ] A saved-but-not-yet-activated state can be represented cleanly if activation later fails.

### ✅ Gate
Do not proceed until the saved config shape is stable.

---

## Phase 2: OpenClaw Plugin Installation And Activation
### Goal
Turn a saved WeCom integration into a live capability on OpenClaw agents.

### Backend
Files to create/modify:
- `backend-api/routes/integrations.ts`
- `backend-api/authSync.ts`
- optional new helper:
  - `backend-api/integrations/providers/wecom/install.ts`
- `backend-api/__tests__/agents.test.ts`

Tasks:
- Add a WeCom-specific post-connect activation step.
- Implement the locked install strategy:
  - manual `openclaw plugins install @wecom/wecom-openclaw-plugin`
  - explicit `openclaw config set ...` writes
  - Nora-controlled restart/reload
  - post-activation verification
- Treat the official WeCom CLI installer and `openclaw channels add` as fallback/manual operator
  tools rather than Nora's primary automation path.
- Write the mode-specific OpenClaw config.
- Restart/reload the gateway using a container-appropriate Nora strategy rather than assuming
  `openclaw gateway restart` is the right primitive.
- Return actionable operator errors when install/config verification fails.
- Decide and implement what happens when persistence succeeds but activation fails:
  - retain the integration as saved but inactive / activation-failed
  - surface retryable status to the UI

Do NOT touch:
- Hermes support
- rich multi-account routing/bindings UX beyond the chosen simple shape
- full WeCom skill surfacing

### Acceptance Criteria
- [ ] Connecting WeCom on an OpenClaw agent can install/configure the plugin.
- [ ] Updating the integration can reconcile the plugin config safely.
- [ ] Disconnecting WeCom can disable or clean up the configured runtime state.
- [ ] The one-click connect flow handles save + activation as a single operator action.
- [ ] Activation failures produce a stable saved-but-inactive state rather than losing the stored config.
- [ ] The implementation is validated against Nora's actual containerized OpenClaw environment.

### ✅ Gate
Do not proceed until a single-agent OpenClaw install flow is reliable.

---

## Phase 3: Status, Test, And Operator Guidance
### Goal
Make the integration understandable and supportable from the UI.

### Backend
Files to create/modify:
- `backend-api/routes/integrations.ts`
- optional status helper module(s)

Tasks:
- Add WeCom-specific test/status behavior if the generic test contract is insufficient.
- Expose activation/install failures in a clean UI-facing shape.
- Surface any follow-up instructions still required in the WeCom admin console.
- Add stronger validation checks that aim beyond “record saved”, ideally including:
  - plugin installed
  - config written
  - gateway healthy
  - callback/config readiness where detectable
- Make the activation state model explicit in backend responses and not just implicit in logs.

### Frontend
Files to create/modify:
- `frontend-dashboard/components/agents/IntegrationDetailPanel.tsx`
- `frontend-dashboard/components/agents/ActiveIntegrationRow.tsx`

Tasks:
- Show mode and activation status clearly.
- Show any required follow-up steps or callback URL hints.
- Make it obvious whether the integration is merely saved vs actually active in OpenClaw.
- Preserve the current Integrations detail-panel look and feel while adding WeCom-specific status
  cards/summary content.

### Acceptance Criteria
- [ ] Operators can distinguish saved config from active plugin state.
- [ ] Errors are clear enough to fix setup without reading backend logs.
- [ ] Callback URL guidance and readiness hints are visible enough to complete Agent mode setup.

### ✅ Gate
Do not proceed until the support/debug story is acceptable.

---

## Phase 4: Optional Capability Expansion
### Goal
Decide how much of the plugin surface Nora should expose after basic activation works.

Possible follow-up areas:
- richer policy editing
- cron/announce patterns for WeCom delivery
- selected plugin capabilities surfaced intentionally in Nora
- richer multi-account routing/bindings UX
- dynamic agent routing

Explicitly not required for MVP:
- individually modeled plugin-bundled WeCom skills
- dynamic agents as a Nora-managed product surface
- advanced media/network tuning as deeply supported Nora features
