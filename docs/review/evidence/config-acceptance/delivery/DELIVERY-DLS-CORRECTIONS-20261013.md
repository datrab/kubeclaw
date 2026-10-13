# Delivery DLS correction definition continuation — NOT ACCEPTED

This is C0 evidence/specification work only. No production/test implementation,
commit, image/build/pull/push, native service/process/account/model, host/cgroup,
Kubernetes API, Secret access, deployment, paid run, or acceptance occurred.

## Material corrections

- DLS001: `versions.json#/nativeRuntime/containerd/version` is the proposed sole
  software-version authority. That field/validator/projection does **not** exist
  today. The declared original host YAML `2.3.4-k3s1.36` is not installed readback.
  Remove its editable version author through explicitly proposed C1/C3 projection;
  software V selection and host H maintenance preserve original A state.
- DLS003: the alias is the real
  `CMP-WCORE-HOST-LIMITS-CPUPERIODMICROSECONDS`, validated against primary Core
  source/hash/case IDs. A numeric equality is not an alias. The host period is
  tunable within its actual CFS source domain; 100000 us is not universal.
- Buster credential capture: four exact PATH/KUBECONFIG/service-host/service-port
  generated runtime bindings, their constructor snapshot, real kubeconfig/token/CA
  producer and kubeclient readers are documented. These are **not** Ops MCP
  credentials. `BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT` is the real entrypoint
  reader; Docker/overlay `BUSTER_V2_KUBERNETES_CREDENTIALS` is a different name.
  Equal path text does not establish its reader/author. Rotation of referenced
  files is not freezing file bytes by copying ENV. No credential bytes/hash stored.

## Concrete source-derived proposals

Each JSON below retains field IDs, actual reader/source identity, target/native
boundary distinctions, complete definition-profile files, future harness paths,
prior-state/oracle and explicit fixture prerequisites. These are **proposals**,
not proof every profile is already native-valid or its target loader implemented.

| Artifact | Scope / important distinction |
| --- | --- |
| `native-host-target-case-specifications-20261013.json` | Host schema/aggregate/CFS/version/ownership; actual node/kernel/installed identity is separate. |
| `buster-numeric-target-case-specifications-20261013.json` | Numeric constructor/caller bounds; timer caps only at actual timer consumers; dynamic physical/context capacity not inferred. |
| `buster-structured-target-case-specifications-20261013.json` | Same existing Buster owner expansion, canonical roots/network/registry/plugin/platform; schema-only/unused carriers remain NON-EFFECT. |
| `gateway-target-case-specifications-20261013.json` | Real pinned OpenClaw reader and builtin embedded vs Codex scope; complete JSON definitions are not native Zod/model/catalogue/service/registration acceptance. |
| `ops-client-target-case-specifications-20261013.json` | Real HTTPS constructor/token/CA rereads, native Hubble endpoint, distinct response byte budget; native GRPC/TLS/provider/capacity prerequisites. |
| `codex-target-case-specifications-20261013.json` | Native permissions/approval/store vs outer Pod grants; current HOME config persistence and CLI MCP shadowing; token once-read vs server reopen. |
| `chart-author-seam-specifications-20261013.json` | Four existing `charts/<chart>/values.yaml#/profiles/<selected>/settings` deployment-author proposals, exact proposed schema filename/materializer/callers; non-deployment component/model/version/plugin inputs typed readonly aliases, not copied settings. |
| `chart-kubernetes-target-case-specifications-20261013.json` | Pinned quantity/PVC/cron predicates, whole-map precedence and full flattened definition values; supported reader pins are not actual deployed API/CSI/controller/node identities. |
| `chart-secret-target-case-specifications-20261013.json` | Selector/API syntax vs kubelet existence vs source-specific native credential protocol; actual issuer/keyset/rotation/grants remain distinct. |
| `image-projection-target-case-specifications-20261013.json` | Each real Docker ARG reader/guard and sole versions/per-image override mapping vs generated architecture/revision. Current CI omits explicit platforms; no invented multiarch or alternate authentic software build. |
| `ops-supervisor-target-case-specifications-20261013.json` | Actual Python socket/deadline/poll/terminate/reap policies, explicit same Ops author extension; no Node timer limit guessed for Python. |

