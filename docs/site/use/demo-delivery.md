# Deliver a Demo

Status: reproducible local contract rehearsal; no complete live demo-delivery journey is supplied
Audience: product operator, acceptance participant, incident responder
Owner: product operations
Evidence: skills/nova/plugins/demo-handoff/tests; skills/nova/project/demo.ts
Applies to: source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
Last verified: 2026-09-21; compiler contract passed locally, full package test stopped because OpenSSL was absent; no live demo or human decision is claimed

## Purpose

Prove the checked-in demo handoff contract locally, without mistaking contract
vectors for a deployed result. Then identify the exact additional authorities a
live delivery requires. This page is the only canonical demo-delivery procedure.

Technical `succeeded`, `demo-handoff`, and `ready-for-acceptance` mean that a
result may be presented. They do not mean that a human accepted it.

## Canonical Demo Delivery Procedure
<!-- operator-task: demo-delivery -->

### Supported start state, version, location, and authority

The executable start point is a clean checkout at the revision above with
Node.js 24, its paired npm, Go, and OpenSSL available on the administration
machine. Run the local rehearsal from `<repository-root>`. It does not require
an operator-created platform file, project file, cluster, provider credential,
or public endpoint.

The checked-in test fixes these values:

| Subject | Rehearsal value | Meaning |
| --- | --- | --- |
| Project and graph | project `demo`; pipeline `demo-contract`; `demo-candidate`, `demo-delivery`, `demo-ready` | Local contract only |
| Demo policy | auth node `auth`; protocol `json-session.v1`; target `operators`; retention `1209600` seconds | Concrete test value |
| Platform | `pipeline-platform.v2`; local temporary storage and built-in plugin roots | Created by the test, then removed |
| Providers | artifact store, remote evidence, demo handoff, operator messaging, HTTP, and secret resolver | Local adapters and fixtures |
| Delivery | loopback HTTP receiver at a dynamically assigned port | Discord-format contract, not Discord service |
| Exposure | checked-in source envelope/contract vector | Not a deployed Tailscale endpoint |
| Acceptance | none | Human acceptance is outside the rehearsal |

