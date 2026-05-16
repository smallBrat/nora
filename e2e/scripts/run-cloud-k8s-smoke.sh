#!/usr/bin/env bash
# Run the Kubernetes adapter lifecycle smoke against an operator-supplied cluster.
#
# Works for K3s, AKS, GKE, and EKS — they all share the same k8s adapter, so this
# script just expects a working KUBECONFIG and a Compose overlay file.
#
# Required:
#   KUBECONFIG_PATH       Host path to a kubeconfig the Compose stack can mount.
#   COMPOSE_OVERLAY       Path to the provider Compose overlay
#                         (docker-compose.k3s.yml, .aks.yml, .gke.yml, .eks.yml).
#
# Optional:
#   API_BASE_URL          Defaults to http://127.0.0.1:8080/api
#   K8S_NAMESPACE         Defaults to openclaw-agents.
#   CONTAINER_KUBECONFIG_PATH
#                         Defaults to KUBECONFIG_PATH (use this when the API server
#                         URL in the kubeconfig differs between host and containers).
#   KEEP_ENV=true         Leave the Compose stack running after the smoke completes.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${KUBECONFIG_PATH:?KUBECONFIG_PATH is required}"
: "${COMPOSE_OVERLAY:?COMPOSE_OVERLAY is required (e.g. docker-compose.k3s.yml)}"

if [[ ! -f "$KUBECONFIG_PATH" ]]; then
  echo "KUBECONFIG_PATH does not exist: $KUBECONFIG_PATH" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_OVERLAY" ]]; then
  echo "COMPOSE_OVERLAY does not exist: $COMPOSE_OVERLAY" >&2
  exit 1
fi

CONTAINER_KUBECONFIG_PATH="${CONTAINER_KUBECONFIG_PATH:-$KUBECONFIG_PATH}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8080/api}"
K8S_NAMESPACE="${K8S_NAMESPACE:-openclaw-agents}"

export CONTAINER_KUBECONFIG_PATH
export API_BASE_URL
export K8S_NAMESPACE
export KUBECONFIG="$KUBECONFIG_PATH"

COMPOSE_FILES=(-f docker-compose.yml -f "$COMPOSE_OVERLAY")

cleanup() {
  if [[ "${KEEP_ENV:-false}" == "true" ]]; then
    return
  fi
  docker compose "${COMPOSE_FILES[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

kubectl cluster-info >/dev/null

docker compose "${COMPOSE_FILES[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
docker compose "${COMPOSE_FILES[@]}" up -d --build postgres redis backend-api worker-provisioner

for _ in $(seq 1 120); do
  if curl -fsS "${API_BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -fsS "${API_BASE_URL}/health" >/dev/null
"$ROOT_DIR/e2e/node_modules/.bin/tsx" "$ROOT_DIR/e2e/scripts/k8s-smoke.mts"
