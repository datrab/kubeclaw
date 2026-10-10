# Configuration Precedence and Effective Values

Status: current cross-component reference
Audience: operator, pipeline author, maintainer
Owner: platform operations
Evidence: skills/common/plugins/openclaw-agent-observer/src/index.ts; skills/common/plugins/openclaw-agent-observer/src/observer-support.ts; skills/common/plugins/openclaw-agent-observer/src/config.ts; skills/common/plugin-runtime/foundation/config/platform.ts; skills/nova/core/execution/engine-runtime.ts; skills/nova/core/test-gates/resolver.ts; tests/verification/e2e/support/platform-config.ts; tests/verification/e2e/support/config-profiles/standard.json; tests/verification/e2e/real-run-workspace.mjs; charts/kubeclaw/values.yaml; charts/kubeclaw/templates/deployment.yaml; charts/kubeclaw/templates/configmap-swarm-config.yaml; charts/kubeclaw/templates/_helpers.tpl; charts/prism/values.schema.json; charts/prism/ci-values.yaml; charts/prism/templates/_product-decisions.tpl; charts/prism/templates/workloads.yaml; charts/gitops/templates/applications.yaml
Applies to: current pipeline, project, chart, host, and Prism configuration
Last verified: 2026-10-09 at source revision `10e95ee97567cd42357e95d2a443aee4732b359c`
Helm sections verified: 2026-10-10 at source revision `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`; other families retain the evidence revisions below.
Compact profile section verified: 2026-10-10 at source revision `fe426bd75db277b04cf405cc2057063b75fa0a1d`.

## The governing rule

Precedence exists only inside a consumer that implements a merge. Two files
that configure different consumers do not override each other. For example,
Helm values can render a Nova pod environment, but they do not merge into the
`pipeline-platform.v2` JSON passed to Nova.

Use this sequence to find an effective value:

1. Identify the process or registration that consumes the field.
2. Identify the one loaded artifact or implemented merge for that consumer.
3. Apply only the documented defaults and override order below.
4. Record the loaded value and check any later conversion at its actual
   consumer. A schema-valid number can differ from the timer delay it produces.

## Precedence by family

