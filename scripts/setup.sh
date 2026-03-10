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

cd "$REPO_DIR"

# ─── Step 1: Initialize git ──────────────────────────────────────────────
echo ""
if [[ -d .git ]]; then
  warn "Git already initialized — skipping init"
else
  git init
  log "Git initialized"
fi

# ─── Step 2: Verify .gitignore ───────────────────────────────────────────
if grep -q "my-values/" .gitignore 2>/dev/null; then
  log ".gitignore has my-values/ (your personal configs stay private)"
else
  err ".gitignore is missing 'my-values/' — adding it"
  echo "my-values/" >> .gitignore
fi

# ─── Step 3: Stage public files ──────────────────────────────────────────
echo ""
echo "Files that WILL be committed (public):"
git add -A
git status --short | grep -v "my-values/" | head -30
echo ""

# Verify my-values is NOT staged
if git status --short | grep -q "my-values/"; then
  err "my-values/ is staged! Check your .gitignore"
  exit 1
else
  log "my-values/ correctly excluded from git"
fi

# ─── Step 4: Initial commit ──────────────────────────────────────────────
echo ""
git commit -m "Initial commit: KubeClaw multi-agent swarm framework

Helm chart for deploying autonomous AI agent swarms on Kubernetes.
Built on OpenClaw with deterministic pipeline orchestration,
sandboxed execution, and confidence-weighted vector memory."
log "Initial commit created"

# ─── Step 5: Set remote and push ─────────────────────────────────────────
echo ""
git remote remove origin 2>/dev/null || true
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
echo "  Private data: $REPO_DIR/my-values/ (git-ignored)"
echo ""
echo "  Next: ./scripts/deploy.sh all"
echo "============================================="
