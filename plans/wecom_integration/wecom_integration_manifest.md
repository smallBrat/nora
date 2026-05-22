# WeCom Integration Manifest

## Overview

Add WeCom to Nora as an integration-first feature for OpenClaw agents. The initial scope is
configuration, installation, and activation of the official WeCom OpenClaw plugin from Nora's
integrations surface, with messaging treated as a capability of the integration rather than as a
standalone Nora channel.

The intended operator experience should match Nora's current integrations UX closely. WeCom should
feel like a first-class catalog integration inside the existing Integrations tab, not like a
special-case wizard or a separate channel-management screen.

## Ownership

| Layer | Owns |
|---|---|
| **Integration** | WeCom connection mode selection, plugin config shape, credential storage, setup/test UX |
| **Nora** | Integration catalog/UI, secret storage, connect/update/remove flows, plugin install/config orchestration, runtime sync, operator visibility |
| **OpenClaw plugin** | WeCom protocol handling, callback/websocket handling, delivery behavior, policy enforcement, built-in WeCom capabilities |
| **Agent** | Uses WeCom messaging and future WeCom tool capabilities once the plugin is installed and configured |

## Locked Decisions

- WeCom should be modeled as an **integration-first** feature, not as a Telegram/WhatsApp-style Nora-native channel.
- The first setup surface should ask the user which **connection mode** they want:
  - Bot
  - Agent
  - Both
- The frontend should use catalog-driven fields and prefilled defaults where practical.
- The first implementation target should be **OpenClaw agents only**.
- Nora should install/configure the official WeCom OpenClaw plugin rather than reimplementing the WeCom transport itself.
- V1 should support **both Bot and Agent mode** in the same integration.
- V1 should live in **Integrations only**, not as a separate Nora Channels feature.
- Connect should be a **one-click connect** flow: save + install/configure in one action.
- V1 should allow **multiple WeCom accounts/config entries** within the integration shape.
- Advanced/plugin-heavy options should be present but **collapsed under Advanced** by default.
- V1 testing should aim for a **thorough activation check**, not just “config saved”.
- The WeCom setup and edit experience should follow the **existing Nora integrations look and
  feel exactly**, using the same catalog card, connect form, active-integrations list, and
  right-side detail panel patterns rather than introducing a bespoke WeCom-specific screen.
- Nora's primary automation path should use:
  - manual plugin install
  - explicit `openclaw config set ...` writes
  - Nora-managed restart/reload + verification
  rather than relying on the interactive WeCom CLI installer as the main one-click path.
- Plugin-bundled WeCom skills should be treated as **inherited plugin capability content** in v1,
  not as individually modeled Nora features.

## Current Repo State

| Status | Item |
|---|---|
| Exists | Generic integration catalog/UI flow via `integration_catalog`, `catalog.json`, `IntegrationsTab.tsx`, `IntegrationCard.tsx`, and `IntegrationDetailPanel.tsx` |
| Exists | Generic integration CRUD + sync orchestration via `routes/integrations.ts` and `integrationsService.ts` |
| Exists | Backend command execution helpers via `runContainerCommand()` and `runRuntimeCommand()` in `backend-api/authSync.ts` |
| Exists | Worker-side command execution helper via `runProvisionerExecCommand()` in `workers/provisioner/worker.ts` |
| Exists | Runtime metadata sync endpoint `POST /integrations/sync` in `agent-runtime/lib/server.ts` |
| Exists | OpenClaw plugin-install precedent in `backend-api/channels/openclaw.ts` |
| Exists | Current Nora integrations are effectively treated as “connected” once an active integration row is persisted; there is no strong generic activation-state model today |
| Missing | `wecom` integration catalog entry |
| Missing | `backend-api/integrations/providers/wecom/` provider module |
| Missing | WeCom-specific post-connect install/config orchestration |
| Missing | Clear product decision on whether Nora exposes any WeCom capability beyond connection/messaging/status in v1 |

## Reusable Nora Pieces

### Catalog + UI
- `backend-api/integrations/catalog/catalog.json`
- `backend-api/integrations/catalog/catalogLoader.ts`
- `frontend-dashboard/components/agents/IntegrationsTab.tsx`
- `frontend-dashboard/components/agents/IntegrationCard.tsx`
- `frontend-dashboard/components/agents/IntegrationDetailPanel.tsx`

