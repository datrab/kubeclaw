# Validate a local Prism flow and resolve a Buster suite

Status: local native request/template/provider/output validation; original fresh quality-reader acceptance pending
Audience: Prism and Buster specialist
Owner: Prism document and Studio maintainers; Buster resolver and capability-documentation maintainers
Evidence: docs/site/use/workflows/examples/prism-studio-flow.json; docs/site/use/workflows/examples/quality-validation.mjs; docs/site/use/workflows/examples/buster-fixture-matrix-report.pipeline.json
Applies to: native request/document/template, local deterministic design provider and typed output, suite resolution and documentation-drift checks; no remote provider execution or deployment
Last verified: 2026-11-01. Actual author native request/component/provider/output and retained mutation controls; not a fresh participant or original acceptance

## Native validation scope and identities

The canonical `prism-studio-flow.json` is a real closed native `generate`
engine request, not a new wrapper or provider registry. Its `input.document`
is a native `prism.design-document.v1` document. Flow `review` selects the
`confirm-button` transition from `home/ready` to `home/default`.

The document also selects reusable component template `review-card` through a
native `component` node's `props.component`. The native document validator
checks that reference, and the real renderer must include the selected template's
content. A seed-file hash, unrelated HTML or a preview alert is not resolution.
“Template” here means this actual reusable component definition, not a newly
claimed product `templateId` service.

For this local validation command, the fixed factory is the maintained
`DeterministicDesignProvider` export in `skills/prism/engine/design-providers.ts`.
The helper constructs that real provider and uses it in `PrismEngine` for the
fixture's native `generate` request. It verifies the actual typed operation and
changed document, then renders with `capture: false` to prove template consumption.
The provider identity and exact Source hash are bound to the fixture request digest.
There is no `providerId` field in the request and no remote model response.
This is the documented validation route's fixed local constructor selection, not a new
Worker/Studio provider-wire setting or a claim of production generation.

The worker binding validates installed request and result schema IDs/digests for
`kubeclaw.prism-design-engine@1`; generated and rendered result records retain
those exact output contracts. The production native worker **rejects generate**
with `Prism generation requires the OpenClaw agent gateway`. Local library
validation does not bypass or authorize that production path. It creates no
Gateway job, Control approval, signed result or Baseline Bundle.

Original task acceptance still requires independent judgment and a new eligible
participant completing the unchanged four outcomes; helper zero is not that award.

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
cat "$QUALITY_RESULTS/prism-generated-result.json"
cat "$QUALITY_RESULTS/prism-rendered-result.json"
cat "$QUALITY_RESULTS/buster-resolved-plan.json"
cat "$QUALITY_RESULTS/capability-mutation-result.json"
```

Stop at the first unexpected error. Keep that error and partial results. Do not
broaden grants, replace a native owner with a schema-only stub, or interpret
`ready` from local evaluation as a deployed design approval.

The native request contains document `quality-reader-design`, revision 1. Its
`confirm` action on `confirm-button` resolves `home/ready` to `home/default`.
Wrong-node navigation does not resolve. Malformed flow data is rejected by the
actual contract. A missing transition endpoint produces a blocking native flow
finding. The real generated output and native render must contain the referenced component template. Missing/wrong template references, wrong request-schema digest, invented provider/template input fields and malformed output are rejected. The helper retains generated/rendered typed results and local preview markup.

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

The local fixture/request/template/provider/output path must receive independent
original-condition judgment before a new eligible fresh quality reader. No whole-gate,
remote-provider execution, accessibility or deployment acceptance follows from these
local checks.

The result directory must be new and absolute, with an existing canonical parent and no symlink anywhere in its parent ancestry. The helper refuses noncanonical or symlinked ancestry before creating the result root.
