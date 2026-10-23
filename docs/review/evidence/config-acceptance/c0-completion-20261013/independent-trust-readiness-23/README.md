# Independent trust/readiness inventory review 23

## Bounded verdict

**PASS at static source-inventory definition scope for delivery/batch-31 only.**
No material discrepancy found in its 24 individual current classifications,
source facts, preserved delivery candidate bodies, or pinned helper/delivery
expressions. This is not full field-domain/profile/schema/case completion,
global C0 acceptance, authorization, native/provider acceptance, or a runtime
result. Existing `definitionAccepted:false`, `nativeConsumerProven:false`,
`runtimeResult:not-run`, and the unchanged queue remain truthful.

Fresh independent review performed from GOAL-START.md, OPENCLAW-CONFIG-GOAL.md,
current source and adjacent callers, without executing or using the author's
`define.py` or its local-check as semantic proof. No Helm, network, native,
security/exploit checks, broad tests or production changes were performed.
Only this independent-trust-readiness-23 directory was written.

## Exact inputs and checks

`input-identities.json` records HEAD/tree/branch and all reviewed input bytes,
SHA-256s and paths. `inputs/` freezes those exact inputs; `tracked-input.patch`
and `input-status.txt` retain dirty/tracked and untracked identities. The manifest's
`define.py` identity was checked as an input, not executed or trusted as proof.

