# Quellenabdeckung und Dokumentationszuordnung

Diese Matrix ordnet konkrete Infrastrukturdateien den Review-Eigentümern zu. Ein Eintrag ist kein Live- oder zeilenweiser Geschäftslogiktest. Pipeline-Implementierungen werden ausschließlich für ihre Infrastrukturverträge verfolgt; deren fachliche Reviews bleiben separat. Zusätzliche Aufruferbelege stehen in jedem Einzelreview. Baseline siehe [Leitfaden](README.md).

| Quelle im main-Checkout | Eigentümer |
|---|---|
| `.dockerignore` | [INF-21](runtime-images.md), [INF-29](public-config.md) |
| `.github/workflows/build-images.yaml` | [INF-22](ci-build.md) |
| `.github/workflows/build-ops-mcp.yaml` | [INF-22](ci-build.md) |
| `.github/workflows/dependency-updates.yaml` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `.github/workflows/docs-checks.yaml` | [INF-22](ci-build.md) |
| `.github/workflows/pipeline-reliability.yaml` | [INF-22](ci-build.md) |
| `.github/workflows/promote-runtime.yaml` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `.github/workflows/publish-image-receipts.yaml` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `.github/workflows/release-security.yaml` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `.github/workflows/role-images.yaml` | [INF-22](ci-build.md) |
| `.github/workflows/update-checks.yaml` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `.gitignore` | [INF-21](runtime-images.md), [INF-29](public-config.md) |
| `charts/kubeclaw/Chart.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/.semgrep.yml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/.tflint.hcl` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/.yamllint.yml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/eslint.config.mjs` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/jscpd-tests.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/jscpd.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/knip.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/kubernetes-policy-pack-default.json` | [INF-18](namespace-broker.md) |
| `charts/kubeclaw/files/config/lint-baseline.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/lint-policy.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/files/config/swarm.config.json` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/NOTES.txt` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/_helpers.tpl` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/buster-namespace-controller.yaml` | [INF-18](namespace-broker.md) |
| `charts/kubeclaw/templates/buster-namespace-lease-crd.yaml` | [INF-18](namespace-broker.md) |
| `charts/kubeclaw/templates/buster-runtime-pvc.yaml` | [INF-16](storage.md), [INF-10](buildkit.md) |
| `charts/kubeclaw/templates/configmap-gateway.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/configmap-skills.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/configmap-swarm-config.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/configmap-worker-trust.yaml` | [INF-07](envoy.md), [INF-06](spire.md) |
| `charts/kubeclaw/templates/configmap-workspace.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/deployment.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/kubeclaw/templates/pvc.yaml` | [INF-16](storage.md), [INF-10](buildkit.md) |
| `charts/kubeclaw/templates/rbac.yaml` | [INF-17](secrets.md), [INF-18](namespace-broker.md) |
| `charts/kubeclaw/templates/secret.yaml` | [INF-17](secrets.md), [INF-18](namespace-broker.md) |
| `charts/kubeclaw/templates/service-extra-nodeports.yaml` | [INF-03](network-dns.md), [INF-19](role-workloads.md) |
| `charts/kubeclaw/templates/service.yaml` | [INF-03](network-dns.md), [INF-19](role-workloads.md) |
| `charts/kubeclaw/templates/serviceaccount.yaml` | [INF-17](secrets.md), [INF-18](namespace-broker.md) |
| `charts/kubeclaw/values.yaml` | [INF-19](role-workloads.md), [INF-21](runtime-images.md) |
| `charts/ops-pod/Chart.yaml` | [INF-28](ops-pod.md) |
| `charts/ops-pod/templates/network.yaml` | [INF-28](ops-pod.md) |
| `charts/ops-pod/templates/rbac.yaml` | [INF-28](ops-pod.md) |
| `charts/ops-pod/templates/tailscale-storage.yaml` | [INF-28](ops-pod.md) |
| `charts/ops-pod/templates/workload.yaml` | [INF-28](ops-pod.md) |
| `charts/ops-pod/values.yaml` | [INF-28](ops-pod.md) |
| `charts/prism/Chart.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/ci-values.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/templates/_helpers.tpl` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/templates/configmap-worker-trust.yaml` | [INF-07](envoy.md), [INF-06](spire.md) |
| `charts/prism/templates/ingestion.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/templates/jobs.yaml` | [INF-26](backup-recovery.md) |
| `charts/prism/templates/networkpolicy.yaml` | [INF-03](network-dns.md) |
| `charts/prism/templates/postgresql.yaml` | [INF-15](prism-postgresql.md) |
| `charts/prism/templates/serviceaccounts.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/templates/services.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/templates/workloads.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/values.schema.json` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `charts/prism/values.yaml` | [INF-20](prism-workloads.md), [INF-16](storage.md) |
| `docker/Dockerfile.archviewer` | [INF-03](network-dns.md), [INF-21](runtime-images.md) |
| `docker/Dockerfile.buster-gateway` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.buster-runtime` | [INF-10](buildkit.md), [INF-21](runtime-images.md), [INF-24](updates-security.md) |
| `docker/Dockerfile.namespace-controller` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.nova` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.prism-agent` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.prism-control` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.prism-ingestion` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.prism-studio` | [INF-21](runtime-images.md) |
| `docker/Dockerfile.prism-worker` | [INF-21](runtime-images.md) |
| `docker/archviewer.nginx.conf` | [INF-03](network-dns.md), [INF-21](runtime-images.md) |
| `docker/buster-runtime-entrypoint.sh` | [INF-10](buildkit.md), [INF-21](runtime-images.md), [INF-24](updates-security.md) |
| `docker/nova-tools/package-lock.json` | [INF-21](runtime-images.md) |
| `docker/nova-tools/package.json` | [INF-21](runtime-images.md) |
| `docker/openclaw-tools/package-lock.json` | [INF-21](runtime-images.md) |
| `docker/openclaw-tools/package.json` | [INF-21](runtime-images.md) |
| `my-values/buster-values.yaml` | [INF-19](role-workloads.md), [INF-29](public-config.md) |
| `my-values/infra/argocd-tailscale-ingress.yaml` | [INF-05](argocd.md), [INF-04](tailscale.md) |
| `my-values/infra/argocd-values.yaml` | [INF-05](argocd.md), [INF-04](tailscale.md) |
| `my-values/infra/buster-namespace-fence.yaml` | [INF-18](namespace-broker.md) |
| `my-values/infra/k3s-registries.yaml` | [INF-01](cluster-bootstrap.md), [INF-08](registry-local.md) |
| `my-values/infra/litellm-config.yaml` | [INF-14](litellm.md) |
| `my-values/infra/litellm-deployment.yaml` | [INF-14](litellm.md) |
| `my-values/infra/litellm-values.yaml` | [INF-14](litellm.md) |
| `my-values/infra/network-policies.yaml` | [INF-03](network-dns.md) |
| `my-values/infra/ops-mcp-tunnel.yaml` | [INF-27](ops-mcp.md), [INF-04](tailscale.md) |
| `my-values/infra/ops-mcp.yaml` | [INF-27](ops-mcp.md), [INF-04](tailscale.md) |
| `my-values/infra/postgresql-values.yaml` | [INF-12](litellm-postgresql.md) |
| `my-values/infra/qdrant-values.yaml` | [INF-13](qdrant.md) |
| `my-values/infra/redis-values.yaml` | [INF-11](redis.md) |
| `my-values/infra/registry-local.yaml` | [INF-08](registry-local.md) |
| `my-values/infra/registry-mirror.yaml` | [INF-09](registry-mirror.md) |
| `my-values/infra/spire-values.yaml` | [INF-06](spire.md) |
| `my-values/infra/tailscale-operator-values.yaml` | [INF-04](tailscale.md) |
| `my-values/nova-values.yaml` | [INF-19](role-workloads.md), [INF-29](public-config.md) |
| `my-values/prism-agent-values.yaml` | [INF-19](role-workloads.md), [INF-29](public-config.md) |
| `my-values/prism-values.yaml` | [INF-20](prism-workloads.md) |
| `ops/pod/.dockerignore` | [INF-28](ops-pod.md) |
| `ops/pod/Dockerfile` | [INF-28](ops-pod.md), [INF-21](runtime-images.md) |
| `ops/pod/bootstrap.py` | [INF-28](ops-pod.md) |
| `ops/pod/config.toml` | [INF-28](ops-pod.md) |
| `ops/pod/package-lock.json` | [INF-28](ops-pod.md) |
| `ops/pod/package.json` | [INF-28](ops-pod.md) |
| `ops/pod/shell.sh` | [INF-28](ops-pod.md) |
| `ops/pod/supervisor.py` | [INF-28](ops-pod.md) |
| `ops/pod/test-image.sh` | [INF-28](ops-pod.md) |
| `ops/pod/test/deployment.test.mjs` | [INF-28](ops-pod.md) |
| `ops/pod/verify.py` | [INF-28](ops-pod.md) |
| `renovate.json` | [INF-24](updates-security.md), [INF-29](public-config.md) |
| `scripts/bootstrap-prism-tests.sh` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/build-runtime-role-bundle.mjs` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/check-role-image.sh` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/check-runtime-package-ownership.mjs` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/check-runtime-role-manifests.mjs` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/check-workflow-yaml.mjs` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/deploy-argocd.sh` | [INF-05](argocd.md) |
| `scripts/deploy-ops-mcp.sh` | [INF-27](ops-mcp.md) |
| `scripts/deploy-ops-pod.sh` | [INF-28](ops-pod.md) |
| `scripts/deploy.sh` | [INF-01](cluster-bootstrap.md), [INF-19](role-workloads.md), [INF-29](public-config.md) |
| `scripts/package-agent-skill-bundle.sh` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/prepare-image-build-runner.sh` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/scan-runtime-images.sh` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `scripts/setup.sh` | [INF-01](cluster-bootstrap.md), [INF-19](role-workloads.md), [INF-29](public-config.md) |
| `scripts/updates/check-renovate.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/check-upstream-refresh.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/materialize-release.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/refresh-versions.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/release-images.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/renovate.cjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/scan-releases.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/updates/verify-release-source.mjs` | [INF-23](release-promotion.md), [INF-24](updates-security.md) |
| `scripts/versions.mjs` | [INF-21](runtime-images.md), [INF-22](ci-build.md), [INF-24](updates-security.md) |
| `tools/ops-mcp/Dockerfile` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/package.json` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/src/diagnostics.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/src/kubernetes.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/src/server.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test-image.sh` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test/bootstrap.test.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test/diagnostics.test.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test/http.test.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test/kubernetes.test.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `tools/ops-mcp/test/local.test.mjs` | [INF-27](ops-mcp.md), [INF-28](ops-pod.md) |
| `versions.json` | [INF-24](updates-security.md), [INF-29](public-config.md) |

