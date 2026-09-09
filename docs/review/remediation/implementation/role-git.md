# Optional role Git setup — IFR-19-002

The chart now applies `agent.git.enabled` to its complete Git/SSH setup dependency: SSH init and repository synchronization, permission handoff, Git/SSH environment variables, init and agent mounts, and both SSH volumes. The enabled default retains its required Secret and repository setup. Disabling chart-managed Git leaves existing workspace data intact and does not disable unrelated application capabilities or remove previously persisted files.

The original finding was reproduced before the edit with actual Helm: `agent.git.enabled=false` still produced `ssh-secret-vol` with `optional: false` and `git-deploy-key-nova`. The focused regression failed on that mandatory Secret. This was not a live kubelet failure claim.

Current verification:

- `node tests/verification/deployment/check-git-disabled.mjs` with the provisioned Helm on PATH passes 16 actual renders: default, Nova, Buster, and Prism values, each with root/non-root and enabled/disabled Git. It parses rendered YAML, checks the full SSH dependency removal, verifies the enabled required Secret and clone path, rejects dangling volume mounts, and runs `bash -n` on every rendered init script.
- `node tests/verification/deployment/check-role-chart.mjs` passes the existing three role renders.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passes the original deployment truth gate.
- `helm lint charts/kubeclaw -f my-values/<role-values> --set agent.git.enabled=false` passes for Nova, Buster, and Prism.
- Scoped `git diff --check` passes.

Changed source: `charts/kubeclaw/templates/deployment.yaml` and the Git-option comment in `charts/kubeclaw/values.yaml`. The focused regression is `tests/verification/deployment/check-git-disabled.mjs`.

These are render and source-contract results. Starting a real Pod without a Git Secret, with all other runtime prerequisites supplied, remains an operational verification step. No deployment, CI run, image push, external resource change, or other infrastructure finding is claimed here.