| Family | Resolution order and override rules | Important boundary |
| --- | --- | --- |
| Pipeline platform | Schema-required value → optional consumer default (`effectLockTtlMs` only) | One `--platform` file; no second file or project merge. Relative paths resolve from its canonical directory. `shutdownTimeoutMs` has no schema maximum, but Node timer delays above 2,147,483,647 ms become 1 ms. Check the [timer range and stop condition](configuration-change-impact.md#timer-range-and-stop-condition). |
| Explicit pipeline graph | Exact `stage.config`/`stage.input` values → defaults or derived values implemented by that stage | Stage validation does not insert schema defaults. `pipeline-definition.v2` fields do not inherit from `nova-project.v2`; the compiler materializes a new graph. |
| Nova project | Compiler constants → optional project fields → compiler-derived repository/source bindings | Array order does not control module order. The topological graph and ID tie-break do. |
| `.swarm/pipeline.json` test nodes | Select suite templates and apply exclusions/overrides → add distinct suite and direct nodes → merge matrix configuration → resolve provider schema defaults and validate policy limits | Node-ID conflicts reject; direct nodes and suite additions do not override selected nodes. Scope concurrency may narrow a suite ceiling, never widen it. Provider plan output is resolved data, not another authoring layer. |
| Coupled `.swarm` files | Committed generation selected by `.scaffold-publication/current.json` | When publication metadata exists, loose `progress.json` and `pipeline.json` must match it. No fallback on damage. |
| Helm | Chart defaults → supplied values files/CLI values in Helm's order → rendered manifest | The running process sees only the rendered result. GitOps can reapply its declared source after manual cluster edits. |
| Kubernetes environment | Literal rendered value or selected ConfigMap/Secret key → fallback under the exact process loader condition | An empty value selects a fallback for `||` and shell `:-`, but stays explicit for `??` and shell `-`. A pod does not reload most environment values. Secret changes require rollout unless a component explicitly watches files. |
| Compact swarm profile expander | Standard profile → supplied webhook and context fields → validated recursive `overrides` → template substitution using the original `repo_root` input | Overrides can replace existing context fields. Placeholder input can differ from the effective root. The caller can make further changes after expansion; see the bounded flow below. This is not the pipeline-platform authority. |
| Prism | Prism Helm values → rendered environment/files → defaults under each loader's empty-value rule → root-owned native pool policy for aggregate capacity | Environment cannot override host cgroup capacity. SPIFFE mode changes which credential variables are authoritative. |
| Plugin configuration | Exact supplied stage/observer/adapter config → that consumer's implemented fallback; test-provider authored values → schema-default resolution → provider fallback | The registry validates stages, observers, and adapters without inserting defaults. Its test-provider resolver clones values and inserts schema defaults. Grants remain separate and cannot be created by plugin config. |

An arrow shows the order in which that consumer resolves its inputs. A later
step replaces an earlier value only where the named merge or override permits
it. Defaults and fallbacks apply under each consumer's own missing- or
empty-value conditions; they are not a universal higher-priority input.

### Test-node composition and configuration

Within a suite selection, `suites.<instance>.overrides.<node>` changes an
existing template node. Its `uses` remains the template's provider contract.
Configuration objects merge recursively; arrays and scalar values replace
the corresponding earlier value. Evidence outcome settings merge separately.

Suite `add` and direct scope `tests` or `fixtures` compose distinct node IDs.
A suite addition cannot reuse a template ID, even if that template node was
excluded. A direct declaration cannot reuse an already selected node ID.
Either collision fails with `TEST_PLAN_NODE_DUPLICATE`; neither declaration
wins. Remove an unintended duplicate or deliberately change the selection.
Do not rely on declaration order to choose a winner.

Matrix values then merge into each selected node's configuration. The provider
resolver validates a clone and inserts schema defaults only for absent values.
Policy defaults and maxima govern separate execution settings. Requests above
the applicable timeout, limit, or concurrency maximum reject; the resolver
does not reduce them to that maximum. The minimum requested concurrency across
selected suites is a separate composition rule. A direct scope limit may
lower that suite ceiling but cannot raise it.

Source: [suite override merge](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L236-L243),
[selected nodes and suite-add collision](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L370-L380),
[shared duplicate-ID guard](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L328-L331),
and [direct declarations](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L384-L389).
See also [matrix merge and timeout bound](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L546-L566),
[provider configuration resolution](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/common/plugin-runtime/foundation/registry/configuration.ts#L102-L121),
[clone and schema defaults](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/common/plugin-runtime/foundation/registry/schema.ts#L86-L110),
[execution limit bounds](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L427-L434),
[suite and scope concurrency](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L333-L351),
and [policy concurrency bound](https://github.com/datrab/kubeclaw/blob/d57ac3568d29ae757173d15499ce48549c22eb4f/skills/nova/core/test-gates/resolver.ts#L696-L704).

## Compact profile inputs and overrides

The compact expander converts the `standard` profile into a configuration
object. It has its own input checks and merge. It does not merge into the
`pipeline-platform.v2` file used by the Nova platform loader.

The accepted top-level fields are `_doc`, `profile`, `features`, `tuning`,
`overrides`, `discord_webhook_url`, `project`, `repo_root`, `paths`, and `run_id`.
Before expansion, the input must select `profile: "standard"`. The `features`
object must contain exactly `observability`, `buster`, and `discord_alerts`,
each set to `true`. The `tuning` object must contain `safety_margins`,
`retention`, `alerts`, `logs`, `checks`, and `determinism`, with the exact
values shown below. These objects select the supported profile shape; they
are not arbitrary feature switches. An unsupported profile, extra top-level
key, incomplete feature/tuning object, or mismatched fixed value rejects.
`overrides`, when supplied, must be an object, not an array or `null`.
A supplied `discord_webhook_url` must be a string.

The expander then performs these operations:

1. Clone the standard profile.
2. Insert a supplied `discord_webhook_url`, then supplied `project`,
   `repo_root`, `paths`, and `run_id` context fields.
3. Validate every override target against that resulting object. Each target
   key must already exist. A nested object override requires an existing
   object at that path, and each nested target key must also exist.
4. Merge validated object overrides recursively. Replace each other supplied
   value, including an array or `null`, at its existing target.
5. Expand placeholders in strings, including strings inside arrays and maps.
   The placeholder context contains only `repo_root` from the original input.

An override can therefore replace a context field inserted in step 2. If that
field is absent from both the profile and the supplied context, the override
rejects. For example, `overrides.paths.example` requires `paths.example` to
exist before override validation. The target check does not validate the type
or bounds of every replacement value. Acceptance by this helper alone does
not prove that a downstream consumer will accept the configuration.

This complete input illustrates two different repository roots. Both paths
are synthetic strings; the expander does not open either repository.

```json
{
  "profile": "standard",
  "features": { "observability": true, "buster": true, "discord_alerts": true },
  "tuning": {
    "safety_margins": "high", "retention": "high", "alerts": "rich",
    "logs": "verbose", "checks": "strict", "determinism": "strict"
  },
  "project": "raw-project",
  "repo_root": "/raw-repository",
  "paths": { "example": "/raw-path" },
  "run_id": "raw-run",
  "overrides": {
    "project": "override-project",
    "repo_root": "/override-repository",
    "paths": { "example": "${repo_root}/example" },
    "run_id": "override-run"
  }
}
```

The checked expander result has `project: "override-project"`,
`repo_root: "/override-repository"`, and `run_id: "override-run"`.
However, `paths.example` becomes `/raw-repository/example`: substitution
reads the original root, not the overridden effective root. A referenced
placeholder rejects if its original context value is missing, is not a string,
or contains only whitespace. The diagnostic mentions `REPO_ROOT`, but this
expansion function does not read that environment variable.

Check the caller before treating this output as final. The real end-to-end run
builder supplies a worktree root and run ID before expansion. After expansion,
it applies its own normalization, assigns the run ID again, selects a webhook
from its environment or configuration, and applies scenario changes. Thus an
expander override of `run_id` does not control that builder's final run ID.
Inputs without compact authority fields (`profile`, `features`, `tuning`, or
`overrides`) pass through the expander unchanged; the helper's compact checks
do not validate that other input form.

> **Source evidence — compact profile expansion**
>
> **Claim:** The expander inserts supplied context before validating and merging overrides. It substitutes placeholders with the original root input. Caller changes can follow expansion.
>
> **Implementation:**
>
> - [`expandSwarmConfig` input checks](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/platform-config.ts#L163-L183).
> - [context, override, and substitution order](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/platform-config.ts#L185-L199).
> - [`assertOverrideTargets` and recursive merge](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/platform-config.ts#L104-L128).
> - [placeholder input guard and traversal](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/platform-config.ts#L131-L149).
> - [run-builder supplied context](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/real-run-workspace.mjs#L1500-L1520).
> - [later run-builder changes](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/real-run-workspace.mjs#L1533-L1537).
>
> **Contract or setting:**
>
> - [supported input fields and fixed feature/tuning values](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/platform-config.ts#L19-L36).
> - [known-path example defaults](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/tests/verification/e2e/support/config-profiles/standard.json#L46-L51).
>
> **Test evidence:** On 2026-10-10, Node.js `v24.21.0` ran 17 isolated assertions against the pinned expander. All passed. Checks covered supplied-context and webhook overrides, raw-root substitution, unknown and absent targets, object-over-scalar rejection, array/null replacement, nested-map preservation, and empty overrides. They also covered missing or whitespace-only placeholder input, unsupported profiles, fixed feature/tuning checks, extra top-level keys, invalid override shape, and noncompact pass-through. The repository-root example above produced the stated values.
>
> **Revision:** `fe426bd75db277b04cf405cc2057063b75fa0a1d`
>
> **Limit:** These checks execute the expander, not the complete run builder or a deployed consumer. Caller adjustments were checked from source. Expansion does not prove valid repositories, credentials, runtime paths, or downstream behavior.

## Helm collection precedence

A map is a set of named entries, such as `nodeSelector`. An array is an ordered
list, such as `extraEnv`. A scalar is one value, such as `gateway.port`. These
types have different merge rules. For the ordered values files checked with
Helm 3.22.0, Helm reads chart defaults first and applies `-f` files from left to
right. A later scalar replaces the earlier scalar. A later array replaces the
whole earlier array; it does not append entries or merge entries by `name`.
Helm merges maps recursively: later entries replace matching entries, but
earlier entries remain when the later map does not supply their keys.

Therefore, a later `{}` supplies no keys and does not clear an earlier map.
A later `[]` replaces an earlier array with zero entries. In the checked
KubeClaw `nodeSelector` case, a later YAML `null` removes the earlier mapping
during value preparation. The template then omits `spec.template.spec.nodeSelector`.
This is a removal request to Helm, not a `null` value delivered to a process.
Do not transfer this result to a field whose schema requires the mapping or
rejects the resulting absent or empty value.

### Check an ordered overlay without a cluster

Start in the repository root at the stated source revision. Use Helm 3.22.0
and a new local directory for the three example files and rendered output.
These values contain synthetic environment and scheduling entries. They are
for a local render; they are not a deployment profile. Helm needs the chart
files, but this check needs no Kubernetes credentials or existing Secret.

Create `base.yaml` in that directory:

```yaml
extraEnv:
  - name: HELM_PRECEDENCE_EXAMPLE
    value: base
nodeSelector:
  pool: base
gateway:
  port: 19000
  resources:
    requests:
      cpu: 333m
      memory: 701Mi
```

Create `empty.yaml`:

```yaml
extraEnv: []
nodeSelector: {}
```

Create `remove.yaml`:

```yaml
extraEnv: []
nodeSelector: null
```

Use the files' paths in place of `example-dir`:

```sh
helm template precedence-example charts/kubeclaw --namespace default -f example-dir/base.yaml > example-dir/base-render.yaml
helm template precedence-example charts/kubeclaw --namespace default -f example-dir/base.yaml -f example-dir/empty.yaml > example-dir/empty-render.yaml
helm template precedence-example charts/kubeclaw --namespace default -f example-dir/base.yaml -f example-dir/remove.yaml > example-dir/remove-render.yaml
```

Inspect the `agent-nova` Deployment's pod template and its `kubeclaw` container.
The first render contains `HELM_PRECEDENCE_EXAMPLE=base` and `nodeSelector.pool=base`.
The second removes that environment entry but retains `nodeSelector.pool=base`.
The third removes that environment entry and the complete `nodeSelector` block.
It does not remove the chart's other environment entries. All three commands
exited zero in the local check. Reversing the first two files restores the base
environment entry because the populated array is then last.

A further checked overlay replaced `pool` with `later`, added `zone: selected`,
and replaced only `gateway.resources.requests.cpu` with `444m`. The rendered
map contained both selector keys, and memory remained `701Mi`. Replacing
`extraEnv` with one different entry removed the earlier entry completely.
Two repeated `--set gateway.port=19002` and `--set gateway.port=19003` options
after the files selected port `19003`. This evidence covers ordered files and
repeated options of the same kind. It does not establish an ordering rule for
every combination of different CLI option kinds or upgrade reuse options.

Stop if Helm exits nonzero. Inspect its schema or template error before changing
an overlay. A zero exit proves a local render only. Retain the input order,
Helm version, source revision, output, and error stream. Remove the synthetic
local files after inspection when you no longer need this evidence.

### Validate the complete effective collection

Helm validates merged values against the chart schema before it can produce a
successful render. A valid item does not prove that its containing collection
is valid. For Prism:

| Field | Effective-value requirement | Checked failure |
| --- | --- | --- |
| `imagePullSecrets` | At least one item; each item has a nonempty `name` and no extra properties. | An explicit `[]` fails the array minimum. |
| `control.productDecisions.operators` | Unique strings, at most 100 items; each string has 1–512 characters and no surrounding whitespace. When decisions are enabled, at least one operator is required. | Duplicate items, 101 items, and an enabled empty list fail schema validation. |
| `images.control`, `images.studio`, `images.worker`, `images.ingestion` | Each image requires a repository, immutable digest, and `pullPolicy` of `IfNotPresent` or `Never`. | `Always` and an explicit empty `pullPolicy` fail for each of the four images. |

Enabled product decisions also require their issuer, HTTPS origin/controller
settings, credential references, and authenticated Tailscale ingress. The
operator list alone does not enable a valid authority. For example, this
render ends with a schema error, before Kubernetes can choose an image policy:

```sh
helm template precedence-example charts/prism --namespace default -f charts/prism/ci-values.yaml --set-string images.control.pullPolicy=
```

The CI file supplies synthetic image digests and a synthetic native host binding
so that the unchanged baseline can render. It is not evidence of a real image,
Secret, prepared host, or available worker. The baseline exited zero; the
explicit empty policy exited one. Do not bypass schema validation to treat
the rejected value as a supported configuration.

The GitOps chart also has collection and scalar template guards. Empty
`groups` fails with `release groups are required`. Its `revision` must contain
exactly 40 lowercase hexadecimal characters; `main` fails with `revision must
be a complete Git commit`. A local render with a synthetic complete revision,
one group, and one destination succeeded. That render proves accepted input
shape and the selected Application fields, not that the commit exists in Git
or that Argo CD has reconciled it.

### Trace the render to the actual receiver

Merge is only the first decision. A template can apply another fallback.
For KubeClaw, an empty `gateway.url` renders a local URL using `gateway.port`;
it does not disable the gateway destination. Empty `swarmConfigJson`,
`semgrepConfigYaml`, and `eslintConfigMjs` select the checked-in chart files
for the rendered ConfigMap. They do not remove those policies. These results
were checked against the rendered URL and all three file payloads.

An existing-Secret setting selects a reference, not the credential's contents.
The checked `auth.existingSecret=precedence-synthetic` and
`auth.existingSecretKey=synthetic-key` rendered that name/key pair for
`OPENCLAW_GATEWAY_TOKEN` and rendered no generated Secret. Helm did not check
whether that Secret or key exists. Keep the pair in evidence and redact data.

A schema `default` annotation does not establish insertion into rendered or
runtime values. Check the chart's actual values, template fallback, rendered
field, and process loader separately. The complete boundary is authored values
→ Helm merge and validation → rendered manifest → Kubernetes admission and
resource reconciliation → process startup and readiness. A local render stops
before admission. See [Configuration change impact](configuration-change-impact.md#helm-render-and-runtime-impact)
for the effect of each rendered change.

> **Source evidence — Helm effective collections**
>
> **Claim:** Ordered overlays can clear a list without clearing a map; KubeClaw templates consume the resulting collections and apply field-specific fallbacks. Prism validates whole collections and image policies before rendering.
>
> **Implementation:**
>
> - [KubeClaw extra environment receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1393-L1395).
> - [scheduling receivers](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1655-L1662).
> - [nested resource receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1442-L1442).
> - [gateway URL fallback and token reference](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1296-L1299).
> - [Secret reference selection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/_helpers.tpl#L46-L62).
> - [ConfigMap file fallbacks](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/configmap-swarm-config.yaml#L10-L27).
>
> **Contract or setting:**
>
> - [KubeClaw collection defaults](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L518-L521).
> - [Prism image policy contract](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L5-L28).
> - [image reference bindings and pull-secret collection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L79-L109).
> - [operator collection limits](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L141-L150).
> - [enabled operator minimum](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L250-L258).
> - [enabled authority template guards](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/_product-decisions.tpl#L1-L13).
> - [GitOps revision and group guards](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/gitops/templates/applications.yaml#L1-L5).
> - [GitOps selected Application fields](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/gitops/templates/applications.yaml#L41-L51).
>
> **Test evidence:** On 2026-10-10, Helm `v3.22.0+g144ca65` rendered an isolated copy of the pinned charts. Twenty-four assertions passed: ten successful renders and fourteen expected schema or template failures. The [ordered-overlay example](#check-an-ordered-overlay-without-a-cluster), reversed file order, recursive map preservation, whole-array replacement, repeated scalar CLI precedence, synthetic Secret reference, and file/URL fallbacks were checked. Prism checks covered the CI baseline, eight empty/`Always` policy failures, empty pull secrets, duplicate operators, 101 operators, and enabled empty operators. GitOps checks covered empty groups, accepted complete-revision shape, and branch-revision rejection.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
>
> **Limit:** These checks prove the named local render results. They do not validate every field or schema combination, API admission, Secret availability, GitOps reconciliation, pod rollout, runtime load, readiness, or a live operation.

## Where defaults are applied

A schema `default` is an annotation. It becomes an effective value only when a
consumer inserts it or implements the same fallback itself. Stage, observer,
and adapter validation leaves omitted optional fields absent. The stage executor
passes `definition.config` unchanged, and adapter startup returns the validated
configuration unchanged. The test-provider resolver instead clones its input
and validates that clone with default insertion enabled.

The OpenClaw agent observer has its own merge. Registration configuration is
applied first, then service configuration, then hook configuration. A later
defined key wins. An `undefined` key is ignored, but `null` and an empty value
replace the earlier value. Each merged key that is not `undefined` then wins
over its environment variable. The field normalizer runs after that choice.
For example, an empty `redisHost` replaces a valid environment host and becomes
absent after trimming; it does not select the environment host again.
`redisTls` falls back to `false`. Required event and queue limits have no
fallback. See the [plugin field reference](plugin-configuration.md) and
[environment reader contracts](environment-variables.md) for each field's
bounds and failure rules.

For example, the human-approval schema advertises `timeoutMinutes: 60`. The
registry leaves an omitted timeout absent. The approval parser then applies
`config.timeoutMinutes ?? DEFAULT_APPROVAL_TIMEOUT_MINUTES`, whose constant is
60. An explicit valid integer wins. An empty string fails schema validation,
and zero fails the minimum of 1. A schema annotation therefore does not prove
that the registry applied this timeout.

Collections can also have effective defaults and conditions. The direct-command
provider uses `args: []`, `workingDirectory: "."`, and `environment: {}` when
those fields are absent. It then inserts `CI: "true"`. Empty arguments remain
empty; an empty environment map still produces the CI entry. `reports: []` is
valid only with `resultMode: "exit-code"`; `"junit-required"` requires a report.
The shipped common command-runner rejects any command environment payload, so
this provider needs a compatible executor before it can run through that
boundary. The [plugin configuration reference](plugin-configuration.md) records
these conditions beside the affected fields.

Environment defaults also depend on the exact operator. Buster's generated
runtime file uses `Number(process.env.BUSTER_V2_MAX_ACTIVE_JOBS || 2)`. Both an
absent value and an empty string select 2. The non-empty string `"0"` selects
numeric zero; it does not select the fallback. Do not replace this behavior
with an absent-only rule.

> **Source evidence — default application**
>
> **Claim:** Registration validation preserves authored values; test-provider resolution inserts schema defaults in a clone; individual consumers apply their own fallbacks and collection rules.
>
> **Implementation:**
>
> - [stage, observer, and adapter validation](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugin-runtime/foundation/registry/configuration.ts#L48-L81).
> - [test-provider resolution](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugin-runtime/foundation/registry/configuration.ts#L102-L121).
> - [validation and cloned default insertion](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugin-runtime/foundation/registry/schema.ts#L94-L113).
>
> [Stage configuration handoff](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/core/execution/stage-executor.ts#L70-L74); [adapter configuration handoff](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/core/execution/adapter-startup.ts#L50-L53); [approval timeout fallback](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/plugins/human-approval/src/approval.ts#L67-L80)
>
> [Command defaults and report-mode conditions](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/buster/plugins/direct-command/src/provider.js#L58-L84); [common command-runner environment rejection](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugins/command-runner/src/adapter.ts#L54-L59); [Buster empty-string fallback](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/docker/buster-runtime-entrypoint.sh#L178-L187)
>
> **Contract or setting:** [approval timeout type and range](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/plugins/human-approval/schemas/config.schema.json#L22-L29)
>
> **Test evidence:** [platform configuration contract checks](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L65) passed locally with Node 24.21.0. This contract check does not execute a deployed plugin.
>
> **Revision:** `10e95ee97567cd42357e95d2a443aee4732b359c`
>
> **Limit:** Source evidence establishes default selection and the executor incompatibility. It does not establish successful direct-command execution through the shipped common command-runner.

## Absence, empty, null, and false

These values are not interchangeable:

- Absent optional field: the named consumer may apply its default.
- Empty object: explicit object with no entries. It can mean “enable none,” but
  only if the containing schema permits it.
- Empty array: explicit zero selections. Some fields accept it
  (`activeAdapters`); others reject it (`installationRoots`).
- `null`: a value only where the schema explicitly admits it. Nova Blueprint
  deliverable selectors use `null` to state “not declared.” Helm can instead
  consume `null` as a removal request before schema validation, as in the
  bounded `nodeSelector` example above.
- `false`: explicit disablement. For example, `testAgentEnabled: false` does not
  disable provider execution.
- Empty string: often invalid, but a few chart values use it as an unconfigured
  placeholder that must become non-empty when a feature is enabled.

Do not use truthiness as a general precedence rule. Check the exact loader.

## Safe effective-value inspection

Use artifacts that the consumer already exposes. Do not print secret values.

| Consumer | Safe proof |
| --- | --- |
| Nova platform | Record the platform file digest, canonical path, schema check, resolved non-secret paths, registration IDs, provider IDs, and redacted configuration keys. The run snapshot records the effective provider/grant/adapter/observer authority. |
| Project compiler | Use `--compile` to a new file and record `definitionDigest`, `stageCount`, stage types, dependency edges, and non-secret configuration. Compilation has no runtime effects. |
| `.swarm` test authoring | Run scaffold `--check`/`--print`; resolve a plan in an isolated check; record `planDigest`, node IDs, provider digests, limits, coverage, and concurrency. |
| Helm | Run schema validation and render manifests. Inspect image digests, resource limits, volume paths, identity names, and Secret references, not Secret data. |
| Kubernetes | Compare workload generation/checksum and environment sources. Use the Secret name/key pair as evidence, never decoded contents. |
| Prism native | Inspect the policy digest, node identity, cgroup files, and readiness result. Do not treat Helm requests as actual host capacity. |

Redaction must preserve structure. Replace a secret value with `<redacted>` and
retain its source name/key. Hashing a low-entropy token is not safe redaction.

## Conflicts and common mistakes

- A stage agent name does not override the runtime-dispatch adapter target.
- Provider configuration does not grant the provider a capability.
- `activeAdapters` controls activation; an entry in `adapters` alone does not.
- A project's `maximumConcurrency`, a graph's `maxConcurrency`, a test plan's
  group limits, and a worker's capacity govern different schedulers.
- Editing a live ConfigMap does not change GitOps authority and may be reverted.
- Editing a materialized `.swarm/pipeline.json` without publishing its pair
  produces divergence, not a higher-precedence project value.
- Changing environment after a process captured its startup snapshot has no
  effect on that process.

> **Source evidence — observer configuration**
>
> **Claim:** The observer merges registration, service and hook inputs. Later null and empty values remain explicit. Each defined merged key wins over its environment fallback before normalization.
>
> **Implementation:**
>
> - [merge call and source order](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugins/openclaw-agent-observer/src/index.ts#L192-L200).
> - [defined-key merge](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugins/openclaw-agent-observer/src/observer-support.ts#L21-L29).
> - [key selection and normalization](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugins/openclaw-agent-observer/src/config.ts#L87-L111).
>
> **Contract or setting:** [inline host-plugin schema](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#L9-L32)
>
> **Test evidence:** Local checks exercised the actual merge and resolver with absent, explicit, null, empty, whitespace, invalid and out-of-range values. These checks used no live Redis connection.
>
> **Revision:** `10e95ee97567cd42357e95d2a443aee4732b359c`
>
> **Limit:** The schema advertises field types. The resolver and Redis transport apply additional runtime guards; a valid field alone does not prove a working observer connection.

> **Source evidence — implemented merges**
>
> **Claim:** Platform paths resolve from one canonical file, test scopes have an explicit template/project/policy resolution order, and compact profile overrides can change only known paths.
>
> **Implementation:**
>
> - [platform load and path base](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/common/plugin-runtime/foundation/config/platform.ts#L36-L69).
> - [suite expansion and lowest requested concurrency](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/core/test-gates/resolver.ts#L304-L353).
>
> [Suite overrides, direct nodes, and project concurrency](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/core/test-gates/resolver.ts#L354-L393); [known-path compact overrides](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/tests/verification/e2e/support/platform-config.ts#L98-L129)
>
> **Contract or setting:** [runtime records the effective authority subset](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/skills/nova/core/execution/engine-runtime.ts#L29-L42)
>
> **Test evidence:** [platform configuration contract checks](https://github.com/datrab/kubeclaw/blob/10e95ee97567cd42357e95d2a443aee4732b359c/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L65)
>
> **Revision:** `10e95ee97567cd42357e95d2a443aee4732b359c`
>
> **Limit:** This precedence map does not replace Helm's own multi-file ordering or an external GitOps controller's declared reconciliation policy.
