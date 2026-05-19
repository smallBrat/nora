# Nora UI screenshots — K8s deployment flow

Auto-captured by `e2e/scripts/capture-operator-screenshots.mts` (the K8s shots). Run:

```bash
cd e2e && npm run capture:operator-readme
```

with a running Nora stack on `docker-compose.kind.yml` (the UI is identical across all K8s backends — Kind is the easiest source).

## Expected files

- `nora-deploy-backend-picker.png` — Agent create wizard, **Backend** dropdown open.
- `nora-deploy-k8s-selected.png` — Agent create wizard, Kubernetes selected.
- `nora-agent-running-k8s.png` — Agent detail page, status = `running`.
- `nora-agent-logs-k8s.png` — Logs tab showing K8s deployment lines.
