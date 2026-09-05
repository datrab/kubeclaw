#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

ARGOCD_NAMESPACE="argocd"
ARGOCD_RELEASE="argocd"
ARGOCD_VALUES_FILE="${ARGOCD_VALUES_FILE:-$REPO_DIR/my-values/infra/argocd-values.yaml}"
ARGOCD_TAILSCALE_INGRESS="${ARGOCD_TAILSCALE_INGRESS:-$REPO_DIR/my-values/infra/argocd-tailscale-ingress.yaml}"
ARGOCD_HELM_REPO="${ARGOCD_HELM_REPO:-https://argoproj.github.io/argo-helm}"

command -v helm >/dev/null || { echo "helm is required" >&2; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }

helm repo add argo "$ARGOCD_HELM_REPO" >/dev/null 2>&1 || true
helm repo update argo >/dev/null

kubectl create namespace "$ARGOCD_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install "$ARGOCD_RELEASE" argo/argo-cd \
  --namespace "$ARGOCD_NAMESPACE" \
  --values "$ARGOCD_VALUES_FILE" \
  --wait \
  --timeout 10m

kubectl apply -f "$ARGOCD_TAILSCALE_INGRESS"

cat <<EOF

Argo CD installed.
The Tailscale Kubernetes Operator will publish the private ingress in your tailnet.

Check:
  kubectl -n $ARGOCD_NAMESPACE get pods
  kubectl -n $ARGOCD_NAMESPACE get ingress argocd

Initial admin password:
  argocd admin initial-password -n $ARGOCD_NAMESPACE

EOF
