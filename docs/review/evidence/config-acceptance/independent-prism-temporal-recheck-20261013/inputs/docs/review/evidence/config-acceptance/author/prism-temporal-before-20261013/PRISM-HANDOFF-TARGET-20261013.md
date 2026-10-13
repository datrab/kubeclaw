# Proposed Prism handoff contracts — PPRISM001/003

Definition proposal only. These additions are not current API/schema support,
implementation authorization, installed-image proof or global C0 acceptance.
The pre-correction rows/cases and independent report remain preserved. The
machine-readable companion carries complete bounded A/B inputs and future cases.

## First durable design-round boundary

Both dispatch and Studio currently commit `startDesignRound` before admission of
the agent job. Capture the selected policy **inside that first transaction**, not
only in the later job request. The existing `design_round.request` stores the
following proposed immutable `designBinding` object alongside its original
request; no independently editable registry is introduced:

| Field | Exact proposed meaning |
|---|---|
| `schemaVersion` | Literal `prism-design-binding.v1`; serializer identity, not an operator selector |
| `count` | Integer 2 or 3, selected from the sole Control component profile |
| `controlConfigDigest` | SHA-256 of canonical complete selected Control definition |
| `controlConfigRef` | Digest-addressed retained definition bytes; never `latest` |
| `intentDigest` | Digest of the original typed task-cardinality constraint record and its instruction references |
| `architectureDigest`, `architectureRevision` | Exact original active architecture identity/revision |
| `projectInstructionDigest` | Original project-instruction snapshot digest |
| `bindingDigest` | SHA-256 of canonical object excluding only `bindingDigest` |

Canonical encoding is the existing WorkerCore canonical JSON convention, UTF-8,
SHA-256, with no digesting of secret values. Exact generated field/schema identities
are part of the proposed serializer and require authorized implementation later.
Store the full binding in the round request; the digest-addressed configuration
reference is redundant verifiable provenance, not a second author. Add this
binding to `DesignRoundStart` before its start digest is computed. Canonicalize the
new start input consistently rather than relying on construction-property order;
retain original historical start-digest encoding and never rewrite historical keys.

Resolve an existing `(project,startKey)` before applying a newly published profile:
same original request and binding returns the retained round; an explicitly
different proposed binding/count under that same key rejects before job creation.
A retry which supplies only the unchanged request/key retrieves original A even
when current selection is B. This lookup does not fill a missing original binding
from B or infer a historical count from today's defaults.

### Explicit eligibility (not preference inference)

All existing/legacy/free-form request shapes remain three-design intent. They are
**not eligible for B2**, even if the newly selected Control profile says 2. B2 is
limited to a separately submitted new task with a typed `exactCount:2` constraint,
matching architecture and project-instruction constraint snapshots from their
original authorized task authors. Those new task instructions must be generated
from the same typed constraint; arbitrary free-form cardinality overrides are not
allowed in that B2 input form. Missing constraint, an original exact-three
constraint, an instruction/architecture digest mismatch, or disagreement among
the two original constraints rejects B2 at round admission. A profile never edits
or shortens an existing task's instruction. Non-cardinality free-form content may
remain, but cannot supply a conflicting count override. This restrictive new B2
task form and its business validity remain proposed/unapproved, not a claimed
automatic interpretation of arbitrary narrative instructions.

### Later projections and recovery

`admitDesignAgent` loads the committed round under its original generation and
copies that exact binding into the immutable job request before hashing/enqueue.
The job cannot manufacture or choose another binding. Prompt text, task tool
description and result-count expectation derive from that retained binding. R's
captured tool capability advertises supported counts; it does not author the task
count. An exact-three old registration rejects a bound-two job before external
action, regardless of a newly published component definition.

The result handler verifies job/fence/project/generation plus the round and job
binding digests before result/document effects. Repository uniqueness and complete
document count equal the original count; material-diversity policy stays separate.
Round receipts include `generationId`, `bindingDigest`, `expectedCount`. Pending
client state stores all three. **Every** `completeRound`, initial document-load,
polling, reject-all and removal path uses this original identity/count; A3 with
only one or two documents stays pending and does not remove its stored key.
Mixed-generation results or digest disagreement fail without key removal.
Generated UI/tool text uses the same original count, not an ambient profile.

