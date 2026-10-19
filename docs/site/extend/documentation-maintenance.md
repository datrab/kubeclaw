# Maintain documentation from source changes

Status: source-described maintainer workflow; each change needs its own check and reader results
Audience: developer, documentation maintainer, documentation agent
Owner: documentation
Evidence: scripts/docs-governance.mjs; scripts/docs-generate.mjs; scripts/docs-inventory.mjs; scripts/docs-configuration-inventory.mjs; scripts/check-configuration-cli-drift.mjs; scripts/check-configuration-drift-mutations.mjs; scripts/docs-platform-surface-inventory.mjs; scripts/docs-publication.mjs; scripts/docs-tree-boundary.mjs; scripts/docs-parity-transition.mjs; docs/config/documentation-tree-classification.json; docs/config/documentation-tree-baseline.json; docs/site/reference/documentation-route-registry.json; package.json; .github/workflows/docs-checks.yaml
Applies to: authored reader pages, source-derived documentation, and their ownership and publication inputs
Last verified: implementation behavior checked on 2026-10-15; no generation, check, mutation test, or reader exercise asserted

## Start with the changed behavior

A nested configuration field changes its default. Updating a table is not enough:
the consumer may apply a different default, an operator may need a restart, and
an old example may now request the wrong behavior. This workflow connects the
source change to its explanation, generated facts, failure path, and reader task.
Use it for a new surface, a changed meaning, and a removal. A documentation agent
uses the same steps and stop conditions as a human maintainer.

