# Develop Buster Core

Status: implemented with environment-dependent integration checks
Audience: Buster engine, Nova adapter, and namespace-controller developer
Owner: buster
Evidence: contracts/pipeline-test-gate/v1; skills/nova/core/test-gates/resolver.ts; skills/buster/engine/test-gates; cmd/buster-namespace-controller
Evidence revision: `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`
Applies to: changes below the public provider and suite extension contracts
Last verified: source and contract inspection on 2026-09-19

## Use This Guide For Core Changes

Use the general [Buster extension guide](../buster.md) when an installed
provider, report adapter, or suite template is sufficient. Use this page when a
change alters plan meaning, remote wire data, admission, durable state,
execution authority, evidence rules, result authority, or namespace lifecycle.

**Decision:** Keep common extension work outside the engine.

**Reason:** A provider package can be versioned and reviewed without changing
the authority shared by every suite. Core changes have a larger compatibility,
recovery, and security surface.

## Component Map

| Change area | Primary owner | Other boundaries that must agree |
| --- | --- | --- |
| Suite and project resolution | `skills/nova/core/test-gates/resolver.ts` | Shared plan schema, registry snapshot, Buster runner |
| Source snapshot and signing | Nova source-snapshot and shared remote contract | Buster admission authorities and archive limits |
| Remote request or status | Shared remote contracts and both HTTP sides | Durable record migration, client retry behavior |
| Admission and job lifecycle | Buster remote-plan service/runtime | Store capacity, recovery, cancellation, readiness |
| Provider invocation | Buster runner, loader, Worker Core | SDK, sandbox, registry, role packages |
| Evidence or report | Runner and report-adapter runtime | Result schema, remote limits, Nova importer |
| Result authority | Shared remote contract and Buster service | Nova result-authority verification |
| Namespace lease | CRD and Go controller | Helm values, RBAC, admission fence, fixture capability |
| New host capability | Common contract and Buster production runtime | Operator policy, adapter, worker grants, role closure |

The table is a change-impact map, not a list of interchangeable files. A wire
field added on one side only is a compatibility defect. A new capability name
in a provider manifest without runtime policy and an implementation is not a
working extension.

## Change A Plan Field

1. State which decision the field changes and why configuration in an existing
   provider cannot express it.
2. Change the strict contract schema and TypeScript type together.
3. Define required/optional behavior, default, range, canonical form, and
   unknown-field behavior.
4. Add the value to canonical identity and digest calculation when it changes
   execution or evidence meaning.
5. Update Nova resolution and every validation that assumes a closed node.
6. Update Buster runner admission. Never accept a value Buster silently ignores.
7. Add positive, boundary, unknown-field, and digest-change vectors.
8. Update the suite reference and compatibility statement.

**Compatibility rule:** If an old executor would accept the plan but execute a
different meaning, introduce a new schema or contract version. Do not rely on a
new optional field that an old side ignores.