### Persistence + service orchestration
- `backend-api/integrations/repository/integrationsRepository.ts`
- `backend-api/integrations/services/integrationsService.ts`
- `backend-api/routes/integrations.ts`

### Runtime / agent-side installation execution
- `backend-api/authSync.ts`
  - `runContainerCommand()`
  - `runRuntimeCommand()`
- `workers/provisioner/worker.ts`
  - `runProvisionerExecCommand()`
- `backend-api/channels/openclaw.ts`
  - existing OpenClaw plugin enable/install command patterns

## Frontend UX Contract

The WeCom integration should preserve the same operator interaction model that Nora already uses
for integrations today.

### Catalog Browse Surface

- WeCom should appear as a normal item in the catalog grid within the Integrations tab.
- It should participate in the same search/category filtering behavior as other integrations.
- Clicking the WeCom card should open the same connect/config surface used by existing
  integrations.

### Connect Surface

- WeCom should use the existing `IntegrationCard`-style setup flow rather than a separate page or
  wizard.
- The first visible section should establish **Connection Mode**:
  - Bot
  - Agent
  - Both
- After mode selection, only the relevant configuration groups should be shown.
- Defaults should be prefilled where the plugin/README gives clear defaults.
- Plugin-heavy or less-common settings should appear under the same **collapsed Advanced**
  treatment already used elsewhere in Nora.
- The connect action should remain a single operator action: **Connect** should save, attempt
  activation, and then surface test/activation results inline.

### Active Integration Surface

- Once connected, WeCom should appear in the existing **Active Integrations** master/detail
  layout.
- The left side should remain a selectable list of active integrations.
- The right side should remain the editable detail panel for the selected integration.
- WeCom should not introduce a separate management page for status/config unless the generic Nora
  integration layout proves insufficient.

### Detail Panel Expectations

- The right-side detail panel should preserve the same Nora visual structure:
  - status / summary information at the top
  - editable configuration below
  - advanced sections collapsed by default
  - save / test / disconnect actions in the same general action area
- WeCom-specific state should be expressed within that existing pattern, for example:
  - selected mode
  - activation/install status
  - callback/setup readiness hints
  - account summary

### Explicit Non-Goals For V1

- No standalone WeCom onboarding page
- No separate WeCom-specific channel management surface
- No custom visual design language that breaks from current Integrations tab behavior
- No requirement for the operator to leave the Integrations tab to perform ordinary config/edit
  tasks

## Backend Contract

The backend should treat WeCom as a normal Nora integration record plus a WeCom-specific
activation/orchestration layer for OpenClaw agents.

### Catalog And Schema Ownership

- The WeCom integration definition should live in
  `backend-api/integrations/catalog/catalog.json`.
- The catalog entry should drive the frontend form shape through the existing catalog loader and
  integration UI pipeline.
- Mode-specific and advanced WeCom fields should be described in the same catalog-driven way as
  other integrations rather than through a hardcoded frontend-only form.

### Provider Module Responsibilities

The WeCom provider module should own configuration semantics, not runtime side effects.

Expected responsibilities:
- normalize the stored config shape
- validate mode-specific requirements
- define which fields are secret/sensitive
- redact secret fields on read
- optionally map config into runtime-facing env/config representations
- optionally perform provider-level validation or test logic when feasible

Expected non-responsibilities:
- direct container exec
- plugin installation
- gateway restart/reload
- long-running orchestration or recovery flows

### Persistence Model

- The connected WeCom integration record should be stored in the existing `integrations` table.
- The UI/schema metadata should continue to come from `integration_catalog`.
- The initial WeCom implementation should not require a separate bespoke WeCom table if the config
  can live cleanly inside `integrations.config`.
- Multi-account support should be modeled in the integration config shape itself unless a later
  phase proves that a relational account table is necessary.

### Connect And Update Flow

- `POST /api/agents/:agentId/integrations` should remain the primary entry point for a new WeCom
  connection.
- `PUT /api/agents/:agentId/integrations/:integrationId` should remain the primary entry point
  for WeCom config edits.
- The generic integrations flow should:
  1. normalize and validate config
  2. encrypt/store secrets
  3. persist the integration row
  4. trigger WeCom-specific activation work for OpenClaw agents

### Activation / Installation Flow

- Nora should perform activation as part of the one-click connect flow.
- The activation layer should be responsible for:
  - ensuring the WeCom plugin is installed
  - writing the OpenClaw config needed for Bot / Agent / Both mode
  - restarting or reloading the gateway if required
  - verifying whether the agent has become activation-ready