## Zusätzlich untersuchte Quellgruppen

| Quelle / Grenze | Zuständigkeit |
|---|---|
| `cmd/buster-namespace-controller/main.go` | INF-18: Namespace-/RBAC-/Secret-/Policy-Provisionierung; fachlicher Lease-Vertrag separat |
| `skills/common/plugins/redis-transport/src/adapter.ts`, Observer, Gateway-Config | INF-11: Auth/Stream/Dedup-/ACK-Vertrag |
| Buster `remote-plan-http.ts`, Runtime-Entry, Kubernetes-/BuildKit-Testprovider | INF-07/08/10/18: Peer-/Socket-/Registry-/API-Vertrag |
| `skills/buster/engine/test-gates/security-scan-runtime.ts` | INF-24: offline Datenbank-/Frischevertrag |
| `skills/prism/server/control.ts`, Worker-/Bridge-Server, Postgres-Adapter | INF-15/20/26: DB/Mount/Identity/Readiness/Restore-Vertrag |
| `tests/verification/deployment/`, `tests/verification/live/`, Image-Prüfskripte | INF-19/21/22/23/25: Testvoraussetzungen und Aussagegrenzen; Ausführung siehe Protokoll |
| Cilium-Zusatzbranch: Values/Cluster-/SPIRE-/Ops-Policies, Install-/Migration-/Verifierskripte, Projektpolicy-Beispiel und zwei Runbooks | INF-02/03/06/27: separat vom main bewertet; Commit1313cc3a |
| Argo-/externer-Ops-Zusatzbranch | Differenzprüfung zum main; keine konkurrierende zweite Produktimplementierung übernommen |

