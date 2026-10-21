# Run and Audit a Local Core Pipeline

Status: maintained local product journey; separate project and deployment limits
Audience: first-time pipeline author and operator
Owner: Nova Core and Delivery Lint maintainers
Evidence: docs/site/use/workflows/examples/local-core.mjs; skills/nova/core/cli.ts; skills/nova/plugins/delivery-lint; skills/nova/plugins/repository-adapter; skills/common/plugins/artifact-store
Applies to: pipeline-platform.v2 and pipeline-definition.v2 on a supported local Linux host
Last verified: 2026-10-21; actual local CLI success, blocked path and missing-grant admission check

## Goal and boundary

Start in a selected checkout, materialize real platform and graph inputs, validate
the installed registry and grants, run a shipped stage through the real Core CLI,
preserve durable state, audit both outcomes, verify an original artifact's bytes
and producing attempt, and clean up only the owned fixture.

The stage is `kubeclaw.lint.delivery`. It reads a real disposable repository
Dockerfile through `kubeclaw.repository-adapter:repository` and writes its report
through `kubeclaw.artifact-store:artifact-store`. Core owns the actual snapshots,
event/effect journals, attempts, terminal states and adapter shutdown. No fake
runner, hand-built lifecycle event, memory journal, model or provider result is
used.

