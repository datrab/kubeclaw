# Validate a local Prism flow and resolve a Buster suite

Status: bounded local validation proposal; original quality-reader case remains incomplete
Audience: Prism and Buster specialist
Owner: Prism document and Studio maintainers; Buster resolver and capability-documentation maintainers
Evidence: docs/site/use/workflows/examples/prism-studio-flow.json; docs/site/use/workflows/examples/quality-validation.mjs; docs/site/use/workflows/examples/buster-fixture-matrix-report.pipeline.json
Applies to: native document, transition, preview, suite resolution and documentation-drift checks; no provider execution or deployment
Last verified: 2026-11-01. Actual author validation and mutation controls; not a fresh participant or independent acceptance

## Scope and unresolved original condition

The original `READER-QUALITY-01` task requires Prism validation to resolve flow,
template, provider and output identities. Its named Prism fixture was missing.
The proposed fixture here is a real `prism.design-document.v1` document, not a
wrapper that bypasses the contract. The native validator, Studio flow resolver,
preview renderer and deterministic evaluator accept it. They resolve document,
flow, view, state, node and action identities.

Those Studio contracts do **not** bind a template registry, design-provider
registration or output identity. The helper reports this missing original
condition rather than inventing these identities. Its zero exit means the
specified bounded validation assertions completed. It does not make the original
quality-reader case pass. The authoring basis is the maintained `minimal-web.json`
contract fixture, not a newly discovered product template service.

Prism maintainers must supply and document the actual native binding intended by
that original condition, or obtain an explicit original-criterion adjudication.
Do not relabel a document ID as a provider or output. This local input/contract
question is not automatically an external credential problem. This validation creates no Gateway request, model request, provider request,
signed result, approval or Baseline Bundle.

## Prerequisites and local command

Use a clean complete Source checkout at the immutable revision supplied by the
registered exercise, after that revision actually contains both fixtures and the
helper. Follow the developer handbook's locked development-dependency setup.
Require Node 24 and the normal source dependencies. The helper derives Source from its own installed location. It requires a clean
checkout, including untracked files, and records the exact revision, tree and input hashes.
It rejects a distinct `KUBECLAW_EXAMPLE_SOURCE_ROOT` override. Do not combine a helper or fixture from another checkout. A published Reader archive
alone is not an execution checkout.

Run from the repository root. Choose an absolute result directory outside the
checkout that does not exist:

```bash
set -e
node --version
git rev-parse HEAD
git status --short
export QUALITY_RESULTS="<new-absolute-result-directory>"
node docs/site/use/workflows/examples/quality-validation.mjs "$QUALITY_RESULTS"
cat "$QUALITY_RESULTS/author-native-result.json"
cat "$QUALITY_RESULTS/prism-native-result.json"
cat "$QUALITY_RESULTS/buster-resolved-plan.json"
cat "$QUALITY_RESULTS/capability-mutation-result.json"
```

Stop at the first unexpected error. Keep that error and partial results. Do not
broaden grants, replace a native owner with a schema-only stub, or interpret
`ready` from local evaluation as a deployed design approval.

The helper validates flow `review` in document `quality-reader-design`. Its
`confirm` action on `confirm-button` resolves `home/ready` to `home/default`.
Wrong-node navigation does not resolve. Malformed flow data is rejected by the
actual contract. A missing transition endpoint produces a blocking native flow
finding. The actual renderer produces the corresponding local preview markup.

For Buster, the helper copies the canonical full suite fixture byte-exactly into
an owned temporary `.swarm/pipeline.json`, loads module `web`, discovers the
installed Buster packages, and invokes the real suite resolver. It retains the
complete frozen plan, suite-template identity, provider package/configuration
identities, JUnit adapter, both HTTP matrix nodes and all three typed links.
It does not execute `npm test`, `manifest-check`, Kubernetes or HTTP provider work.
The fixture's image digest and executable names remain explicit execution
placeholders; successful resolution is not their live admission.

The existing documented resolver/typecheck command is separate:

```bash
set -e
npm run verify:test-gate:suite-resolver
```

That command checks maintained resolver contracts. It does not accept the
registered JSON as a CLI argument; the helper's exact-fixture resolution is a
separate native observation, not a relabelled test-name result.

## Capability mutation and exact diagnostic

This guide registers the exact `QUALITY-UNDECLARED-PROVIDER-CAPABILITY` facilitator mutation.
Original task criteria do not change. In an owned copy of
`skills/buster/plugins/direct-command/plugin.json`, append `state.read` to
`kubeclaw.direct-command:command`'s `requiredCapabilities`, leaving the canonical
capability-reference page unchanged. It is a new explicit registration proposal
for this task's previously unspecified capability mutation, not a claim the old
fixture already named that capability.

The helper's registration subgate must return `DOC_DRIFT_CAPABILITY`, exit 1,
and name the exact provider. It restores the original manifest bytes and
requires a zero restored comparison. It never edits the checked-out provider or
performs the undeclared operation.

The registered family command is:

```bash
set -e
npm run docs:drift:capability:check
```

Run mutation controls only in an isolated source copy. Preserve baseline zero,
the actual mutation exit 1 and diagnostic, exact restoration and final zero.
The family also checks vocabulary, policy and native boundaries. Its baseline
needs the documented nested Reader parser dependencies and a real supported Git
origin for Source links. Missing dependencies, unsupported origin or unrelated
errors are not expected mutation refusals. Never weaken a guard to obtain zero.

This is documentation drift: a source declaration and its documented declaration
disagree. It is not proof of an effective production grant or of a runtime
provider refusing an invocation.

## Read the authoritative record

Prism's provider response and preview are design intent, not approval. Control
owns the admitted document revision, bound quality result, accepted warnings and
approval. A published Baseline Bundle is identified by `approvalId`, bound
revision/digest and `bundleDigest`. Exclude concurrent writers and verify currentness;
a publication response does not prove the approved revision is still current.
See [Prism Studio](../prism-studio.md).

Buster resolution freezes configuration; it does not run the suite. Provider
stdout, process exit zero, a parsed JUnit file or HTTP acceptance alone is not
the gate decision. Buster's admitted job and terminal normalized result bind
source, plan, provider and evidence identities. Nova must fetch and verify the
exact result digest and receipts, import all referenced evidence, then calculate
the gate decision. `completed` means a result exists, not that every blocking
node passed. See [Run a Buster suite](buster-suite.md).

No such live approval or Buster job is fabricated by this exercise. The original
reader is asked to identify the authoritative record, not invent one.

## Retention and cleanup

The helper removes its owned temporary resolution and manifest-copy directory
in `finally`, including after a validation error. It keeps all reports and
preview markup under the new result directory. These are local validation
artifacts, not production state. Retain them with the actual Source and command
records. Remove only that selected result directory after exporting any needed
evidence; do not remove the source checkout, canonical fixture, real job store
or an unrelated cache.

Original outcome one remains open until its template/provider/output binding is
substantively supplied and reviewed. No fresh quality-reader, whole gate,
provider execution, accessibility or deployment acceptance follows from these
local checks.

The result directory must be new and absolute, with an existing canonical parent and no symlink anywhere in its parent ancestry. The helper refuses noncanonical or symlinked ancestry before creating the result root.