## Architektur-/Betriebsdokumentation als nächste Abdeckungsmatrix

| Dokumentgruppe | Eigentümer / konkrete Korrektur |
|---|---|
| `docs/deployment/infrastructure.md`, Deployment-/Setup-Einstiege | INF-01/08–14/19/24: Ausgangscluster, echte Installer/Versionen, Registryclients, Secrets und Digest-Releasewerte |
| `docs/security/worker-trust.md`, `docs/operations/worker-trust-runbook.md` | INF-06/07: effektive Chartdefaults, Ablauf/Rotation, Config-Rollout und ausstehende echte TLS-Nachweise |
| `docs/ops/chatgpt-ops-bootstrap.md`, Argo-/Tailscale-Abschnitte | INF-04/05/27: Operator vor UI, Applications/Ownership fehlen, lesender MCP ist kein Recovery-Schreibzugang |
| `docs/architecture/ops-pod.md`, `docs/ops/ops-pod.md` | INF-28: unabhängiger Hostpfad, Credentials/Rotation, PVC-Restore und tatsächliches Pairing |
| Prism Deployment-/Recovery-/Observability-Dokumente, insbesondere `prism-recovery-observability-v1.md` | INF-15/20/25/26: DB-Hooks, Artefaktbackup, gleiches Ausfalldomänenproblem, flache Probes und Alarmierung |
| Cilium-Branch `docs/ops/cilium-networking.md`, `cilium-quickstart.md` | INF-02: konkreter Bestand/main-Abgleich, Paperless-Daten- und Funktionsnachweis, phasenabhängiger Rollback |
| Generierte Konfigurations-/Versionsreferenz, `my-values` und Beispiele | INF-19/24/29: keine Betreiberwerte als allgemeines Beispiel, falscher Git-Schalter, Altrollen-/Legacyverweise |