Crash after round commit but before job transaction: retain the round, reload its
binding and create at most one original-generation job using existing admission
idempotency. Crash/uncertainty after external dispatch follows existing job/fence
reconciliation, never dispatches again merely to adopt B. A pre-ledger round
already having a committed result remains completed with **no new external
action**; absent count/provenance cannot authorize another action. Missing original
binding for incomplete historical work requires explicit reconciliation, not a
synthetic three/two value. No new deadline, grant or budget is derived from B.

## Native provenance: separate OCI from engine bytes

The current engine profile carries a projected OCI digest, and current dedicated
host validation does not authenticate installed engine bytes. Preserve that exact
historical interpretation. Do not relabel historical OCI content as code-tree
content or add another editable digest author.

Propose a strict generated `prism-native-provenance.v1` record attached atomically
to the existing `engine_operation` original attempt reservation. It is generated
from delivered artifacts and the selected complete component configuration, not
authored by a task or an SDK codec. The record has these distinct identities:

| Field group | Producer / verifier |
|---|---|
| `role` | Exact `prism-worker`; trusted delivery role manifest, not request self-report |
| `oci` | Selected image manifest digest, optional index digest, exact OS/architecture/variant; sole `versions.json`/Delivery selected-image projection |
| `code` | Exact source commit, package manifest digest, engine file-tree digest, dependency lockfile digest; delivery packaging over enumerated files with canonical paths/hashes |
| `installationManifestDigest` | Digest of the retained immutable manifest joining role, OCI, code and platform; generated delivery output, not a second index |
| `config` | Owner `prism-worker`, selected generation, immutable reference and canonical complete-config digest; existing sole component author |
| `profileDigest` | Exact accepted WorkerProfileV3 digest, preserving current OCI meaning in its `engine.contentDigest` |
| `capabilityContractDigest`, `grantedCapabilities` | Digest of the delivered capability declaration and canonical duplicate-free grant set from original authorized acceptance; not a new secret/permission author |
| `provenanceDigest` | Canonical SHA-256 of all prior fields, excluding this digest only |

Digest fields use `sha256:` plus 64 lowercase hex; source commit is exact 40 hex;
references must be immutable digest-addressed artifacts. Platform and contract
enum support must come from the selected delivered role manifest, not arbitrary
task strings. No secret bytes are in this tuple. Fixture A/B values in the
companion are **synthetic definition specimens**, not observed OCI or grants.

At original `reserveNativePrismOperation` insertion, verify request and retained
tuple together, and atomically store envelope plus provenance before dispatch.
Same key/request returns the original envelope/tuple; a caller presenting an
incompatible changed tuple must not replace it. Existing result replay validates
original bound result/tuple and hydrates only, with zero execution. Legacy completed
results retain their existing no-new-effect behavior; missing original provenance
for pending/uncertain work blocks execution and requires reconciliation.

Before fresh **and recovered** native execution, the trusted supervisor verifies
the retained installation manifest, original grant subset and tuple compatibility
against the actual prepared runtime instance. Before dedicated host engine prepare,
a trusted installed-byte verifier enumerates the selected package files and hashes
them against that retained manifest. Input envelope/self-reported receipt or an
environment digest cannot supply this evidence. Actual OCI manifest/platform
verification belongs to the image/delivery provider; a file-tree hash cannot prove
OCI identity. Absence of either real observation rejects before preparation or any
engine/artifact effect. No installed A instance may execute bound B, or vice versa.

Recovery may use retained compatible A runtime or report reconciliation needed;
it must never substitute current B/config/grants, mint synthetic development
identity or extend original claim/deadline/budget. Nonproduction fixtures are
explicitly tagged fixture prerequisites and cannot satisfy production or fixed
Eval. Fixed Eval requires the full recorded original tuple and real fixture grant
and installed-runtime evidence. Provider/verifier implementation and those physical
prerequisites remain future C3/C5 work, not proof supplied by this document.