> [The resolver produces the canonical plan and digest](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/resolver.ts#L624-L754).
>
> [The runner revalidates the plan against its installed snapshot](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/runner.ts#L234-L265).

## Change The Remote Protocol

The job request binds job ID, idempotency key, plan, source snapshot, archive,
grants, limits, stage, and request digest. Status, result, and evidence are
separate resources. Preserve these properties:

- the same idempotency key and same content returns the same job;
- the same key with different content fails;
- admission verifies all identities before storing `accepted`;
- status never substitutes for result bytes;
- result and evidence are fetched by digest;
- cancellation cannot overwrite a terminal record; and
- recovery completes before readiness opens.

For a new wire version, add producer and consumer vectors first. Define how a
mixed deployment fails. Update request-size, response-size, archive, result,
evidence, and durable-store limits independently. One large `bodyLimit` is not
a safe replacement because each resource creates a different liability.

> [Remote request validation and receipt contracts](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/src/remote.ts) ·
> [Buster admission and guarded transition](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/remote-plan-service.ts)

## Change Execution or Result Rules

The runner is the authority between an immutable plan and a remote result. A
change must preserve dependency order, fixture lifetime, group and global
concurrency, attempt identity, package snapshot, grant limits, deadline,
cancellation, cleanup, result counts, ports, evidence, and report admission.

When adding a result field, decide all of these questions:

1. Which component creates it?
2. Is it an observed fact, an assertion, or a policy decision?
3. Is it included in attempt, node, result, and receipt digests?
4. Can it be absent for old jobs or recovered records?
5. What size and count limit applies?
6. Can a provider supply it, or must the runner calculate it?
7. How does Nova reject a contradictory or missing value?
8. What evidence lets an operator diagnose it?

Do not let a provider report pipeline success. Providers report one attempt.
The runner normalizes node results; Nova owns the final gate policy after it
verifies the remote result.

## Add A New Suite End To End

A suite needs no engine change when existing provider contracts can express it.
Use this sequence:

1. Add a versioned JSON file under `contracts/pipeline-test-gate/v1/suites`.
2. Use a globally unique `contractId` and the current template schema version.
3. Give every fixture and test a stable local name.
4. Select exact provider contract IDs. Do not name packages or source paths.
5. Set mode, retries, dependencies, port links, conditions, matrices, evidence
   choices, and concurrency groups explicitly where needed.
6. Keep project-specific commands, origins, image names, and credentials out of
   a shared template unless they are a deliberate product default.
7. Add the suite to the catalogue input used by Nova and test duplicate IDs.
8. Add resolver vectors for selection, exclusion, permitted override, matrix,
   link compatibility, retry safety, deterministic order, and stable digest.
9. Add a remote runner vector for success and one representative failure.
10. Document purpose, boundary, all fields and defaults, prerequisites,
    evidence, pass/fail/skip, diagnosis, customization, and verification.

Create a new version when changing existing consumer meaning. Editing the bytes
of `@1` changes the template digest and therefore new plan identities, but it
does not communicate semantic compatibility to a human or an older binary.

## Add A New Provider or Report Adapter

The [public extension guide](../buster.md#implement-a-test-provider) gives the
complete package sequence. A core developer must additionally verify:

- registry conflicts and immutable package digest;
- Buster role closure and production bundle presence;
- Worker profile and capability-grant compatibility;
- sandbox import from the attempt snapshot, not repository source;
- result, evidence, output, and cleanup validation in the runner;
- Nova resolver support for ports and matrix fields; and
- compatible remote execution with the production capability adapter.

A report adapter gets bytes and limits but no host authority. A new report
format needs exact adapter selection in the resolved plan. Discovery order must
not decide which parser handles evidence.

> [The public SDK separates provider execution and report parsing contracts](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/common/plugin-runtime/sdk/src/runtime.ts#L92-L158).
>
> [The Buster role fixes the packages and external authority families in the deployable bundle](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/packaging/runtime/roles/buster.json#L1-L60).

## Add A New Capability

A capability expands authority and is therefore the most expensive extension.
Complete all layers:

1. define the name, request, response, limits, errors, and cancellation contract;
2. add it to the permitted capability namespace and plugin schema;
3. implement an operator-configured production adapter;
4. add policy that decides which provider can receive which request;
5. bind it through the Worker grant and invocation context;
6. remove credentials and host handles from provider-visible data;
7. add timeout, cancellation, size, origin/path, and malformed-response tests;
8. include the implementation and its dependencies in the Buster role;
9. document configuration, secret source, readiness, audit, failure, and recovery;
10. run the live dependency check in a disposable environment.

Do not add direct filesystem, process, socket, Kubernetes, registry, or browser
access to a provider as a shortcut. That bypasses the single audited boundary.

## Change Namespace Lifecycle

Treat CRD schema, controller validation, reconciliation, RBAC, and admission
fence as one feature. When adding a spec field, decide immutability and include
it in the stored specification digest. When adding a resource, label it with
lease identity, verify ownership before update or delete, and add it to cleanup.

Status writes must compare lease UID, resource version, generation, deletion
state, and any operation-specific claim. Reconciliation must be idempotent. A
restart can repeat an observation, so creation and cleanup cannot depend on an
in-memory step counter.

Never weaken the namespace admission fence to make a test pass. If a new
controller action is required, narrow its identity, prefix, label, verb, and
resource form, then add a denial test for the worker identity.

## Error Design

Use a stable error code for a distinct operator action. Include the failing
identity and bounded context, but never tokens, credential values, full response
bodies, or arbitrary provider data. Preserve the causal boundary:

- declaration and graph errors belong to resolution;
- authentication, digest, request, and capacity errors belong to admission;
- package, grant, capability, timeout, and cleanup errors belong to attempts;
- count, evidence, report, output, and receipt errors belong to result validation;
- missing blobs and digest mismatches belong to import;
- ownership and stale-writer errors belong to namespace reconciliation.

Retry only when the operation is contractually safe. A generic transient label
cannot turn a stateful provider into a retry-safe provider.

## Required Checks

Run the smallest affected set first, then the connected boundary checks:

```text
npm run verify:test-gate:provider-registry
npm run verify:test-gate:suite-resolver
npm run verify:test-gate:plan-runner
npm run verify:test-gate:remote-plan
npm run verify:test-gate:junit-report-adapter
go test ./cmd/buster-namespace-controller/...
```

Run the provider-specific `verify:test-gate:*implementation` command for each
changed provider. Run TypeScript checks for Nova, Buster, common plugin runtime,
and the shared contract when their boundary changes. Render Helm with both
broker-disabled and broker-enabled values.

These local checks do not prove BuildKit, OCI registry, Kubernetes admission,
Tailscale, browser binaries, Trivy databases, SPIFFE proxying, cgroups, or
cross-pod restart behavior. Record those as separate live acceptance evidence.

## Review Checklist

- The change has one owner and a clear reason.
- Old and new version behavior is explicit.
- Every execution-changing field participates in identity.
- Admission fails before the runtime grants persistent authority.
- Durable intent precedes external effects.
- Cancellation reaches owned child work.
- Recovery is safe after every durable transition.
- Cleanup proves ownership before deletion.
- Evidence and reports remain bounded and immutable.
- Operator secrets never enter provider configuration or evidence.
- Negative and stale-writer tests accompany success tests.
- Canonical documentation and its drift check change with the code.
