#!/usr/bin/env bash
# Installer-Step: runtime.prepare-archviewer-auth; category: prepare-secret.
# Run on the Controlnode. Create only; never replace existing credentials.
set -euo pipefail
umask 077
command -v kubectl >/dev/null
command -v htpasswd >/dev/null || { echo "Install apache2-utils on the Controlnode (htpasswd required)." >&2; exit 1; }
command -v python3 >/dev/null
kube=(kubectl)
[[ -z ${KUBE_CONTEXT:-} ]] || kube+=(--context "$KUBE_CONTEXT")
namespace=kubeclaw
name=nova-archviewer-auth
existing="$("${kube[@]}" -n "$namespace" get secret "$name" --ignore-not-found -o name)"
if [[ -n $existing ]]; then
  "${kube[@]}" -n "$namespace" get secret "$name" -o json |
    python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("data",{}).get("htpasswd") else "Existing Secret lacks htpasswd; explicit repair required")'
  echo 'Existing Archviewer credentials retained.'
  exit 0
fi
[[ -t 0 ]] || { echo 'Run interactively on the Controlnode to choose credentials.' >&2; exit 1; }
read -r -p 'Archviewer username: ' username
[[ $username =~ ^[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid username' >&2; exit 1; }
temporary="$(mktemp -d)"
trap 'rm -f -- "$temporary/htpasswd"; rmdir -- "$temporary"' EXIT
# htpasswd prompts twice without echoing the password; bcrypt hash stays in a
# private temporary file. No password appears in arguments, Git or terminal output.
htpasswd -B -C 10 -c "$temporary/htpasswd" "$username"
"${kube[@]}" -n "$namespace" create secret generic "$name" --from-file="htpasswd=$temporary/htpasswd"