## Doppelte oder möglicherweise obsolete Quellen
`litellm-values.yaml` ist vom aktiven Plain-Manifest-Installer getrennt; `k3s-registries.yaml` bezeichnet sich als Legacy/Platzhalter; `scripts/setup.sh` benötigt Legacy-Opt-in und hat broad git-add/push. Chartkopien von Konfiguration sind Packaging-/Generatorausgaben und nicht allein wegen Duplizierung obsolet. Archviewer ist über NodePort tatsächlich referenziert. Die Branches sind alternative Entwicklungsstände, keine gemeinsam installierten Komponenten. Fehlende lokale Aufrufer beweisen keine externe Nichtnutzung; vor späterer Entfernung Betreiber- und Git-Historienabgleich.

Nicht vorhanden als lokale vollständige Implementierung: K3s-/Hostprovisionierung, allgemeiner StorageClass-/Snapshot-Controller, Argo-Applications/AppProjects, komplette Offsite-DR-Gruppe und zentrale Alarmierung. Diese sind inventarisierte Lücken, keine übersehenen zu reviewenden Manifeste. Sonstige Dokumentationsgeneratoren, Plugin-/SDK-Code und fachliche Testledger bleiben im separaten Pipeline-/Dokumentationsauftrag; ihr CI-Ausführungskontext ist INF-22 zugeordnet.
