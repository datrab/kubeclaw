# Preserve an uncertain local external effect

Status: bounded local teaching procedure
Audience: pipeline author and operator
Owner: Nova Core and effect-adapter maintainers
Evidence: docs/site/use/workflows/examples/uncertain-effect.pipeline.json; docs/site/use/workflows/examples/uncertain-effect/journey.mjs; docs/site/use/workflows/examples/uncertain-effect/plugin; skills/nova/core/effects/durable-invocation.ts; skills/common/plugins/runtime-dispatch
Applies to: one owned loopback receiver and one trusted local stage; not a deployed workflow
Last verified: 2026-10-31. Actual response-drop-only author execution and independent original-fault/Source judgment; fresh reader remains separate

## Objective and limits

Run the [registered graph](examples/uncertain-effect.pipeline.json) through the real
Core CLI. The receiver commits one identified mutation to its own file and fsyncs
it. The facilitator then drops the response connection before sending headers,
without first stopping or signaling Core. Allow the actual native error handling
to finish. Preserve its real failed transport receipt and blocked run terminal.
Neither proves that the receiver did not commit the external mutation.

The external effect outcome remains unknown through the supported receiver
lookup: a lost response is not proof of remote failure. The facilitator
observation is retained separately; it is not a Core reconciliation receipt or
authority to rewrite the canonical journal.

The fixture uses the real `runtime.dispatch`, `network.http` and `secrets.read`
adapters. Its private `example.uncertain-effect:mutate` stage is explicitly trusted
teaching code, not a shipped runtime role or an operating-system isolation test.
It requests only the selected loopback runtime target. No production credential,
cluster, model, Redis server or deployed service is needed.

The receiver has durable per-key duplicate protection. The helper tests equal-key
reuse, conflicting intent and bad authorization with a **separate preflight key**.
It never resends the uncertain effect. After the real effect commits, a separate
new-key request must also be refused without changing the receiver ledger.

## Prerequisites

Use the complete reviewed Source revision selected for the registered exercise.
Prepare an isolated clean checkout with its locked Node.js 24 development
dependencies through the [developer handbook](../../extend/developer-handbook.md).
Do not substitute its older example revision or an unrecorded current branch.
Before this procedure, require that the selected commit contains the graph,
helper and private plugin. Record the full `git rev-parse HEAD` value.

Require Linux, GNU `/usr/bin/flock` with `--timeout`, a writable local filesystem
with the required append/fsync/lock behavior, and permission to start and stop
only the owned Node child and loopback listener. The helper generates an ephemeral
authentication value in memory. Do not replace it with a production Secret.

```bash
set -e
node --version
/usr/bin/flock --version
git status --short
export UNCERTAIN_PARENT="$(mktemp -d /tmp/kubeclaw-uncertain.XXXXXX)"
export UNCERTAIN_ROOT="$UNCERTAIN_PARENT/case"
node docs/site/use/workflows/examples/uncertain-effect/journey.mjs run "$UNCERTAIN_ROOT"
```

The case directory must not exist. Keep the printed and selected paths. On a
nonzero exit, retain the first error and the partial tree. Do not delete an
unknown tree, broaden grants or treat a different failure as the expected fault.

The helper copies the registered JSON without changing any byte. It validates
that exact graph against the actual installed registry and grants, then invokes
`skills/nova/core/cli.ts` with that graph and the owned `platform.json`.
`command.json` records the exact argv. The graph has a three-attempt allowance;
this does not authorize a fresh attempt after an uncertain effect.

## Inspect before deciding

Require a zero exit from the facilitator command. Its result means the prescribed
fault and evidence checks completed, **not** that the pipeline succeeded. The
Core child itself must exit with code 1 and no signal after its native error
handling. The expected canonical state is `blocked`, with one used stage attempt
and a failed `adapter.effect_failed` transport receipt. The helper waits for
that exit before copying state. No product audit or recovery
command runs before preserving the raw bytes.

