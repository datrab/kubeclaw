#!/usr/bin/env bash
# =============================================================================
# KubeClaw — Git Repository Setup
# =============================================================================
# Run this once to initialize the git repo and push to GitHub.
#
# Prerequisites:
#   - GitHub account with a repo created (empty, no README)
#   - git installed and configured (git config user.name / user.email)
#   - SSH key added to GitHub
#
# Usage: ./setup.sh <github-url>
# Example: ./setup.sh git@github.com:ForgeStack/kubeclaw.git
# =============================================================================
set -euo pipefail

REPO_URL="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1" >&2; }

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: $0 <github-repo-url>"
  echo "Example: $0 git@github.com:ForgeStack/kubeclaw.git"
  exit 1
fi

if [[ "${KUBECLAW_ALLOW_LEGACY_REPO_SETUP:-}" != "1" ]]; then
  err "scripts/setup.sh is a legacy one-time bootstrap that runs broad git add/commit/push."
  err "Use the normal git workflow instead, or rerun with KUBECLAW_ALLOW_LEGACY_REPO_SETUP=1 if this is intentional."
  exit 1
fi

cd "$REPO_DIR"

# ─── Step 1: Initialize git ──────────────────────────────────────────────
echo ""
if [[ -d .git ]]; then
  warn "Git already initialized — skipping init"
else
  git init
  log "Git initialized"
fi

# ─── Step 2: Verify repository hygiene ───────────────────────────────────
if [[ -f .dockerignore ]] && grep -qxF "my-values/" .dockerignore; then
  log ".dockerignore excludes my-values/ from runtime image build contexts"
else
  err ".dockerignore must exclude my-values/ from runtime image build contexts"
  exit 1
fi

if [[ -f .gitignore ]] && grep -qxF "my-values/.workspace-namespace" .gitignore; then
  log ".gitignore excludes only local workspace namespace state under my-values/"
else
  err ".gitignore must keep my-values/.workspace-namespace local"
  exit 1
fi

warn "my-values/ is currently tracked as the audited deployment surface; keep real secrets in Kubernetes Secrets."

# ─── Step 3: Stage repository files ──────────────────────────────────────
echo ""
echo "Files that WILL be committed:"
git add -A
git status --short | awk '{ print; count += 1; if (count >= 30) exit }'
echo ""

# ─── Step 4: Initial commit ──────────────────────────────────────────────
echo ""
git commit -m "Initial commit: KubeClaw multi-agent swarm framework

Helm chart for deploying autonomous AI agent swarms on Kubernetes.
Built on OpenClaw with deterministic pipeline orchestration,
sandboxed execution, and confidence-weighted vector memory."
log "Initial commit created"

# ─── Step 5: Set remote and push ─────────────────────────────────────────
echo ""
if remote_output=$(git remote get-url origin 2>&1); then
  git remote remove origin
  warn "Replaced existing origin remote: $remote_output"
elif [[ "$remote_output" == *"No such remote"* || "$remote_output" == *"No such remote 'origin'"* ]]; then
  log "No existing origin remote to remove"
else
  err "Failed to inspect existing origin remote"
  echo "$remote_output" >&2
  exit 1
fi
git remote add origin "$REPO_URL"
log "Remote set: $REPO_URL"

git branch -M main
git push -u origin main
log "Pushed to $REPO_URL"

# ─── Done ────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
log "Repository ready!"
echo ""
echo "  Public repo:  $REPO_URL"
echo "  Local path:   $REPO_DIR"
echo "  Deploy values: $REPO_DIR/my-values/ (tracked for now, excluded from Docker context)"
echo ""
echo "  Next: ./scripts/deploy.sh all"
echo "============================================="