- The activation layer should live in backend orchestration code, not inside the provider's
  pure config helpers.
- The preferred automation path should be:
  1. install the plugin with `openclaw plugins install @wecom/wecom-openclaw-plugin`
  2. write config explicitly with `openclaw config set channels.wecom...`
  3. perform a Nora-controlled restart/reload strategy suitable for containerized OpenClaw agents
  4. verify post-activation readiness/status
- The official WeCom CLI installer and interactive `openclaw channels add` flow should be treated
  as manual/operator fallback tools rather than Nora's primary backend automation path.

### Runtime Sync Expectations

- Nora should continue to use the existing integrations sync machinery to send non-sensitive
  integration metadata into the runtime.
- If the plugin needs additional runtime-resident config beyond normal metadata sync, that should
  be treated as part of activation/orchestration rather than as an entirely separate Nora product
  surface.
- The runtime sync path should not become the primary owner of WeCom setup semantics; it should
  remain a secondary propagation mechanism.

### Testing And Verification Expectations

- The backend contract should support a stronger notion of success than “record saved”.
- Desired verification signals include, where practical:
  - integration row persisted
  - plugin installed
  - config written successfully
  - gateway restarted/reloaded successfully
  - runtime/gateway returns healthy status
  - callback/webhook readiness can be inferred or surfaced when relevant
- The install path should be validated against Nora's actual containerized OpenClaw environment,
  not only against the README, because some documented OpenClaw service commands (for example,
  `openclaw gateway restart`) may not be the right primitive inside Nora-managed containers.

### Explicit Non-Goals For V1

- No Hermes runtime support
- No reimplementation of the WeCom protocol in Nora
- No separate Nora-native channel system for WeCom
- No requirement for WeCom-specific persistence tables unless the integration config shape proves
  insufficient
- No individual Nora product surfaces for each plugin-bundled WeCom skill

## Expected System Flow

1. Operator chooses WeCom in the Integrations tab.
2. Operator selects connection mode:
   - Bot
   - Agent
   - Both
3. UI reveals the mode-specific config fields with defaults.
4. Frontend posts the integration config to `POST /api/agents/:agentId/integrations`.
5. Backend normalizes, validates, encrypts, and stores the integration record in `integrations`.
6. Backend runs a WeCom-specific post-connect installer/configurator against the target OpenClaw agent.
7. Backend syncs integration metadata to the runtime.
8. Backend returns success/error plus any setup guidance that still must be completed in the WeCom admin console.

## Candidate Stored Config Shape

This is a draft shape, not final.

```json
{
  "mode": "bot",
  "bot": {
    "connectionMode": "websocket",
    "name": "企业微信",
    "botId": "xxx",
    "secret": "encrypted",
    "websocketUrl": "wss://openws.work.weixin.qq.com",
    "sendThinkingMessage": true
  },
  "agent": {
    "corpId": "ww1234567890abcdef",
    "corpSecret": "encrypted",
    "agentId": 1000002,
    "token": "encrypted",
    "encodingAESKey": "encrypted"
  },
  "policies": {
    "dmPolicy": "open",
    "allowFrom": [],
    "groupPolicy": "open",
    "groupAllowFrom": []
  }
}
```

## Plugin-Bundled Skills

The WeCom plugin repository ships a `skills/` directory containing OpenClaw skill folders built
around `SKILL.md` files and reference material. In this integration, those skills should be
understood as **plugin-bundled OpenClaw skills** that become available when the plugin is
installed/enabled, not as separate Nora-managed integrations or standalone Nora product modules.

Implications for v1:

- Nora does not need to model each WeCom skill as a separate integration or UI surface.
- Nora's main responsibility is to install/configure the plugin correctly so those bundled skills
  are available to OpenClaw as intended.
- Some skills may still depend on real plugin/runtime capabilities (for example MCP-backed or
  channel-backed operations), so they are more than passive docs, but Nora does not need to
  productize them individually in the MVP.

## Install / Configure Boundary

The most likely Nora boundary is:

- provider module:
  - normalize config
  - validate mode-specific requirements
  - redact / map env values
  - optional test logic

- route-level installer:
  - install/update plugin
  - write OpenClaw config
  - restart/reload gateway if required
  - sync integration metadata back to the runtime

This keeps provider logic declarative and puts side-effect-heavy runtime orchestration in the same
layer that already owns integration sync and OpenClaw-specific runtime behavior.