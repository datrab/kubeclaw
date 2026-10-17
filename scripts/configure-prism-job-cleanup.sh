#!/usr/bin/env bash
# Installer-Step: runtime.configure-prism-job-cleanup; category: maintenance.
# Update only CronJob history; never delete backup data or running Jobs.
set -euo pipefail
kube=(kubectl)
[[ -z ${KUBE_CONTEXT:-} ]] || kube+=(--context "$KUBE_CONTEXT")
for name in prism-backup prism-backup-verification prism-restore-proof; do
  found="$("${kube[@]}" -n kubeclaw get cronjob "$name" --ignore-not-found -o name)"
  if [[ -z $found ]]; then
    printf '%s not installed; cleanup is configured in the chart for its rollout.\n' "$name"
    continue
  fi
  "${kube[@]}" -n kubeclaw patch cronjob "$name" --type=merge \
    -p '{"spec":{"successfulJobsHistoryLimit":0,"failedJobsHistoryLimit":3}}'
done
echo 'CronJob controller will remove successful job history; backup files are unchanged.'
