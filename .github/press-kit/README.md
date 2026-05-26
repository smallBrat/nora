# Nora — Press Kit

Everything a writer, hunter, or partner needs to cover Nora. All assets here are
licensed for editorial use. Questions: open an issue on
[github.com/solomon2773/nora](https://github.com/solomon2773/nora).

## What Nora is (one line)

> Nora is the self-hosted control plane for AI agents — deploy, observe, and operate
> OpenClaw and Hermes agent runtimes across Docker, Kubernetes, and Proxmox. Open source,
> Apache-2.0, no vendor lock-in.

## One paragraph

> Nora is an operator-facing platform for running AI agents on your own infrastructure.
> From a single control plane you deploy agent runtimes (OpenClaw or Hermes), manage LLM
> provider keys, wire up 69 integrations, and watch everything live — chat, logs, metrics,
> and a real terminal into each agent. It runs entirely self-hosted via a one-line installer
> on Docker, scales to Kubernetes (k3s/AKS/GKE/EKS) and Proxmox, and is fully open source
> under Apache-2.0 — including commercial self-hosting and a built-in PaaS mode for operators
> who want to host Nora for their own customers.

## Full description

> Most AI-agent tooling is a hosted SaaS you have to trust with your keys, your data, and your
> deployment topology. Nora takes the opposite stance: it is a self-hosted ops platform that
> puts the entire agent lifecycle on infrastructure you control. Operators get one surface to
> deploy and manage runtimes across multiple backends (Docker, Kubernetes, Proxmox), rotate
> provider keys stored AES-256-GCM encrypted, connect 69 first-class integrations (GitHub,
> Slack, AWS, Azure, GCP, Anthropic, OpenAI, and more), and observe each agent through chat,
> streaming logs, live metrics, and a browser terminal. Two runtime families are supported —
> OpenClaw (the broadest operator path) and Hermes (a Docker-managed runtime with its own
> WebUI) — plus an experimental NVIDIA NemoClaw secure-sandbox profile for GPU-backed
> execution. Nora is open source under Apache-2.0, which means teams can read the code before
> they adopt it, run it commercially on their own hardware, or operate it in PaaS mode as the
> basis for their own product.

## Facts

- **License:** Apache-2.0 (commercial self-hosting allowed)
- **Current release:** v1.6.1
- **Install:** one-line installer (`curl … | bash` / `iwr … | iex`) or Docker Compose
- **Stack:** Node 24 LTS; Express control plane; Next.js operator/admin/marketing UIs;
  PostgreSQL 15; Redis 7 + BullMQ; worker-provisioner with pluggable backend adapters
- **Integrations:** 69 providers (developer tools, cloud, comms, analytics, data, LLMs)
- **Security:** AES-256-GCM key encryption, bcrypt password hashing, constant-time auth,
  webhook SSRF guards, JWT sessions
- **Repo:** https://github.com/solomon2773/nora
- **Docs:** https://noradocs.solomontsao.com
- **Site:** https://nora.solomontsao.com

## Runtime maturity matrix

Source of truth: `agent-runtime/lib/backendCatalog.ts`. Lead coverage with the GA path.

| Runtime family         | Docker | Kubernetes | Proxmox |
| ---------------------- | ------ | ---------- | ------- |
| **OpenClaw** (default) | GA     | GA         | Beta    |
| **Hermes**             | GA     | GA         | Beta    |

- **GA** — release-ready default path for normal onboarding.
- **Beta** — usable with smoke coverage, still maturing operationally.
- **Experimental** — the **NemoClaw** secure-sandbox profile (NVIDIA GPU); promising, under
  active contract validation. Applies on top of any runtime/target when the `nemoclaw`
  sandbox profile is selected.

## Brand assets

In [`logos/`](./logos):

| File            | Use                                         |
| --------------- | ------------------------------------------- |
| `logo-mark.png` | Square emblem (app icon, avatars, favicons) |
| `logo-full.png` | Full vertical lockup (emblem + wordmark)    |
| `og-image.png`  | 1200×630 social / hero card                 |

Product screenshots (12, operator + admin surfaces) live in
[`../readme-assets/`](../readme-assets) — e.g. `proof-operator-dashboard.png`,
`proof-operator-deploy-flow.png`, `proof-operator-fleet.png`, `proof-admin-agent-hub.png`.

Demo video: _link to be added once recorded._

## Color palette

| Role                  | Hex       |
| --------------------- | --------- |
| Background (ink/navy) | `#071018` |
| Foreground (light)    | `#eef4fb` |
| Cyan (primary accent) | `#8ae6ff` |
| Warm gold             | `#f2d7a1` |
| Accent orange         | `#ea8d3d` |

Logo mark reads on dark and light backgrounds; on light surfaces use the darkened variant
(`docs/logo/light.png`). Keep clear space around the mark equal to the height of the "N".