The Chart seam is justified by actual Helm `-f` and existing release materializer,
but does not implement profile schemas or establish installed projections/grants.
Current materializer reads `my-values/<role>-values.yaml`, Ops starts `{}`, and
GitOps is not its current role mapping. Proposed strict owner/profile/unknown/
missing/old equal+different root/overlay/`--set` validation precedes Helm effect.
A flattened complete values projection remains immutable generated output, never
another editable author. Root selector syntax is a pending parent definition,
not a new system index. `Chart.yaml` metadata is not installed software identity.

A discovered backup timezone field is **ambient controller policy today**, not an
existing Chart key. The explicit proposed `backup.timeZone` extension requires
Prism schema/template changes: the current schema rejects it. IANA definitions
are not actual selected Go tzdata/controller proof. The failed coordinate checks
and corrected profile are both retained.

## Actual bounded controls and failure preservation

`c0-dls-pure-definition-cases-20261013.json` records actual current pure controls:
own host schema/correlation, own Gateway primitive/coordinate, current Ops pure
constructor/config/auth/window, and full definition JSON/TOML coordinate/hash.
The source counterexamples accepting zero timeout/negative byte budget are not
future target PASS. Successful type/coordinate parsing is not native behavior.
The two initial timezone coordinate failures remain failed diagnostics, not
semantic negative kills. Earlier 53 actual residual observations and primary
Kubernetes definition/projection evidence are unchanged historical artifacts.

Raw failed schema/refiner/setup/zero-collection attempts remain in their original
paths and named snapshots. The inherited stale image-spec identity failure is
preserved at `snapshots/dls-inherited-image-spec-identity-attempt1/`; unrelated
copied case spec refs were pruned, not relabelled PASS. Byte-verified reverse-only
reconstructions are explicitly labelled in preservation provenance; no unverified
reconstruction is called an original snapshot. Initial Gateway metadata-only
control raw stdout/stderr survives, but its first complete JSON/program identity
was not frozen; only the later exact observer2 evidence is exported as current.

`verify-semantic-closure.py` checks current source/spec/definition identities and
links only. `future-case-invocation-specifications-20261013.json` names exact
future argv/env/case/spec/source identities without inventing absent test bytes.
All implementation cases remain `not-run`. Target domain presence and source
tracing counts do not imply complete semantic coverage or independent acceptance.

## Exact remaining definition obligations

- `delivery-specification-obligations-20261013.json` lists each remaining missing
  target-domain row by real ID/source and each proposed domain requiring review.
  Continue remaining Chart transport/trust/service/probe/shutdown/RBAC/host-binding
  fields, Go controller, current runtime/health/observer, Ops namespace/auth/
  pagination/Hubble budgets, role/CI/release/script contracts, and their complete
  co-valid full profiles/cases; not a count-based closure.
- Existing target-domain proposals still require material independent review,
  exact typed primary-author aliases, unsupported native scopes and co-valid
  model/plugin/provider/transport/runtime fixtures. Native Zod/Codex/Go/Kernel/
  controller validation must not be replaced by broad own primitive schemas.
- Actual external roster/catalogue/credential/provider/deployed API/image/native
  platform/installed ABI identities are genuine future effect-case inputs, but
  do not block unaffected source/definition work. An unknown software B artifact
  must not be fabricated; same V/A-B platform definitions do not prove an
  alternate software version or multiarch CI installation.
- Parent DLS002 owns `author/infra-coordinate-extension-20261013.json` and its
  omitted 20-source/701-coordinate extension; do not absorb those infrastructure
  values into a Chart author without source/caller trace.