The checked-in handoff test creates these concrete graph, policy, provider,
grant, local receiver, and adapter values
([local controller and receiver](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/handoff.test.mts#L21-L50);
[graph and platform](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/handoff.test.mts#L58-L80)).

The project compiler requires a blocking `kubeclaw.demo-auth-smoke`,
`kubeclaw.container-build`, `kubeclaw.kubernetes-fixture`, and
`kubeclaw.tailscale-exposure` chain with `retentionMode: await-readiness`
([compiler contract](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/demo.ts#L17-L39);
[provider binding](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/demo.ts#L42-L54)).

### Preconditions

Create a new evidence directory outside project storage. Complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in the disposable checkout, using a separate new access-restricted directory
for its sanitized output. Then verify the revision, clean checkout, and required tools:

```bash
set -euo pipefail
umask 077
test "$(git rev-parse HEAD)" = "1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de"
test -z "$(git status --porcelain)"
command -v node
command -v npm
command -v go
command -v openssl
node --version
npm --version
go version
openssl version
test ! -e "<evidence-dir>"
mkdir "<evidence-dir>"
git rev-parse HEAD > "<evidence-dir>/source-commit.txt"
```

Expected observation: every tool lookup exits zero, the command records the
exact source revision and the worktree is clean. The linked dependency procedure
proves the lockfile installation separately. The repository declares no accepted Go or OpenSSL version range;
record the observed versions. Stop on a revision mismatch, dirty checkout,
missing tool, dependency-install failure, or existing evidence directory.
Correct that prerequisite in a fresh checkout; do not change the test or
substitute a locally authored platform/project fixture.

### 1. Compile and reject invalid demo graphs

```bash
node --test skills/nova/plugins/demo-handoff/tests/compiler.test.mjs \
  2>&1 | tee "<evidence-dir>/compiler-test.tap"
```

Expected observation: TAP reports one passing test named `original project
compiler binds normalized demo policy to source approval and final handoff`, no
failures, and exit status zero. This proves that the compiler adds the three
handoff stages and rejects invalid retention, advisory authentication, missing
manifest links, wrong exposure retention, and skipped builds
([checked-in cases](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/compiler.test.mjs#L22-L42)).

### 2. Exercise delivery, rejection, and reconciliation contracts

```bash
npm test --prefix skills/nova/plugins/demo-handoff \
  2>&1 | tee "<evidence-dir>/demo-handoff-test.tap"
```

Expected observation: TAP reports three tests, three passes, zero failures, and
exit status zero. The test suite covers:

- the compiler rejection cases from step 1;
- bounded TLS request input, credential-file, timeout, and response handling;
- one local delivery receipt and a `demo-ready` terminal stage;
- refusal to recover a terminal run or redeliver its credentials;
- reconciliation of a lost response without a second delivery;
- rejection of a foreign candidate, changed delivery, changed source artifact,
  or receipt lookup with another run, stage, or payload.

The TLS client test exercises its local receiver, deadline, body bounds, regular
credential-file admission, and oversized-response rejection
([TLS client cases](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/controller-client.test.mts#L11-L34)).

The checked-in handoff test implements the terminal and reconciliation checks
([delivery and terminal recovery](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/handoff.test.mts#L80-L95);
[receipt and source rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/handoff.test.mts#L96-L108)).
These are protocol rejection and effect-reconciliation checks. They are not a
human rejection, a pipeline wait/resume exercise, or deployed access proof.

The 2026-09-21 verification environment lacked `openssl`; the unchanged full
command therefore reported one pass and two `spawnSync openssl ENOENT`
failures. That result is retained as a prerequisite failure, not reported as a
successful rehearsal. With OpenSSL available, any nonzero exit, skipped test,
or count other than three passes is a stop.

### 3. Record a separate human decision

The local rehearsal has no human acceptance surface and must stop here. For a
live result, a distinct authorized participant must inspect the exact immutable
result through the intended identity and record accepted or rejected, time,
identity, source commit, run ID, result digest, endpoint identity, reason, and
cleanup decision in the product-owned decision system. There is no generic CLI
command that records this decision. Never edit a Nova journal to create one.

A rejection preserves the delivered bytes and identity. A terminal run cannot
be resumed as a replacement result. If a deployed run has an active wait whose
schema accepts the human decision, use only the
[canonical run-control procedure](operate.md#canonical-run-control-procedure).
Otherwise create a changed project revision and a new run. The pipeline CLI has
no supported operator cancellation command.

### 4. Cleanup

The tests create their own operating-system temporary directories and remove
them in `finally` blocks; they do not create a cluster, Tailnet, DNS, registry,
or cloud resource. Preserve both TAP files and the source/tool record. If a test
process is killed, do not glob-delete temporary storage: first prove the process
has ended and identify the exact test-owned directory before asking the host
owner to remove it. The test finalizer shuts down the runtime, controller, and
receiver before removing its exact temporary root
([finalizer](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/tests/handoff.test.mts#L106-L108)).

For live delivery, use only the cleanup operation and receipt supplied by the
selected exposure provider. The repository has no generic command that safely
removes every exposure. Until a provider-owned cleanup completes, treat the
endpoint as possibly live and escalate to that provider's owner. Preserve the
result, delivery receipt, human decision, and cleanup evidence.

### Failure distinction and recovery

| Observation | Cause class | Stop and recovery |
| --- | --- | --- |
| Revision or clean-check fails | Wrong source | Use a clean checkout at the recorded revision |
| Tool lookup fails | Host prerequisite | Install through the host authority; rerun all preconditions |
| Compiler test fails | Project/compiler contract | Preserve TAP; do not run delivery tests |
| TLS client test fails | OpenSSL, credential file, TLS, timeout, or bounds | Correct the named local prerequisite; never relax the bound |
| Handoff test reports changed/foreign evidence | Identity or integrity | Reject it; do not redeliver or rewrite evidence |
| Receipt outcome is unknown | Uncertain external effect | Reconcile the original request and identity; do not repeat it |
| Technical result exists but no human decision | Product acceptance | Keep status unaccepted and obtain a separate decision |
| Cleanup is unknown | Exposure lifecycle | Treat exposure as live and contact its owner |

Recovery repeats the unchanged failing command after its named prerequisite is
corrected and keeps both outputs. A passing local rehearsal closes only the
contract-rehearsal task.

### Final proof and evidence

Retained evidence for local completion requires the exact revision,
clean-worktree observation, tool versions, dependency-install result, one-pass
compiler TAP, three-pass package TAP, and automatic test cleanup. Redact tokens,
cookies, database URLs, and private keys.

## Live Demo Delivery Product Gap

A reproducible live journey is **not currently available**. The repository does
not provide one checked-in, validated operator-ready `pipeline-platform.v2` and
`nova-project.v2` pair with selected runtime images, real provider endpoints,
owned secrets, a deployed exposure, a separate human decision system, and a
provider-specific cleanup command. The handoff adapter itself additionally
requires exact stage IDs, controller endpoint, token and CA paths, state root,
operator target, and timeout
([stage, endpoint, and file fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/schemas/adapter.schema.json#L5-L38);
[state, target, timeout, and required fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/schemas/adapter.schema.json#L40-L65)).

The closure owners and required proof are:

| Owner | Missing input or proof |
| --- | --- |
| Release owner | Selected immutable runtime images and source-bound receipts |
| Project owner | Checked-in project file whose base revision, provider plan, demo policy, and digests validate unchanged |
| Platform operator | Checked-in platform file with resolvable registrations, least-privilege grants, durable stores, and externally owned secrets |
| Exposure owner | Real deployment, intended-access success, unapproved-access denial, expiry, cleanup command, and receipt |
| Demo-ready controller owner | Reachable TLS endpoint, recoverable token/CA authorities, durable state, and lost-response reconciliation proof |
| Acceptance owner | Separate authorized human identity and durable accept/reject record |

Do not translate the local loopback receiver, generated TLS material, temporary
stores, contract exposure envelope, or synthetic credentials into production
values. A live procedure becomes supportable only after those owners publish
and validate the exact files and commands, a fresh operator completes the
journey, rejection and interruption are exercised, and cleanup is observed.

## Source Authority

The implementation authority is the project compiler, CLI, plugin manifest,
and package test. The plugin registers candidate, delivery, and ready stages
plus the handoff adapter
([stages](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/plugin.json#L5-L44);
[adapter](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/plugins/demo-handoff/plugin.json#L47-L63)).
The project CLI validates the runtime before it writes a graph or starts work,
checks the project revision and cleanliness, and reports readiness separately
from human acceptance
([CLI behavior](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/cli.ts#L25-L56)).
