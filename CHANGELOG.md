# Changelog

All notable changes to Nora are documented here. Each entry summarizes the
corresponding [GitHub release](https://github.com/solomon2773/nora/releases),
which carries the full notes and verification details.

## [v1.10.1](https://github.com/solomon2773/nora/releases/tag/v1.10.1) — 2026-06-11

- Clarified the supported runtime and deploy-target matrix across README, docs, dashboard, marketing copy, and setup prompts.
- Marked Proxmox as release-blocked/planned rather than currently supported; NemoClaw repositioned as an experimental sandbox profile.
- Backend support tests now enforce the documented Proxmox release gate.

## [v1.10.0](https://github.com/solomon2773/nora/releases/tag/v1.10.0) — 2026-06-08

- Hardened public signup: signup-specific burst and daily rate limits, duplicate-email short-circuiting before bcrypt, and safe duplicate responses.
- Optional Cloudflare Turnstile and Google reCAPTCHA bot protection on signup with server-side challenge verification.
- Documented the new signup abuse-protection settings in `.env.example` and the docs.

## [v1.9.2](https://github.com/solomon2773/nora/releases/tag/v1.9.2) — 2026-06-08

- Backend 5xx responses route through the central error handler instead of leaking raw exception text.
- Patched moderate dependency advisories (`ws`, `qs`); affected package audits back to zero vulnerabilities.
- Public-edge nginx hardening: auth/API rate-limit zones, worker tuning, Cloudflare real-IP guidance, and a launch-day runbook.
- Corrected NemoClaw setup docs (`ENABLED_SANDBOX_PROFILES=nemoclaw` + `NVIDIA_API_KEY`).

## [v1.9.1](https://github.com/solomon2773/nora/releases/tag/v1.9.1) — 2026-06-07

- Public-launch polish: homepage release badge, README tech-stack metadata, agent-runtime email polling init/reset logging fixes.

## [v1.9.0](https://github.com/solomon2773/nora/releases/tag/v1.9.0) — 2026-06-06

- Hermes runtime bootstrap support for managed environment variables and model configuration.
- Improved OpenClaw, Hermes, and Microsoft Foundry provider handling, including custom provider keys and deployment-specific Foundry models.
- Kubernetes runtime updates apply environment patches during provisioning; Docker runtime recovery improved.
- Refreshed documentation proof assets across operator, admin, and provisioning experiences.

## [v1.8.0](https://github.com/solomon2773/nora/releases/tag/v1.8.0) — 2026-06-04

- ClawHub skill deletion and drift reconciliation: view installed skills, delete from the dashboard, and surface runtime-only skills as orphaned drift.
- Actionable Kubernetes kubeconfig failure guidance.
- OpenClaw chat and tab UI polish.

## [v1.7.0](https://github.com/solomon2773/nora/releases/tag/v1.7.0) — 2026-05-26

- Kubernetes provisioning support across backend workers, admin UI, compose config, and smoke scripts for k3s, Kind, AKS, EKS, and GKE.
- WeCom integration with backend activation flow, catalog entries, and setup docs.
- Workspace cost visibility improvements and broader Agent Hub templates.

## [v1.6.1](https://github.com/solomon2773/nora/releases/tag/v1.6.1) — 2026-05-17

- Microsoft Foundry (Azure OpenAI) as a first-class LLM provider, wired from the setup wizard through OpenClaw custom-provider resolution.

## [v1.6.0](https://github.com/solomon2773/nora/releases/tag/v1.6.0) — 2026-05-16

- Email IMAP/SMTP integration with provider presets, live connection testing, optional reminder cron, and two-way sync.
- K3s as a first-class Kubernetes provisioner backend.
- Operator-runnable smoke harness covering K3s, AKS, EKS, and GKE.

## [v1.5.1](https://github.com/solomon2773/nora/releases/tag/v1.5.1) — 2026-05-10

- AKS/EKS/GKE Docker Compose overlays for managed Kubernetes provisioning.
- Hardened WebSocket access control on live exec/log/metrics streams.
- Provisioner-backend docs reorganized into per-backend pages.

## [v1.5.0](https://github.com/solomon2773/nora/releases/tag/v1.5.0) — 2026-05-10

- Integrations module reshaped around a Provider strategy pattern: 69 providers as discrete strategy files with unit tests, replacing the legacy 1,435-line adapter.
- Full set of per-provider operator docs.

## [v1.4.1](https://github.com/solomon2773/nora/releases/tag/v1.4.1) — 2026-05-08

- LinkedIn integration; Twitter/X (and any OAuth2) tokens auto-refresh on demand.
- Integrations subsystem restructured as a feature module behind a thin re-export shim.

## [v1.4.0](https://github.com/solomon2773/nora/releases/tag/v1.4.0) — 2026-05-07

- Public documentation site at [noradocs.solomontsao.com](https://noradocs.solomontsao.com).
- Workspace operator console: API keys, cost, members.
- Webhook alert delivery with retries; scheduled encrypted backups; internationalization; Twitter OAuth.

## [v1.3.1](https://github.com/solomon2773/nora/releases/tag/v1.3.1) — 2026-05-01

- Self-healing Hermes embed proxy for surrogate-corrupted runtime configs (fixes a production 500 on the embed config endpoint).

## [v1.3.0](https://github.com/solomon2773/nora/releases/tag/v1.3.0) — 2026-05-01

- First-class K3s flow in the provisioner backend with expanded installer paths.
- Agent Hub API keys: issue, rotate, and revoke per-tenant keys with scoped middleware.
- Control-plane-minted Hermes embed sessions.

## [v1.2.0](https://github.com/solomon2773/nora/releases/tag/v1.2.0) — 2026-04-27

- Admin one-click release upgrade with a Docker-based job runner, persistent job state, and live logs.
- Token-validated access control for proxied agent assets.
- Worker provisioner image self-containment (no brittle bind mounts on fresh hosts).

## [v1.1.0](https://github.com/solomon2773/nora/releases/tag/v1.1.0) — 2026-04-26

- Agent Hub: Platform Presets, Community listings, My Listings, and centralized sharing flows.
- ClawHub skill browsing and deployment; richer OpenClaw channel/runtime controls; Hermes dashboard integration.
- Imported agent files, migration tooling, secret overrides, and stronger session/security protections.

## [v1.0.0](https://github.com/solomon2773/nora/releases/tag/v1.0.0) — 2026-04-12

- Full operator surface for OpenClaw: deploy agents, validate gateway health, chat with the runtime, inspect logs and terminal output, manage integrations, schedule cron jobs, and open the embedded OpenClaw UI from the dashboard.