```bash
set -e
node docs/site/use/workflows/examples/uncertain-effect/journey.mjs inspect "$UNCERTAIN_ROOT"
cat "$UNCERTAIN_ROOT/command.json"
cat "$UNCERTAIN_ROOT/process.json"
cat "$UNCERTAIN_ROOT/validation.json"
cat "$UNCERTAIN_ROOT/receiver-controls.json"
cat "$UNCERTAIN_ROOT/case-identity-guard.json"
cat "$UNCERTAIN_ROOT/receiver-observation.json"
cat "$UNCERTAIN_ROOT/lookup-result.json"
cat "$UNCERTAIN_ROOT/verification.json"
```

The native run snapshot and copied `events.jsonl` and `effects.jsonl` are under
`raw-before-audit`. Use the run path recorded in the evidence; do not guess the
encoded directory name. `inspect` uses the product's strict journal parser and
checks complete copied/current file digests before reporting the journal heads.

Match all of these facts:

- There is exactly one original `runtime.dispatch` request and acceptance.
- Its effect ID, idempotency key, resource and payload match the receiver's
  identified observation. The receiver has one commit for that case key.
- The real failed `adapter.effect_failed` receipt and `run.blocked` terminal
  remain unchanged. There is one used stage attempt; no retry was submitted.
- `process.json` records the response-drop-only fault, no prior kill and normal
  child exit (code 1, signal null).
- `lookup-result.json` records an actual read attempt returning HTTP 501 with
  `RECEIVER_RECEIPT_LOOKUP_UNAVAILABLE`.
- The canonical stopped-writer state still equals the preserved raw copy.

The receiver observation is external evidence. It is not a Core effect receipt
and does not authorize writing one. The receiver does not expose a receipt lookup
operation for this exercise. The selected runtime adapter also has no `receipt()`
method. There is no supported generic Core reconciliation/result-import command.

Follow [Lost Responses and Uncertain Effects](../diagnose.md#lost-responses-and-uncertain-effects).
Record the external outcome as unknown in a separate operator assessment,
keeping the receiver observation and the canonical failed transport receipt
distinct. Do not write that assessment into either product journal. Do not call
the external operation failed, cancelled or completed merely because the
transport failed and Core blocked. Do not run `--recover`,
start another attempt, change the key, resend the request or edit either journal.

## Record the safe stop and retain the evidence

After your own inspection, record the documented stop:

```bash
set -e
node docs/site/use/workflows/examples/uncertain-effect/journey.mjs stop "$UNCERTAIN_ROOT"
cat "$UNCERTAIN_ROOT/operator-decision.json"
```

This command records your decision after rechecking the same evidence. It does
not resume Core, import a receipt, reconcile the receiver or assert that you are a
fresh participant. An author or facilitator run is not a reader-acceptance result.

Keep the complete case directory as one evidence set: the unchanged graph,
platform, source identity, validation and command, child output/exit, original
request and raw journal heads, complete state copies and file manifest, receiver
ledger/observation, lookup result, guard controls and your decision. The ledger's
separate preflight record is not a second commit for the case effect.

Export the evidence before cleanup. Use a new destination outside the owned case:

```bash
set -e
export UNCERTAIN_EVIDENCE="<your-new-absolute-evidence-directory>"
test ! -e "$UNCERTAIN_EVIDENCE"
cp -R "$UNCERTAIN_ROOT" "$UNCERTAIN_EVIDENCE"
diff -qr "$UNCERTAIN_ROOT" "$UNCERTAIN_EVIDENCE"
UNCERTAIN_EFFECT_EVIDENCE_EXPORTED=yes node docs/site/use/workflows/examples/uncertain-effect/journey.mjs cleanup "$UNCERTAIN_ROOT"
rmdir "$UNCERTAIN_PARENT"
```

The final environment value asserts that you actually completed the copy and
comparison. Do not set it to skip retention. Cleanup removes only the marked
owned case after its exact child and listener have stopped; it does not touch a
production run, canonical repository fixture or the exported evidence.

Keep the safe stop until the existing Core/adapter owner supplies a supported
reconciliation operation with an authorized receiver read, exact identity and
result-import contract. This example neither implements nor approves that feature.