This is **one local explicit-graph workflow**, not the eight-stage
`nova-project.v2` implementation project. It validates and normalizes the graph
through the actual Core preparation path; it does not run the Nova project
compiler. The [first-project exercise](README.md#materialize-and-compile-a-first-project)
owns that separate compile-only task. This journey does not execute Forge,
remote Buster, an image build, a test provider, a cluster, an observer/telemetry
sink, demo delivery or human acceptance. A local artifact report is not an
application delivery result.

## Prepare a checkout and host

Use a new isolated checkout that includes this maintained guide/helper at the
selected revision. Never install dependencies into another active shared
checkout. Clone and prepare through the
[developer handbook](../../extend/developer-handbook.md#prepare-a-clean-checkout),
using its locked Node.js 24 development-dependency installation and owned writable
npm cache. Keep its selected full source revision; do not substitute a random
current branch while comparing results.

From that repository root, check:

```bash
set -euo pipefail
export CORE_SOURCE_REVISION="$(git rev-parse HEAD)"
git cat-file -e "$CORE_SOURCE_REVISION:docs/site/use/workflows/examples/local-core.mjs"
test -z "$(git status --porcelain)"
node --version
git --version
/usr/bin/flock --version
node -e 'for (const name of ["typescript", "ajv", "ajv-formats"]) console.log(require.resolve(name))'
```

Node must be major 24. `/usr/bin/flock` must be GNU util-linux with `--timeout`;
a BusyBox command or a different executable on PATH does not satisfy the
absolute-path lock contract. Use a local filesystem qualified for the required
locks, append writes and fsync. A generic network mount is not qualified by
this exercise.

The caller needs permission to create a private disposable directory, initialize
and commit a local Git repository with an example-only identity, read the shipped
package roots, start Node child processes and write private fixture stores. No
network or production credential, cluster context, Docker, browser, external
model, Go compiler or service is needed by this selected graph. Its builtin
packages run through the existing trusted in-process path; this is not a native
sandbox/cgroup isolation test.

Stop on a missing dependency/tool, wrong source revision or dirty selected
checkout. Correct preparation rather than removing a grant or weakening schema
validation. The source revision recorded in the fixture identifies the checkout;
actual registry content digests separately identify the installed package bytes.

## 1. Materialize the complete inputs

Keep the same Bash shell through all steps. The final component below must not
exist. The parent temporary directory is newly allocated by this shell.

```bash
export LOCAL_CORE_PARENT="$(mktemp -d /tmp/kubeclaw-local-core.XXXXXX)"
export LOCAL_CORE="$LOCAL_CORE_PARENT/journey"
node docs/site/use/workflows/examples/local-core.mjs prepare "$LOCAL_CORE"
```

Expected JSON: `status: "prepared"`, `execution: false`, the selected source
revision, and your exact destination. Keep both paths. A failed preparation can
leave a partial private tree; do not run into it again or erase an unknown path.
Retain its first error, correct the prerequisite and select a different new
parent/destination.

Inspect the materialized inputs before starting:

```bash
cat "$LOCAL_CORE/platform.json"
cat "$LOCAL_CORE/success.pipeline.json"
cat "$LOCAL_CORE/blocked.pipeline.json"
cat "$LOCAL_CORE/denied-platform.json"
cat "$LOCAL_CORE/source.json"
```

The helper creates:

- A committed disposable repository with `Dockerfile`, one static file and a
  literal `COPY site/ /srv/site/` declaration. No image is built.
- A complete `pipeline-platform.v2`: the shipped Nova/common package installation
  roots and builtin trust roots, one fixed repository adapter, an artifact store,
  exact provider selections and narrow stage grants. The registry discovers all
  current packages in those roots; it activates only the selected one stage and
  two adapters. Registry package count is not a supported fixed constant.
- A complete one-stage `pipeline-definition.v2` with concurrency one, one attempt,
  zero technical retries/repair cycles and a 10-second stage deadline. The
  successful input binds `moduleId: site`, `Dockerfile` and `/srv/site/`.
- A second graph whose Dockerfile path contains `../`; the stage must block it
  before repository read, while persisting a diagnostic report.
- A second platform with the stage's artifact-write grant missing; registry/grant
  validation must reject it before execution.
- A private ownership marker used for safe fixture cleanup. It is not a product
  authorization token.

`platform.json` selects `artifacts.write` only for namespace
`kubeclaw.delivery-lint` and `git.repository.read` only for `Dockerfile`.
Adapter configuration fixes the disposable repository and its exact Git HEAD.
The artifact budget is 64 KiB per blob with 100 metadata records and 1 MiB total
configured store capacity. The helper generates no credential or secret value.

## 2. Validate and execute the actual product

```bash
node docs/site/use/workflows/examples/local-core.mjs run "$LOCAL_CORE"
```

This command is a maintained orchestration helper, not a replacement engine.
Read [its complete source](examples/local-core.mjs). In order it:

1. Uses the real platform/graph loaders and `validatePipelineRuntimeV2` to check
   schema, installed packages, selected stage/adapters, configuration and grants.
2. Checks that the missing artifact grant causes a relevant admission failure.
3. Invokes the actual Core CLI with `success.pipeline.json`, the original
   `platform.json`, and `run:local-core-success`.
4. Invokes that CLI with `blocked.pipeline.json` and the separate
   `run:local-core-blocked` identity, expecting exit one and durable `blocked`.
5. Waits for each synchronous child to exit, so the engine's awaited adapter
   shutdown has completed. This private fixture has no other authorized writer.
6. Copies the complete run and artifact trees to `raw-before-audit`, records
   their exact byte digests, and strictly parses copied event/effect journals
   before invoking audit on canonical state. Audit can open/repair a journal;
   retained raw bytes come first. A parse failure stops before audit.
7. Uses the same original CLI platform and run IDs to audit each run, verifies
   audit/head/terminal correlation, reconstructs successful state through the
   original read-only evidence reader, and verifies its artifact blob.

Every CLI invocation, actual exit status, stdout and stderr is retained in
`*.command.json`, `*.stdout` and `*.stderr`. No failed command is changed to a
passing receipt. The two audit invocations are actual `--audit` operations, not
synthetic event summaries. Do not remove the helper's fixed assertions to force
an unrelated installation through this fixture.

## 3. Inspect the observations and artifact

Expected final JSON includes:

- `status: "verified-local-core-journey"`;
- success run `succeeded` and negative run `blocked`;
- `blockedReason: "delivery_lint.path_invalid"`;
- `missingGrant: "rejected-before-execution"`;
- an exact `delivery-lint:site` artifact reference in namespace
  `kubeclaw.delivery-lint`, digest, byte size and producing run/stage/attempt;
- the actual journal head, event count and effect head; and
- `rawBytesPreserved: true` plus the explicit local-only execution scope.

Do not hardcode attempt UUIDs or journal/effect digests. They identify this run's
actual bytes and timestamps, not universal example constants.

```bash
cat "$LOCAL_CORE/validation.json"
cat "$LOCAL_CORE/denied-admission.json"
cat "$LOCAL_CORE/success-run.stdout"
cat "$LOCAL_CORE/blocked-run.stdout"
cat "$LOCAL_CORE/success-audit.stdout"
cat "$LOCAL_CORE/blocked-audit.stdout"
cat "$LOCAL_CORE/verification.json"
node docs/site/use/workflows/examples/local-core.mjs verify "$LOCAL_CORE"
```

The verification command rereads retained bytes; it does not rerun a stage or
repair a journal. It requires exact raw-tree equality, strict hash-linked journal
parsing, actual audit digest/head/event agreement and the same producing attempt.
It reads the original durable artifact blob by its recorded digest, checks byte
count and SHA-256, parses the report and requires `passed: true` with no failures.
The successful result is a Delivery Lint report, not a provider's test result or
a signed product-acceptance attestation.

The invalid-path run must have a blocked stage result and no repository-read
effect. Its diagnostic artifact write is expected: blocked does not mean
“nothing was persisted.” The missing-grant branch is a separate admission
rejection, not the same error and not a passing negative run.

## Failure, recovery and stop decisions

| Observation | Meaning and safe action |
| --- | --- |
| Destination already exists or ownership/revision differs | Stop. Keep the partial fixture and error; choose a new private destination after correcting preparation. |
| Tool/import/lock error | Host prerequisite failure, not a pipeline verdict. Prepare the same supported toolchain; never replace durable journals with memory journals. |
| Stage owner/config/grant validation fails unexpectedly | Inspect the selected installed roots, package versions and exact grants. Do not broaden authority or call a missing stage successful. |
| Expected-success CLI exits nonzero | Retain actual stdout/stderr and original run bytes. Stop; do not change the graph and recover the same run ID. |
| Negative path succeeds, reads the repository, or lacks its blocked reason | Failed safety expectation. Preserve evidence and investigate the owning stage/runtime before any claim of completion. |
| Child response is lost, timeout occurs or writers might remain active | Stop. Establish actual owner exit and stopped adapter writers through the normal [run-control procedure](../operate.md#inspect-a-run) before preservation/audit. A helper timeout is not durable cancellation. |
| Raw copy, strict parse, audit or artifact hash check fails | Preserve the original files and first error. Do not repair/rewrite/remove them to make a comparison pass. Follow [recovery](../recovery.md) under the owning store authority. |
| Run is already terminal | Inspect retained evidence. Do not recover or repeat the same run ID; prepare a new disposable journey if new execution is intended. |

The helper has no retry/resume/repair implementation. That is deliberate:
this graph has no wait or repair edge. Use the separately maintained
[wait/resume](wait-resume.md) guide for that task, with its actual authority and
execution limits. Do not infer those outcomes from this success.

## Cleanup and remaining data

First retain any results needed outside the private fixture: selected source
revision, input JSON, command/exit output, final verification and actual audit,
raw run/artifact copies and their manifest. These local example records contain
no production credential, but remain under your normal retention decisions.
No running process or external resource should remain after successful verify.

Then remove only the marker-bound, fully verified fixture and its now-empty
new parent:

```bash
node docs/site/use/workflows/examples/local-core.mjs cleanup "$LOCAL_CORE"
rmdir -- "$LOCAL_CORE_PARENT"
```

Expected JSON is `status: "owned-fixture-removed"` with your exact root and both
run IDs. Cleanup first repeats verification and refuses absent/changed ownership,
missing verification or changed raw evidence. It does not delete the source
checkout, dependency cache, another storage root or any external object.
`rmdir` fails instead of deleting an unexpected nonempty parent. If verification
failed, this cleanup command intentionally refuses: preserve the partial tree
and diagnose it rather than inventing successful cleanup.