- Parent universal originalModule/grant/cleanup contract remains OPEN. Source
  constraints are at `author/nova-current-binding-seam-map-20261013.json` and
  `NOVA-MODULE-BINDING-CONSTRAINTS-20261013.md`; existing snapshot-v4 wholegraph
  registry/package/grants/config/execution/input pins are not next-unstarted-M
  dynamic selection. Target must verify original delivery/foundations before
  activation; current prepareRuntime order is a counterexample, not approval.
  Prism-specific handoff definitions are not a universal alias or Store grant.
  `AUTH-PRISM-INPUT-SPOOL-QUOTA-DEFINITION` remains a global gap. Pod/PVC/host
  values do not supply it.

Independent report `independent-config-c0-delivery-source-bce3f075.md` remains
**NOT ACCEPTED**. DLS001/DLS003 corrections are proposals pending material recheck;
DLS004 is ongoing. No user implementation approval is requested or inferred.

## Frozen DLS004 milestone — 2026-10-13

Parent requested a checkpoint before further expansion. The stable receipt is
`delivery-stable-milestone-dls004-20261013.json`; the current artifact manifest and
its independent byte-comparison receipt are `semantic-closure-artifact-digests.json`
and `milestone-artifact-manifest-verification-20261013.json`. All Delivery
mutations pause after that receipt. This is an incomplete evidence milestone,
not acceptance, implementation approval, or reduction of the remaining scope.

The final coherent batch additionally contains:

- `gateway-health-target-case-specifications-20261013.json`: 34 health fields,
  exact current readers and Chart-author aliases, uncancelled Promise.race and
  whole/per-dependency budget distinctions; no original-binding acceptance.
- `ops-service-target-case-specifications-20261013.json`: nine listener, namespace,
  origin and bearer-provider fields; constructor vs per-request credential reads
  and local topology distinctions, not actual API grants.
- `chart-probe-target-case-specifications-20261013.json`: 23 probe fields; pinned
  validator/default/kubelet distinctions, raw zero vs explicit proposed minima.
- `controller-target-case-specifications-20261013.json`: 42 controller fields;
  real shared author aliases, proposed unsupported policy-file argv, lease A
  retention/migration, principal pairs, duration/serialization/read-once trust
  distinctions. Controller whole response/output-budget relationship and stored
  lease epoch/grant/provider migration remain explicit unresolved contracts.

The corrected obligation ledger lists all 825 unaccepted rows individually:
546 have target-domain proposals and 279 do not. The 202 exact future invocation
specifications remain `not-run`. The 638 bounded pure observations contain 636
passes and two preserved initial timezone coordinate failures; these are only
parse, coordinate, own-schema or pure current-reader evidence, not native target
validation, production activation, grants, physical capacity or deployed API
acceptance. The final static consistency verifier passes with zero issues.

Remaining missing-domain IDs and source coordinates are authoritative in
`open-row-backlog.json` and `delivery-specification-obligations-20261013.json`.
They include Chart transport/topology/trust/host/RBAC and GitOps profiles, role
packages, CI/release/build-context/materializer selectors, runtime observer and
script/deployer contracts. Existing proposals still require full co-valid
profiles, native first-boundary prerequisites and material independent review.
Parent's `NOVA-MODULE-CARRIER-PROPOSAL-20261013.md` is a proposal only; universal
logical-M firstcapture, owner/schema/quota/task-operator/grant/cleanup/crossreader
contracts remain open. FileJournal append-then-throw persistence does not imply
a multirecord rollback. Parent's DLS002 701-coordinate ledger remains separate.

The failed obligation-updater SyntaxError is preserved byte-for-byte in
`snapshots/dls-obligation-ledger-syntax-attempt1/`; corrected raw ledger/status
and verifier outputs have distinct `20261013-freeze` filenames. Historical raw
logs, acquisitions, source identities and failed attempts are retained.
