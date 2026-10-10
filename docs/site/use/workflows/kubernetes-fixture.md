# Prepare and release a Kubernetes fixture

Status: implemented provider and capability; target-cluster validation required
Audience: operator, pipeline author
Owner: buster
Evidence: skills/buster/plugins/kubernetes-fixture/src/provider.js; skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts
Applies to: kubeclaw.kubernetes-fixture@1; package 1.0.0; configured Kubernetes fixture capability
Implementation revision: `28e4f1b6a2e736dc936b48847cf422dcc0a25da2`


The supported entry point is a resolved Buster fixture node. Its provider calls
the `kubernetes.fixture` capability to prepare the lease and later to release it.
The package does not provide a standalone prepare or release command.
[Preparation and its outputs](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/plugins/kubernetes-fixture/src/provider.js#L108-L133)
and [provider cleanup](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/plugins/kubernetes-fixture/src/provider.js#L134-L144)
define that route.

Start with an installed package, its resolved capability grant, and a configured
fixture runtime. The target cluster must have the lease CRD and controller. The
runtime's client identity must have `create`, `get`, and `delete` permission on
the configured lease resource in the controller namespace. Its namespace,
registry, Secret and storage restrictions must permit the selected fixture.
Use the [runtime capability settings](../../reference/buster-runtime-configuration.md)
and [broker configuration](../../understand/buster-namespace-controller.md#configure-and-change-the-broker)
to check these separate authorities. Preparation checks client authorization
before server dry-run or apply; a denied verb stops this attempt.
[Caller preflight](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L703-L709)
is distinct from the controller's subject allowlist.

## Choose fixture storage

Use a persistent volume claim (PVC) only when the fixture needs persistent data.
Before resolving the run, compare each claim in the checked manifest with the
configured fixture runtime's storage policy. Ask the platform owner to confirm
the selected StorageClass, provisioner and reclaim policy. Stop if the selected
class or its data-retention behavior is unknown.

- Select an explicit, nonempty `storageClassName` from `allowedStorageClasses`.
  Omit that field only when `allowDefaultStorageClass` permits the cluster's
  default class. An empty string is not the omitted-field route.
- Set `resources.requests.storage` to a positive whole-byte quantity within
  `maximumClaimBytes`. Keep the combined requested size within `maximumTotalBytes`.
  A standalone PVC counts once. Each StatefulSet claim template counts once per
  declared replica; omitted replicas count as one.
- Use filesystem volumes. An omitted `volumeMode` is permitted; an explicit
  value must be `Filesystem`. The runtime rejects `volumeName`, `selector`,
  `dataSource` and `dataSourceRef`, so this route cannot select an existing
  volume, clone a claim or restore a snapshot through those fields.
- Leave `metadata.namespace` out of the checked manifest. The fixture assigns
  its controlled namespace; an explicit namespace is rejected.

[Claim selection and replica counting](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L202-L222),
[per-claim policy checks](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L232-L254)
and [namespace and total-size checks](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L315-L330)
define these KubeClaw restrictions. See the
[runtime configuration reference](../../reference/buster-runtime-configuration.md)
for their configuration authority.

A passed manifest check proves that these requests meet the runtime policy. It
does not prove volume provisioning, binding, mounting or deletion on the target
cluster. During the run, retain the actual claim and volume identities, binding
state and workload observations. Before cleanup, confirm which data may be lost
and who owns any retained backing volume. If cleanup is uncertain, inspect those
same resources before retrying; do not infer data removal from lease deletion.
The controller's
[retention and cleanup boundary](../../understand/buster-namespace-controller.md#retention-decisions-and-cleanup)
explains which namespace deletion effects remain separate from storage policy.

## Prepare, observe and release

1. Follow the [Buster suite workflow](buster-suite.md#before-you-start)
   for the checked-out version, execution host, installed tools and platform
   binding. Its maintained example requires your real image and manifest-check
   command; its placeholders do not establish a runnable deployment.
2. Select one digest-pinned image, either through the `image` input or through
   fixture configuration. Supply one `checked-manifest` artifact with the
   declared media type, digest and file location. The provider rejects an image
   supplied by both routes. The runtime checks the manifest bytes and permitted
   workload, Service and storage facts before it requests the lease.
   [Provider input checks](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/plugins/kubernetes-fixture/src/provider.js#L18-L35)
   and [runtime manifest checks](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L650-L677)
   define these boundaries.
3. Resolve the plan before starting it, using the workflow's
   [resolution procedure](buster-suite.md#4-resolve-before-you-run).
   Check the selected fixture, linked artifact, namespace prefix, service ports,
   retention and capability grant. Stop on a resolver or policy rejection.
4. Use the workflow's [submit and observe procedure](buster-suite.md#5-submit-and-observe-in-production).
   Preserve the run, node and attempt identities. Successful preparation returns
   the `deployment` output with lease name, namespace, image and manifest digest,
   creation time, expiry and endpoint. Dedicated generated credentials, when
   requested, use a separate `demo-credentials` output. A returned endpoint is
   not evidence that a later network request succeeded.
   [Output construction](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/plugins/kubernetes-fixture/src/provider.js#L115-L128)
   defines the observations to retain.
   The basic lease wait checks phase `Ready` or `Rejected`; it does not compare
   the lease UID or generation. Read
   [each controller observation at its own level](../../understand/buster-namespace-controller.md#read-each-observation-at-its-own-level)
   when verifying ownership or dedicated credential provenance.
   [The basic wait loop](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L525-L540)
   is narrower than those proofs.
5. Inspect cleanup through the same run's result and audit. With retention mode
   `delete`, provider cleanup invokes release and requires `ok: true`. With
   `retain`, that cleanup method returns without requesting release; the lease's
   expiry and controller retention policy still bound its lifetime. Keep the
   lease identity and expiry when investigating retained resources. Namespace
   deletion does not prove that a backing volume was erased; its reclaim policy
   remains a separate storage boundary. Use the
   [retention and cleanup explanation](../../understand/buster-namespace-controller.md#retention-decisions-and-cleanup)
   before removing a lease or workload.

If apply returns an error, preparation has not entered its protected cleanup
block. The write result can be uncertain. Inspect the exact lease identity before
another attempt. If a later preparation step fails, its cleanup attempt can also
fail while the original preparation error is reported. Explicit release instead
propagates its deletion failure. Preserve the first error, run identities,
returned fixture details and cleanup result; use the
[failure and recovery guide](../../understand/buster-namespace-controller.md#diagnose-failures-and-resume-safely)
to establish retained state. A new attempt derives a new fixture identity and
does not prove that an earlier fixture was removed.
[Identity derivation](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/plugins/kubernetes-fixture/src/provider.js#L80-L84)
and [the apply and cleanup boundary](https://github.com/datrab/kubeclaw/blob/28e4f1b6a2e736dc936b48847cf422dcc0a25da2/skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts#L709-L744)
are the source authorities. These procedures require target-cluster observations;
local package checks establish only their declared boundaries.