Use the [Developer handbook](developer-handbook.md#route-each-source-change-to-its-documentation-owner)
for component-specific owners and checks. Use [documentation governance](../reference/documentation-governance.md)
for canonical homes and source authority. This page joins those rules into one
change procedure; it does not replace the component's technical guide.

## Prepare a bounded change

1. Start from a checkout whose revision and existing changes you can identify.
   Record the changed source paths, selected tools, dependency state, and intended
   outputs. Preserve unrelated work. Use the handbook's
   [checkout and component preparation](developer-handbook.md) before running tools.
2. Name the reader's question and the behavior owner. Distinguish product source,
   a supported dependency configuration, a generated fact, and explanatory prose.
   A schema declaration alone does not prove a consumer inserts its default.
3. Open the [page map](../reference/generated-documentation-map.json). Locate the
   source dependency or parent component and its owner, page, and declared checks.
   Read the actual generator's boundary and the actual consumer. If no mapping
   exists, assign an owner and canonical page before calling the change covered.
4. Identify permissions and effects before execution. Node.js 24 and locked root
   dependencies are common prerequisites, not the whole toolchain. Follow the
   [selected-route tools](developer-handbook.md#add-tools-and-credentials-only-for-the-selected-route)
   for any Helm, Go, Kubernetes, native, or other requirement. A source or local
   check is not a live deployment result. Missing prerequisites stop that route;
   do not switch to a partial parser or omit a source to obtain a green result.

Keep a small change record: source boundary, parser/selector, owner, canonical
page, generator or manual explanation, check, reader task, and exclusions.
This record is a work aid. Registering it does not prove discovery complete.
The generated page map lists metadata dependencies and check names, but does not
itself inventory every public surface, run a reader task, or choose every test.

## Discover the whole affected family

Search the source boundary before selecting a convenient example. Include
conditional and disabled supported branches, shared helpers, generated names,
and callers that change defaults or authority. Read the actual extractor's
roots, exclusions, and supported syntax. An unsupported source form is a blocker
for that extractor, not proof that the surface does not exist.

| Family | Facts to preserve with a source location | Reader destination and bounded tool route |
| --- | --- | --- |
| Schema and configuration | Recursive objects, arrays, alternatives, conditions, required relationships, constraints, schema defaults versus runtime defaults, deprecated fields, consumer, precedence, sensitive data, reload/new-run effects | Start at [Configuration precedence](../reference/configuration-precedence.md), the selected family page, and [Plugin configuration](../reference/plugin-configuration.md). `docs:inventory:config` derives its declared YAML/schema/runtime-input inventories; inspect its boundary before treating them as global coverage. |
| Commands and flags | Owning entrypoint, subcommand, aliases, value-taking, required/optional relationships, defaults, duplicate and unknown-option behavior, exit/failure meaning, consumer | Use [CLI commands](../reference/cli.md) and the component guide. `docs:inventory` covers deployment/secret/Helm/workflow facts; the configuration runtime-input inventory has a separate owned-definition CLI surface. `docs:drift:cli:check` checks that inventory and its declared semantics. External-command invocations are not owned CLI definitions. |
| Contract | Exact identity/version, producer and consumer, schema/type relationship, compatibility direction, migration and retirement | Use [Configuration compatibility](../reference/configuration-compatibility.md), [SDK](../reference/sdk.md), or the component's contract guide. Select its real generator/check; do not assume a configuration-schema extractor covers all request, result, and snapshot contracts. |
| Event | Producer, consumer or explicit unknown consumer, payload/version, transport, correlation, ordering, repeat delivery, persistence and retention | Use [Telemetry](../understand/telemetry.md) and the component guide. The [platform surface reference](../reference/platform-surfaces-generated.md) supplies bounded facts, not every payload's meaning. Read its discovery boundary. |
| Error | Exact code or dynamic construction rule, throw/emit location, trigger, effect and lifecycle state, retry rule, safe action, retained data | Use [Configuration errors](../reference/configuration-errors.md), [Buster errors](../reference/buster-error-codes.md), and the producing component. Follow dynamic prefixes/arguments and shared error constructors; a string-literal search alone cannot establish completeness. |
| Endpoint | Producer/listener, caller, Service/route/port, transport, authentication and authority, limits, failure and recovery | Use [Endpoints](../reference/endpoints.md) and [Service routes](../reference/service-routing.md). Reconcile chart/config/runtime consumers, not only one default render. |
| Store | Writer/reader, exact path or resolution rule, authority, lifetime, retention, quota, cleanup, backup/restore and loss impact | Use [Data and state](../understand/data-and-state.md), [Recovery](../use/recovery.md), and [Capacity](../use/capacity.md). An absent default can defer to another authority; do not invent a retention policy or restore command. |
| Capability | Namespace, provider, caller grant, resource match, translation boundary, denial behavior | Use [Capabilities](../reference/capabilities.md) and [Roles and package ownership](../reference/roles-and-package-ownership.md). A runtime role, Nova grant, Buster capability, and Kubernetes RBAC rule are not interchangeable. |
| Workflow | Trigger, owner, inputs/secrets, permissions, tools, outputs, external effects, success/failure and rollback limits | Use [Workflow inventory](../reference/workflows.md) and the task procedure. `docs:inventory` derives declared workflow facts; an inventory of commands does not prove that they ran. |

For each affected family, compare discovered identities to documented identities
in both directions. Find a source with no page and a page with no current source.
Keep exclusions and unknown semantics visible. Do not extrapolate a fixed count,
one passing example, or one component's extractor to the whole product.
The product boundary includes KubeClaw-owned interfaces and supported dependency
choices; it does not require copying every unused upstream Kubernetes field.
Link applicable upstream definitions while explaining the choice KubeClaw makes.

## Choose one fact authority and its explanation

Put a mechanical fact in its source and let its owning generator derive it.
Write the reason, operational consequence, compatibility, and safe recovery in
the authored page. Do not manually maintain a second list of generated fields.

| Change | Update together | Do not substitute |
| --- | --- | --- |
| Nested field/default | Consumer/schema relationship, recursive reference, effective-value explanation, example, reload/change impact, rejection case | A schema default for evidence that runtime inserts it |
| New flag | Actual parser, owner/subcommand, help/default/precedence/duplicate semantics, guide, negative input | A shell invocation of another tool for a new product option |
| Changed error | Producer and dynamic-family rule, exact reference, lifecycle/retry/safe action, positive and negative case | A renamed label while keeping the old recovery instruction |
| New event or store | Producer/consumer or writer/reader, version/path resolution, authority, retention/failure explanation | A generated name list for operational meaning |
| New reader page | Six metadata fields, canonical classification, incoming task link, evidence paths, generated map inputs | A hand-written entry in the generated map |

Use Status, Audience, Owner, Evidence, Applies to, and Last verified on every
reader page. Evidence paths are repository-relative and separated by semicolons.
Do not advance Last verified beyond the actual source or execution evidence.
Use a full committed revision and valid narrow line range for explicit pinned
source links. Compare the cited bytes to the current source; an unchanged old
link can point to behavior that no longer applies. Keep uncommitted source
provenance explicit until the publication revision can genuinely contain it.

A new page under `docs/site` also needs one explicit canonical record in
`docs/config/documentation-tree-classification.json`: matching actual and
expected path, canonical-reader class, purpose, original path, and the correct
introduced-after-baseline flag. Preserve the immutable baseline; do not recapture
it to conceal a new or moved file. The generic tree tooling and publication
selector must agree. Non-Markdown reader assets need their separate allowance.

## Generate only owned facts, then check

Follow the handbook's [single common chain](developer-handbook.md#documentation-change-chain).
The following choices explain its effects; they do not authorize a command in
an environment whose source/tool prerequisites have not been qualified.

| Input change | Selected command and output | Check or failure meaning |
| --- | --- | --- |
| Page metadata or evidence dependencies | `npm run docs:governance:generate` writes `docs/site/reference/generated-documentation-map.json` | `docs:governance:check` compares expected bytes and validates route metadata. Missing owner/evidence needs source metadata repair, not a map patch. |
| Deployment/secret setup/Helm/workflow source facts | `npm run docs:inventory` writes its four inventories under `docs/generated/inventory` | `docs:inventory:check` compares those expected JSON bytes. This does not cover every runtime input. |
| Declared configuration source families | `npm run docs:inventory:config` writes values, schema, and runtime-input JSON inventories; then selected reference generation | `docs:inventory:config:check` rejects stale bytes and verifies external Helm authorities on its successful-current path. Full discovery may acquire tools/children; it is not just a JSON comparison. |
| Source-derived reference sections | `npm run docs:generate` updates its owned reference outputs | `docs:generate:check` detects mismatch. Prepare the actual source revision and selected discovery route; do not suppress unsupported inputs. |
| Plugin catalogue/capability/operator matrix | `npm run docs:publication:generate` writes catalogue/capability pages and the marked operator matrix | `docs:publication:check` first runs helper tests and then compares/checks publication inputs. It does not validate every product example or live effect. |
| New/moved documentation inputs | `npm run docs:tree:generate` derives the tree inventory from classification, baseline, current inputs, and consumers | `docs:tree:check` rebuilds and compares the model. Its dependency/consumer analysis has prerequisites; do not infer a pure file read from its name. |

> **Source — ownership records and generator selection**
>
> Claim: page metadata supplies ownership/dependencies; generators select their owned outputs; check modes compare the derived result instead of making an authored page authoritative product input.
> Implementation: `scripts/docs-governance.mjs`, `pages` metadata and generator selection, lines 85–108; output/check/generate branch, lines 124–143. `scripts/docs-generate.mjs`, `stableWriteMap`, lines 131–154, selects reference outputs. `scripts/docs-tree-boundary.mjs`, `main`, lines 904–936, selects byte comparison or tree output writing.
> Contract: the six metadata fields and source dependencies feed the generated page map; classification and the immutable baseline feed the tree model. A map row or selected output is not evidence of complete source discovery.
> Validation: no generator, checker, mutation test, or reader task execution for this statement.
> Checkout identity, SHA-256: governance `a4a44fdb62fb8a963e1e7aa84fdacf41edfab06282e31938bda412252ea18502`; reference generator `c83c5653177b9b0a56326b0e315c409dc3c814c95d37dd53933402a2288aa718`; tree checker `a432a90ab447e4f9b944fae829aca7841eaad61493bc59fba629d7d2c3610a92`. These identify current file bytes, not claimed committed revisions.
> Limit: selected SDK/discovery, source/Git and child-process prerequisites remain in force. The locators do not admit those effects or prove any generated result current.

Inspect every generated diff and require exit zero before the next step.
Generators can write earlier files before a later failure. Retain the first
error, partial diff, selected revision and tool versions; fix the input or tool
cause and rerun that same owned generator. Do not use a broad reset, edit generated
facts manually, or pass a gap-allowance switch to hide a production omission.
For prose-only changes, avoid unrelated generator writes.

The common stable sequence is:

```sh
set -eu
npm run docs:governance:check
npm run docs:generate:check
npm run docs:check:refs
npm run docs:site-boundary:check
npm run docs:publication:check
```

Run the changed component's named checks before publication checking. Keep the
actual command, exit status, cases passed/failed/skipped, tool versions, source
revision, and changed-file observations. Stop on the first failed prerequisite
or required check; do not average a failed boundary into other successes.
A command listed in the map is a requirement to evaluate, not a saved result.
The broader `docs:check` and `docs:publish-check` include additional tests and
staging effects. Use [Documentation site and publication](../reference/documentation-site.md)
to inspect their output and distinguish Markdown staging from rendered behavior.

## Prove the changed meaning, not a fixed count

Choose the smallest complete checks for the affected source and consumer.
For a nested default change, verify the actual absent-input result, an explicit
accepted value, an invalid value, and any conditional branch that changes the
default or authority. For a removed error identity, verify its absence from
current output, the retained dynamic family, and the changed safe-action text.
Do not mutate production source as an experiment while another task uses it.

Use isolated fixtures for addition, semantic change, and removal on each distinct
affected generator or parser path. Reuse an existing valid probe when several
registered variants share that path; state which source extraction and output
comparison they share. A common parser library alone does not establish shared
coverage: different AST selectors, embedded languages, renderers, or comparison
sections can require their own representative probe. First demonstrate a healthy
baseline. Introduce one mutation,
require the intended drift failure and named affected page, restore the fixture,
and require recovery. A generic parser crash or unrelated stale file is not the
intended rejection. New-source and passive-neighbor cases distinguish discovery
from a hard-coded expected count. Keep the check read-only for published pages.
Record the checked revision,
command, exit status, affected reader page, and recovery result. Raw logs and
source snapshots are not completion requirements; keep functional fixtures.
The existing configuration mutation suite creates a temporary tree, copies
inputs, and starts generator/publisher child processes; it also queries Git.
It is not a no-write check. Inspect its current scope and dependencies before
selecting it, and do not apply its results to untested error/event/store families.

### Select configuration probes by extraction boundary

Run these from the repository root with the locked Node dependencies installed.
The commands create and remove isolated temporary source trees; they do not
exercise a cluster. A focused prefix still performs shared baseline preparation,
so it is not a single cheap parser invocation.
The shared runtime-semantic preflight imports local workspace packages, including
`@kubeclaw/worker-core` and `@kubeclaw/plugin-foundation`; installing external
parser packages alone is insufficient. Restore the repository's workspace
installation before retrying an unresolved-package error. The schema-only option
runs that runtime preflight first, then the schema assertions; it does not skip
runtime imports and does not run the mutation cases listed below.

| Changed boundary | Focused command | What the result does not prove |
| --- | --- | --- |
| Recursive schema validation semantics | `node scripts/check-configuration-drift-mutations.mjs --schema-semantics-only` | No generator publication or live consumer execution. |
| Environment reads inside shell-launched Node | `node scripts/check-configuration-drift-mutations.mjs --case-prefix=embedded-node-heredoc:` | Current cases cover discovery by addition, not change or removal. |
| Environment reads inside inline Node (`node -e`) | `node scripts/check-configuration-drift-mutations.mjs --case-prefix=inline-node-environment:` | Current cases cover addition only; this acquisition path is separate from a heredoc. |
| Python reads inside a shell heredoc | `node scripts/check-configuration-drift-mutations.mjs --case-prefix=embedded-python-heredoc:` | Current cases cover addition only; Node extraction is a different path. |
| JavaScript embedded in a YAML payload | `node scripts/check-configuration-drift-mutations.mjs --case-prefix=embedded-yaml-javascript:` | Current cases cover addition only, not every ConfigMap consumer. |
| Deployment payload authority | `node scripts/check-configuration-drift-mutations.mjs --case-prefix=embedded-payload-authority:` | Payload add/change/remove is not Kubernetes API-schema field coverage. |

Require the selected case names in the output, followed by baseline recovery.
Do not treat a successful exit with no selected cases as coverage. A missing
package, parser crash, or unrelated stale baseline is a failed qualification,
not detected documentation drift. Restore the locked toolchain or the affected
baseline before retrying. For an API-field change, also inspect the API authority,
exact field binding and consumer; a checksum rejection alone cannot establish
that the documented field meaning is correct.

### Recover a source-bound SDK compiler check

`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED` with `root compiler custody` identifies
an unqualified documentation tool, not an undocumented product field. Stop before
counting the selected mutation as detected drift. Compare the named SDK generator
against the version bound in `scripts/docs-api-documentation-role-custody.mjs`.
Separate rendering or explanatory-text changes from compiler acquisition,
caller-selected root flow, imports, source discovery and output destinations.

For a rendering-only change, renew only the affected source, owner, selector and
reachable-operation bindings after inspecting that diff. Keep exact factory and
consumer checks, compiler package membership, root restrictions and caller limits
unchanged. Verify that altered compiler imports, roots and added output operations
are still rejected; then run the affected SDK tests and retry the owning inventory
baseline. Do not grant a compiler new execution authority or refresh unrelated
recipes to make a focused configuration probe run. A healthy tool baseline is
only a prerequisite: the selected add/change/remove probes must still demonstrate
stale reader output and recovery before they count as drift coverage.

### Requalify an intentionally rejected example

`API_PRODUCT_REJECTED_PROFILE_CHART_DRIFT` means that the chart bound to an
intentional rejection changed. It is not proof of detected documentation drift
and not permission to suppress a failed example render. Read the named entry in
`scripts/docs-api-rejected-output-profiles.json`, compare changed chart sources,
and inspect the exact rejection guard and selected input before refreshing its
source digests. Preserve input bindings unless the input itself was reviewed.

For `examples/buster-values.yaml`, the illustration selects `agentRole: buster`
but supplies no `extraContainers`; the chart defaults that list to empty. The
unchanged guard requires exactly one `buster-v2-runtime` entry for this role.
Run the authentic invocation from the registry:

```bash
helm template agent-buster charts/kubeclaw --namespace kubeclaw --values examples/buster-values.yaml
node --test --test-name-pattern='reviewed illustrative rejection' scripts/tests/api-reference.test.mjs
```

The first command must fail with exit 1, no manifest output, and the named
missing-runtime-container diagnostic. Its template line number may move when
unrelated earlier template code changes; compare the guard, not just the line
number. The second command checks rejection, changed input, changed diagnostic,
and unexpected success against a synthetic chart; it does not validate this
product profile or any live cluster. After source review and the authentic
render, update only the reviewed chart digests and exact observed diagnostic,
then rerun the owning inventory generator. Discovery separately checks the
source-bound derived input and an uninstrumented render; do not update those
bindings just to bypass a failure.

Stop before deployment: this illustration is still incomplete. Follow the
[configuration selection procedure](../use/install.md#select-configuration)
to prepare a complete runtime container, registry transport and credentials,
and require successful offline rendering of that selected configuration. A
continued rejection, a newly successful illustration, or a different error
requires diagnosis before changing its recorded classification. Requalifying
this rejection neither certifies valid profiles nor supplies a runtime release
receipt or a live deployment result.

Discovery must also render genuinely new output branches. The Archviewer
`networkPolicyProvider` enum has separate `cilium` and `kubernetes` profiles:
the default exercises `CiliumNetworkPolicy`, while the explicit Kubernetes
profile exercises `networking.k8s.io/v1 NetworkPolicy`. Boolean toggles cannot
select an enum branch. `API_PRODUCT_HELM_BRANCH_UNDISCOVERED` remains a failed
baseline until the named branch has an appropriate constructor profile; do not
disable branch witnesses or count that failure as a mutation PASS. These are
offline output profiles, not proof that either policy is enforced by a cluster.

### Recover a deployment adapter mismatch before Helm regeneration

`npm run docs:inventory:local-helm` first discovers a candidate configuration
inventory. That discovery also checks deployment API producer recipes. An
`API_PRODUCT_ADAPTER_RECIPE_DRIFT` for `scripts/deploy.sh` can therefore stop the
command before it writes the Helm authority registry. This is a failed baseline,
not a successful Helm-field drift probe.

Read the structured operation diff and follow changed helper calls. The current
bundle reader, `scripts/bundle-values-field.mjs`, parses YAML, selects the overlay
before the base for the requested key, skips null/empty values, and rejects
non-string selected values. `scripts/bundle-override-values.mjs` serializes the
bundle mapping instead of interpolating YAML fragments; quotes and newlines must
remain data, not new YAML documents. Check these boundaries with the existing
local tests:

```bash
node --test scripts/tests/deploy-bundle-values-field.test.mjs scripts/tests/deploy-bundle-override-values.test.mjs
```

These checks do not qualify the API adapter recipe or the Helm inventory. Also
inspect `scripts/buster-resource-overlay.mjs` if the changed call graph reaches
it: its resource-only `--set-json` argument depends on exactly one selected
`buster-v2-runtime` container and validates both resource maps. Do not substitute
an image, environment, or credential overlay for that resource selection.

For `deploy_agent`, this resource path runs only for the `buster` role with a
private values file. If `busterRuntimeResources` is absent, the helper emits
nothing and no resource override is appended. When present, both `requests` and
`limits` require CPU and memory strings; only optional `ephemeral-storage` is
also accepted. The helper selects `extraContainers` from the private overlay
when supplied, otherwise from the base, and requires exactly one container named
`buster-v2-runtime`. It emits only that container index's `.resources` assignment,
not a replacement container list. The caller appends base values, private values,
and then the resource `--set-json` argument before the selected-role render.
Invalid resource data or a missing/duplicate runtime container stops before that
render and removes an already-created temporary bundle override. Diagnose the
selected values and container list; do not retry by copying the release's full
container specification into the overlay. This source-level check is not a
successful Helm render or cluster deployment.

Reconcile the actual producer and helper behavior with the API adapter's reviewed
recipe and source bindings before updating them. Do not refresh fingerprints or
disable recipe checks to unblock Helm generation. Then rerun the owning Helm
generator, inspect its diff, run `npm run docs:inventory:local-helm:check`, and
repeat only the configuration probe that needed this baseline. Until those
steps pass, keep the corresponding Add/Change/Remove result unverified.

If candidate discovery reports `CONFIG_YAML_API_CONTRACT_GAP`, inspect the exact
API kind and field named in the error before changing a Helm pin. For example,
AppProject `spec.orphanedResources.warn` is a warning switch, not permission to
prune resources. In the pinned Argo CD receiver, explicit `true` enables a warning
only when eligible orphaned resources remain; `false`, omitted and null do not.
A present `orphanedResources` object still enables discovery without warnings.
Removing that parent disables this discovery path. Managed resources, project
permissions, other Applications and exclusions still filter the result; discovery
errors are not successful warnings. See the [pinned warning receiver](https://github.com/argoproj/argo-cd/blob/e258ee23c3e52266d407572f4bcdfe7d9ed36cb5/controller/appcontroller.go#L580-L688)
and [Boolean pointer contract](https://github.com/argoproj/argo-cd/blob/e258ee23c3e52266d407572f4bcdfe7d9ed36cb5/pkg/apis/application/v1alpha1/types.go#L2805-L2823).
Bind the exact field to that receiving meaning rather than a generic Boolean
fallback. A repaired source binding still needs the candidate generator and
its affected drift probe to pass; it does not establish live controller behavior.

For Application `spec.syncPolicy.retry`, separate timing from execution timeouts
and retry authority. Production Applications here request limit 3, base `10s`,
factor 2 and cap `1m`. The pinned scheduler computes base times factor to the
retry-count power, capped only when maxDuration is positive. Scheduler defaults
are 5 seconds, factor 2 and a 3-minute cap. Empty duration strings use those
defaults; integer strings mean seconds, and unit-bearing strings use Go duration
parsing. Invalid nonempty durations become `OperationError`, not a successful
retry. Zero or negative caps disable the cap; nonpositive bases or factors can
produce immediately due waits. Schema-valid input is not necessarily safe.

The typed limit is separate: zero permits no retry, negative permits unlimited
retries, and termination prevents this retry branch. Omission in a fresh typed
strategy is zero, not a promise about defaults supplied by every sync initiator.
Inspect the operation and external-effect uncertainty before changing policy;
do not force repeated syncs to bypass a scheduling error. Correct the exact
field, rerun its generator and affected probe, and keep live execution unverified
until tested in the target environment. See the
[pinned retry receiver](https://github.com/argoproj/argo-cd/blob/e258ee23c3e52266d407572f4bcdfe7d9ed36cb5/pkg/apis/application/v1alpha1/types.go#L1543-L1605),
[default constants](https://github.com/argoproj/argo-cd/blob/e258ee23c3e52266d407572f4bcdfe7d9ed36cb5/pkg/apis/application/v1alpha1/application_defaults.go#L5-L8)
and [controller eligibility/error branch](https://github.com/argoproj/argo-cd/blob/e258ee23c3e52266d407572f4bcdfe7d9ed36cb5/controller/appcontroller.go#L1619-L1639).

Validate examples against their actual contract, not merely JSON syntax.
Record the schema/version, consumer, setup, expected output, failure/cleanup,
and any external effects. Execute only in the documented isolated or authorized
environment. The publication checker has selected plugin and resume-signal
schema examples; that does not validate every operator or infrastructure command.
A compiled example is not evidence of activation, recovery, or a live service.

Ask independent readers to use the page without chat history or undocumented
maintainer hints. Give a concrete Find, Understand, and Act task chosen before
they read it. For the default example: find the field, explain which consumer
wins, identify restart/new-run impact, choose the valid override and safe
rejection response. Retain missing steps as defects. One independent topic review
can assess source accuracy, reader usability, and
language/navigation quality together. It must report the actual task outcomes
and unresolved defects; the author cannot replace it by rereading the same draft.

## Rename, retire, and recover

Before removing a page or source identity, account for every still-valid claim,
consumer, generated row, example, incoming link, owner, and historical route.
Move required information into its canonical successor and verify parity before
deleting the old authority. Use the [route registry](../reference/documentation-route-registry.json)
and [governance](../reference/documentation-governance.md) for a genuine public
rename, not for a fabricated former URL. Preserve fragment targets or explicitly
migrate them. The registry's structural validation does not prove server or
static redirects; test real old/new requests and anchors in the selected renderer.
The repository's transition tooling has its own manifests, source snapshots,
child checks and effects. Read that contract before a destructive transition;
an unrelated prose change does not require or permit a retirement run.

| Failure | Stop and retain | Safe next action |
| --- | --- | --- |
| Source revision differs from current evidence | Source bytes, selected revision, first diagnostic | Complete the handbook's source-revision procedure; do not weaken a pin or cite an old commit as current. |
| New identity lacks semantics or owner | The discovered source and unmapped identity | Assign its real consumer/owner and explanation; keep its missing coverage explicit. |
| Generator failed after writing | Exit status, first error, owned partial diff | Repair prerequisites/source, rerun only the responsible generator, and inspect unrelated work remains intact. |
| Helm authority reports `runtime consumer line changed` | Field identity, pinned source-line hash, consumer and enclosing branch | Compare the actual consumer and its branch with the recorded contract. For a pure relocation, retain the unchanged hash and semantics and update the exact location in the authority registry, its generator and the Boolean-semantics check together. If bytes or behavior changed, review the field meaning before regenerating. Never replace the expected hash with the reported actual hash just to pass. |
| Helper custody reports missing chart metadata during a synthetic probe | Source identity and the first `Chart.yaml` diagnostic | Use a fixture in a real, supported chart namespace with its metadata and template directory present. A fabricated `charts/example/` identity cannot establish helper custody; do not disable the namespace check. |
| Node harness qualification reports `DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED` | Exact source, actual package caller, changed declarations and terminal operations | Read the harness diff and imported receiver before renewing its finite recipe in `scripts/docs-api-documentation-role-custody.mjs`. A temporary reader fixture may assert a manifest without publishing it; retain the real publisher as a separate producer. Renew only the reviewed entry, keep its callers, export prohibition and closure bounds, then run its owning tests and `node --test scripts/tests/api-output-node-entry-custody.test.mjs`. A new public caller, export, external write or child changes the qualification; do not treat it as a harmless hash refresh. |
| Check reports stale output | Exact path, expected owning generator, input revision | Repair input and regenerate that output. Never hand-edit it merely to satisfy equality. |
| Reader cannot finish a documented step | Task, failed step, missing prerequisite or unsafe ambiguity | Correct the guide and repeat the affected task with an independent reader. |
| Rename loses route/fragment or required meaning | Old link and successor mapping, parity defect | Restore the needed authority or fix successor/redirect before removal. |
| Local checks pass but live route is unavailable | Actual local results and the missing environment/prerequisite | Keep live behavior unverified; do not claim deployment, recovery, or retirement complete. |

Finish by reconciling source, authored explanation, generated facts, incoming
navigation, revision links, and the actual check/reader outcomes. Keep unresolved
families and live limitations visible. Publication is ready only for the scope
actually demonstrated; a complete-looking table is not proof of completeness.
