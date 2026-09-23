# Operate KubeClaw

Status: source-backed operator procedures; live results exist only where an evidence record is named
Audience: platform operator, product operator, incident responder, release maintainer
Owner: platform operations
Evidence: scripts/deploy.sh; skills/nova/core/cli.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json
Applies to: the source revision, release receipts, cluster context, and private configuration recorded for the operation
Last verified: 2026-09-21; no live environment result is available

## Purpose

This directory owns the supported operator lifecycle. The generated publication
metadata assigns one canonical page and anchor to every task. A page that mentions another task
links to that authority instead of defining a second procedure.

Source checks prove repository behavior. They are not evidence that a command
succeeded in a cluster. A live claim needs retained command output, the target
identity, the source revision, and its execution time.

## Canonical Task Map

| Task | Canonical authority | Supported result |
| --- | --- | --- |
| Install and preflight | [Plan and Install](install.md#canonical-install-and-preflight-procedure) | A non-mutating stop or a source-bound installation record |
| Start, readiness, and observation | [Configure and Operate](operate.md#canonical-start-readiness-and-observation-procedure) | Process, service, dependency, and functional observations |
| Wait, signal, resume, interruption, and cancellation boundary | [Configure and Operate](operate.md#canonical-run-control-procedure) | A durable transition or an exact unsupported control |
| Symptom diagnosis | [Observe and Diagnose](diagnose.md#canonical-symptom-diagnosis-procedure) | A distinguished cause class and safe next action |
| Backup and restore | [Back Up and Recover](recovery.md#canonical-backup-and-restore-procedure) | A verified component restore or an explicit unsupported scope |
| Upgrade and rollback | [Maintain and Retire](maintenance.md#canonical-upgrade-and-rollback-procedure) | A compatible change or a stop before mutation |
| Credential and trust rotation | [Maintain and Retire](maintenance.md#canonical-rotation-procedure) | A completed rotation or a retained old trust set |
| Capacity and retention | [Capacity and Retention](capacity.md#canonical-capacity-and-retention-procedure) | Measured pressure and a supported retention decision |
| Plugin lifecycle | [Operate Plugins](plugins.md#canonical-plugin-lifecycle-procedure) | Validated activation, drain, replacement, or removal |
| Decommission | [Maintain and Retire](maintenance.md#canonical-decommission-procedure) | Removed access and workloads with retained evidence |
| Prism and Studio | [Operate Prism](prism-studio.md#canonical-prism-and-studio-procedure) | A traced design decision or exact blocked step |
| Demo delivery | [Deliver a Demo](demo-delivery.md#canonical-demo-delivery-procedure) | A local contract result or an exact blocked live-delivery prerequisite; human acceptance remains separate |
| Worker trust | [Operate Worker Trust](worker-trust.md#canonical-worker-trust-procedure) | Positive and negative workload-identity observations |

The [Buster suite workflow](workflows/buster-suite.md) is the canonical Buster
suite procedure. It is not the authority for a human demo decision or the full
Prism journey.

## Shared Operating Contract

Every execution record must contain:

- canonical task ID and page anchor;
- supported start state and version, execution location, and implementation,
  configuration, and data authority;
- source commit, selected image receipts, configuration digests, target context,
  namespace, and component versions;
- execution location and operator identity;
- preconditions and the observation that satisfied each one;
- commands and non-secret arguments in order, plus expected and actual
  observations, exit status, and timestamps;
- stop conditions, failure distinction, recovery or rollback, cleanup, and
  final proof;
- secret names and owners, never secret values.

Do not repeat a command when its external effect is uncertain. Inspect the
durable request and receipt, then reconcile the external system. Do not use an
application Pod as the only recovery route.

## Shared Placeholders

| Placeholder | Meaning | Required property |
| --- | --- | --- |
| `<repository-root>` | KubeClaw checkout used for the operation | Its full commit is recorded |
| `<kubeconfig-path>` | Dedicated kubeconfig used for one operation | Absolute regular-file path, supplied by the cluster authority and not shared with a default user config |
| `<context>` | Kubernetes context inside the dedicated kubeconfig | Exact value supplied independently by the cluster authority |
| `<cluster-server>` | Kubernetes API server URL | Exact independently recorded URL, including scheme and port where present |
| `<kube-system-uid>` | UID of the intended cluster's existing `kube-system` namespace | Exact independently recorded UID used with server and context as cluster identity |
| `<namespace>` | Application namespace | It is dedicated to the resources selected for broad teardown |
| `<prism-namespace>` | Prism namespace | Exact namespace selected for the recorded Prism operation |
| `<release-commit>` | Source identity | It is an immutable full Git commit |
| `<full-git-commit>` | Any task-specific Git identity | Full immutable commit, never a branch or moving tag |
| `<run-id>` | Durable Nova run identity | It comes from command output or durable evidence |
| `<existing-nova-run-id>` | Existing run selected for inspection or recovery | Copied from durable Nova output, never guessed |
| `<new-run-id>` | Newly emitted run identity | Captured from the immediately preceding command |
| `<new-registered-fault-run-id>` | New run reserved for one controlled fault | Unique and recorded before fault injection |
| `<different-new-registered-success-run-id>` | Separate healthy comparison run | Different from every fault or prior run identity |
| `<backup-group>` | Completed backup unit | It includes metadata, members, and checksums |
| `<evidence-dir>` | New operator-controlled evidence directory | It is outside disposable workload and project storage |
| `<new-evidence-dir>` | Replacement evidence directory after a stopped attempt | New and empty; never overwrites the first attempt |
| `<unique-id>` | Suffix for a temporary Job or probe | DNS-safe, collision-free for the target, and recorded before creation |
| `<platform.json>`, `<active-platform.json>`, `<candidate-platform.json>` | Exact platform configuration file for the named task phase | Absolute or repository-recorded path with retained digest |
| `<project.json>`, `<controlled-project.json>` | Exact Nova project descriptor | Validated file with repository root and immutable base revision |
| `<pipeline.json>`, `<new-pipeline.json>`, `<compiled-pipeline.json>` | Exact pipeline input or compiler output | New file where required, retained digest, and run binding |
| `<resume-signal.json>` | Signal for one active wait | Validated against that wait; issuer identity is still self-asserted by the current product |
| `<storage-root>` | Durable runtime storage root | Absolute owned path with capacity and backup authority |
| `<absolute-path>`, `<absolute-secure-path>` | Task-specific local file or directory | Absolute path; secure variants are access-restricted and outside evidence output |
| `<absolute-path-outside-project>` | Task output outside project storage | Absolute new path whose owner and cleanup are recorded |
| `<absolute-path-to-disposable-project>` | Project fixture that may be changed or removed | Absolute path proven disposable before mutation |
| `<delegated-cgroup-v2-root>` | Delegated cgroup subtree for a native worker | Absolute owned cgroup-v2 path supplied by the host authority |
| `<repository>` | Git or OCI repository named by the task | Exact owner/name or registry path, not an inferred default |
| `<registry>` | Registry endpoint | Exact scheme/host/port and trust authority |
| `<advertised-immutable-ref>` | Advertised source or image identity | Digest or immutable revision verified against the producer receipt |
| `<application>`, `<pod>`, `<container>` | Exact live resource selected for inspection | Copied from current discovery output in the recorded namespace |

Never run a command with an unreplaced placeholder. Never write credentials to
an evidence directory. `<redacted:authority-identity>` is a publication
redaction marker, not a value to pass to a command. HTML `<br>` in generated
tables is formatting, not a placeholder.

## Version and Tool Boundary

Use Node.js 24 and the npm version paired with it. Complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation);
do not change the lockfile during an operator task. `versions.json` currently records kubectl
`1.35.6` and Helm `3.18.4`, while the selected Ops image records its own tools.
Those are build inputs, not a claimed compatibility range.

The repository does not establish a supported Kubernetes, K3s, CNI, storage,
kubectl/server, or Helm/server matrix. Record the actual versions and stop until
the platform owner accepts the combination. Runtime deployment also requires
`releases/runtime-images.json`; if it is absent, installation and upgrade stop
before mutation. Never replace the missing selection with a mutable tag or a
hand-written digest.

## Current Product Boundaries

- Installation starts with an existing Kubernetes cluster. There is no complete
  host, K3s, CNI, or StorageClass installation procedure.
- The optional Ops Pod is cluster-dependent and is not an independent recovery
  path.
- Resume-signal issuer fields are unsigned and self-asserted by the caller. The
  runtime compares them with the active wait but does not authenticate the
  human or external identity provider.
- The pipeline CLI has no supported operator cancellation command.
- The repository does not provide a complete full-platform restore.
- No runtime upgrade pair is supported unless a component authority explicitly
  names and proves that exact pair.

Read [Current Status](../status/current.md) and
[Open Implementation Work](../status/open-issues.md) before a production
change.