Reproducible reviewer-owned command:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/independent-trust-readiness-23/check-inputs.py
```

Result in `checks.json`: 251 static assertions passed, including 24 unique IDs,
exact exhaustive four-source membership against the raw ledger and unchanged
batch-24 queue, all 24 full bodies against delivery/candidate-dispositions.json,
raw discovery fields conserved, original source digests, 148 exact one-based
source/helper/delivery line expressions plus file digests, queue digest,
manifest pins, and continued non-acceptance/runtime markers.

`initial-ledger-only-comparison.json` preserves the initial failed comparison:
all 24 bodies differ from the raw discovery ledger's `reason:null` because the
preserved delivery candidate bodies explicitly add the unresolved reason and
current digest/review markers. Comparison against the actual preserved delivery
baseline passes byte-content-equivalent JSON bodies. This was a reviewer input
selection correction, not an author finding or normalization of an obligation.

Semantic reading covered both complete readiness helpers and both complete
worker-trust ConfigMaps, fullname helper, ServiceAccounts, values/schema,
Deployment/workloads sidecar/probe/mount/checksum/CSI branches, Services, and the
separate deploy.sh runner Job context (including its actual SA, image selection,
ConfigMap, Unix socket mount and CSI declaration). Native parsing/operation was
not inferred from template text.

## Individual source decisions

Each ID below was reviewed, not sampled. Source coordinates/classification and
full author/relation text remain available in the frozen source-field definitions.

| Candidate | Independent current-source decision |
|---|---|
| SRC-b894dbdf69636bc2 | Kubeclaw helper: fixed five request override headers removed on readiness-only routing; protocol boundary, not configurable probe budget. |
| SRC-b901a1947bd904b7 | Kubeclaw helper: GET `/ready` has explicit inline `1s` route budget; separate policy from `2s` stream/request, `0.5s` connect, limits 4 and retries 0. |
| SRC-4c83335aa40e71ec | Kubeclaw ConfigMap gated by Helm truthiness of selected enabled field; proposed strict boolean is a target, not current proof. |
| SRC-b632610caacc2ccc | Enabled requires serviceAccount.create truthy; actual deployment and ServiceAccount use fullname `agent-<role>`, not release name or independently selected SA. |
| SRC-54cc11a3a6557096 | Selected domain required in this template; domain/principal/registration consistency is not established by `required` or quoting. |
| SRC-fb42a46ec49cebd4 | `kubeclaw-<role>` node cluster is generated label, not authenticated peer; enabled template explicitly rejects roles outside nova/buster/prism. |
| SRC-4e689b0edf747666 | Nova's two fixed loopback egress listener tuples: buster-plan 28891 and prism-agent 28080. |
| SRC-4966cf4dc6e33239 | Buster ingress 0.0.0.0:18891 accepts exact same-namespace agent-nova SAN; SANITIZE_SET URI forwarding and local 28891 cluster are explicit. |
| SRC-2e4b4d469316023b | Prism agent ingress 18082 accepts fixed agent-nova/prism-control/prism-test-runner SANs in selected domain/namespace; bridge-local 18080; control egress loopback 28080. |
| SRC-f2f4d9d329a7f86e | Agent spire-agent cluster's Unix pipe path is selected socket location, distinct from CSI mount/driver installation proof. |
| SRC-c947f4f8079cfe1a | Nova fixed remote tuples agent-buster:18891/agent-buster and agent-prism:8080/agent-prism; endpoints and exact peer identities are not interchangeable authorities. |
| SRC-91e76b0be42021f6 | Buster local static 127.0.0.1:28891 with 1s connect; no independently configured remote peer. |
| SRC-547e648425c947b8 | Prism agent bridge-local 127.0.0.1:18080 and remote prism-control-internal:8443, exact prism-control SAN; distinct endpoint/timeout/peer contracts. |
| SRC-7ea8f8235dbd60fd | Prism helper's identical fixed five-header readiness routing boundary; separate from adjustable transport budgets. |
| SRC-57f67c1e31c9602b | Prism helper's explicit 1s readiness route policy; adjacent policies remain separate and not task timeout/grant. |
| SRC-47899f7dff8985ea | Prism ConfigMap emits control/worker/runner; Chart sidecars only control/worker. Runner delivery is separate deploy.sh consumer. |
| SRC-60b5286032daa883 | Prism template requires domain; full Chart schema additionally has string pattern. Fixed local role SAs combine with release namespace; declared Nova/agent refs have separate namespaces/SAs. |
| SRC-10b93d6c7d1fdeed | Control ingress Nova SAN generated from selected domain/novaNamespace/novaServiceAccount; exact declared peer reference, not proof of real registered actor. |
| SRC-e6bbd132507d33e1 | Control ingress agent SAN generated from domain/agentNamespace/agentServiceAccount; matches workload ENV projection without establishing provider approval. |
| SRC-bc6d7902cba6f0a9 | Control SDS pipe path selected socket location; corresponding workload mounts /run/spire/sockets with selected Chart driver. |
| SRC-a8eff87f55dc1535 | Control upstream prism-agent SAN same declared agent reference; agent-prism:8080 endpoint remains distinct. |
| SRC-ae042bfd054e3908 | Worker SDS pipe path selected location; Chart workload delivers worker.yaml and selected CSI driver. |
| SRC-7650704121e82d78 | Runner SDS pipe path selected location, but separate deploy.sh runner mount /run/spire/sockets and hardcoded csi.spiffe.io are not Chart driver consumption. |
| SRC-69c19ec814a130dd | Runner upstream agent SAN generated from same declared agent fields; deploy.sh loads runner.yaml and selects loopback ports 18443/18444. |

## Material boundaries retained

- Helper self-check listener and upstream cluster use the caller's exact own
  identity, mTLS and SDS; only GET ready succeeds there. Public probe listener
  has GET health/bootstrap responses, GET ready self-check route and 404 catchall.
  This is a static wiring observation, not evidence that certs/socket/Envoy work.
- Fullname validates role DNS form and generates `agent-<role>`; enabled proxy
  separately limits roles to nova/buster/prism. It is not release-name-derived.
- Prism ServiceAccounts include fixed control, worker, test-runner names;
  actual workload and runner Job select those same names. Declared Nova/agent
  principal refs and matching ENV are not independently proven registrations,
  actor authorization, grants, or newly selectable actors. “Approved” is target
  provenance that must be checked against the authentic original deployment.
- Prism values.schema.json already constrains enabled to boolean, trustDomain
  to `^[a-z0-9.-]+$`, peer namespaces/SAs to DNS-shaped strings and socketPath
  to `^/`. Batch descriptions of template nonempty/truthiness are local template
  facts, not claims the entire Chart lacks these schema checks. Those checks
  still do not establish authentic bundle/peer/CSI availability.
- Chart CSI drivers are selected fields in kubeclaw deployment and Prism
  workloads. Runner deploy.sh uses `csi.spiffe.io` literally and inherits the
  observed control proxy image; its configuration/mount/image/provider join is
  not centrally resolved by this package. Batch explicitly retains that gap.
- Fixed topology tuples and generated identities do not classify every adjacent
  port/connect/probe duration as a protocol constant. Whole schema/profile,
  exact setting/requirement/case joins and authentic provider/runtime gates
  remain open. No queue item or canonical inventory obligation was removed.

**Blocking findings within this bounded static inventory scope: none.**
