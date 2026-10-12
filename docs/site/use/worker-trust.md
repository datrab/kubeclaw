# Operate Worker Trust

Status: source-backed procedure; live execution needs independently owned request and cleanup evidence; live trust remains unproved
Audience: Kubernetes operator, security operator
Owner: platform operations and workload-identity owner
Evidence: scripts/deploy.sh; tests/verification/live/worker-trust-cluster-e2e.sh
Applies to: the exact selected release, SPIRE trust domain, and recorded cluster
Last verified: 2026-10-12; local command and receipt-contract checks only; no live trust result is available

## Purpose

Prove that intended workload identities can use protected paths and unintended
identities cannot. This page is the only canonical Worker Trust procedure.

## Canonical Worker Trust Procedure
<!-- operator-task: worker-trust -->

### Supported start state, version, location, and authority

Start after the [canonical installation](install.md#canonical-install-and-preflight-procedure)
has created the application, `spire-server`, and `spire-system` namespaces and
deployed the exact selected Nova, Buster, and Prism workloads. Run commands from
`<repository-root>` on the independent administration machine. An
[SVID (SPIFFE Verifiable Identity Document)](../reference/glossary.md#svid) is a
workload credential. These deployed paths use a short-lived X.509 certificate
that contains the workload's SPIFFE identity. SPIRE owns SVID issuance,
the CSI driver owns socket delivery, Envoy owns peer authentication,
application allowlists own authorization, and the selected source owns the
expected identities and test path.
Successful identity verification does not grant application permission. The
receiving application's allowlist must also permit that identity.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole trust exercise. Every raw `kubectl`, Helm, or
`scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`; every shown `<context>` must equal `EXPECTED_CONTEXT`. Run
`assert_cluster_binding` immediately before each command block. Stop on any
mismatch and follow the binding section's recovery; never fall back to the
default kubeconfig.

No broad Kubernetes/SPIRE compatibility range is established. Record actual
cluster, SPIRE chart, Envoy image, workload image, code-bundle, and trust-domain
identities.

Preparation starts earlier: complete the local receipt-authority check and the
live-execution boundary check below before the installation's first disposable
probe or workload mutation. Readiness of existing workloads does not resolve
missing signing authority or the verifier's request, denial and cleanup evidence gaps.

### Preconditions

- The explicit context and namespaces match the install record.
- Independent cluster access works without the protected workloads.
- SPIRE server persistence, agents, CSI driver, workload ServiceAccounts,
  Envoy sidecars, and NetworkPolicies are present.
- The operator can inspect Pods and execute the registered live test's temporary
  Jobs and ServiceAccounts.
- A cleanup owner and deadline exist for every temporary live-test resource.
- The production-operator receipt authority is qualified on this administration
  machine, separately from the pipeline source-attestation Secret.
- The target is an approved isolated environment. The Prism data/agent owner
  accepts the retained design request and possible agent/provider work.
- A maintained owner procedure supplies the missing original request and
  creating-resource identities, reconciliation, and independent cleanup
  observations described in [the live-execution boundary](#3-check-the-live-execution-boundary).
- The workload-identity owner qualifies a maintained denial-observation procedure
  for each negative route, with a reachable positive control and the actual peer
  or authorization rejection described below.
- The selected Nova runtime receives `BUSTER_V2_TOKEN` and
  `BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY`, and its `buster` / `test.plan.execute`
  provider selects `buster-plan-v1`. The unit preflight rejects missing inputs
  or another adapter. Verify selected configuration, Secret names/key references
  and the owning injection procedure without printing values. The Buster owner
  must confirm the corresponding authentication and source-verification inputs.

Stop if the trust domain, ServiceAccount, selected image, registration, or
allowlist differs from the recorded release. Do not disable mTLS or broaden an
allowlist to make a check pass.

### Prepare the production-receipt authority

The registered live command ends with a separate Nova-to-Buster unit
transaction and an operator-signed production receipt. Its signer requires
`KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE` and the trusted public key at
the fixed path `/etc/kubeclaw/production-receipt-authority.pub`. Both resolved
files must be outside the repository. The public-key path is fixed by the
deploy script; setting an environment variable does not replace it.

The production-operator signing owner must supply a maintained provisioning
procedure: approve the key and fingerprint, install the trust anchor on this
machine, protect private-key access, and define rotation, revocation, recovery,
and disposal. This repository does not install that authority. Stop before the
first probe or workload mutation if its procedure or qualified files are
missing. Do not generate an ad hoc key to make the command pass. The
`pipeline-test-gate-source-attestation` Secret signs Nova's source snapshots
for Buster; it does not provide this operator receipt authority.

Run this local check from `<repository-root>` after the signing owner installs
the files. `<production-receipt-private-key-path>` is the owner's absolute
private-key path. `<production-receipt-key-fingerprint>` is the independently
approved `sha256:` fingerprint of the public key's SPKI DER bytes, the binary
public-key representation used by the receipt verifier. The command reads
local keys and signs a local test message; it does not contact a cluster, print
key material, or create a production receipt:

```bash
export KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE="<production-receipt-private-key-path>"
export EXPECTED_PRODUCTION_RECEIPT_KEY_FINGERPRINT="<production-receipt-key-fingerprint>"
node --input-type=module - "$KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE" \
  /etc/kubeclaw/production-receipt-authority.pub \
  "$EXPECTED_PRODUCTION_RECEIPT_KEY_FINGERPRINT" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
try {
  const [privateFile, publicFile, expectedFingerprint] = process.argv.slice(2);
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error();
  const root = fs.realpathSync(process.cwd());
  for (const file of [privateFile, publicFile]) {
    if (!path.isAbsolute(file)) throw new Error();
    const resolved = fs.realpathSync(file);
    if (!fs.statSync(resolved).isFile()) throw new Error();
    const relative = path.relative(root, resolved);
    if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error();
    fs.accessSync(resolved, fs.constants.R_OK);
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privateFile));
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicFile));
  if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') throw new Error();
  const fingerprint = 'sha256:' + crypto.createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  const message = Buffer.from('KubeClaw operator receipt key qualification');
  if (fingerprint !== expectedFingerprint ||
      !crypto.verify(null, message, publicKey, crypto.sign(null, message, privateKey))) throw new Error();
  console.log(JSON.stringify({ authority: 'kubeclaw:production-operator',
    publicKeyFingerprint: fingerprint, localKeyPairVerified: true }));
} catch {
  console.error('PRODUCTION_RECEIPT_AUTHORITY_UNQUALIFIED');
  process.exit(1);
}
NODE
```

Expected observation: exit zero and only the authority, approved fingerprint,
and local keypair result. Retain this non-secret output, command exit, tool
version, signing-owner approval and provisioning reference. Missing files,
repository-local resolved paths, unreadable keys, a non-Ed25519 key, mismatched
keys or a different fingerprint must stop the route. Ask the signing owner to
repair the first failed prerequisite, then repeat the check. A matching pair
does not establish owner approval, live trust, or receipt success.

> **Source evidence — separate receipt authority**
>
> **Claim:** The wrapper performs the live identity exercise before a Nova unit transaction and receipt signing; keys are otherwise checked only after those effects.
>
> **Implementation:** [The wrapper sequence](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/deploy.sh#L2672-L2680), [fixed public-key path](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/deploy.sh#L79-L79) define the sequence and key location.
> The [signer's external-key and worker-revision checks](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/deploy.sh#L1970-L2008) define this boundary.
>
> **Contract or setting:** [The attestation module requires Ed25519 and records the public-key fingerprint](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/production-receipt-attestation.mjs#L66-L85). [Secret setup owns a different source-attestation keypair](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/my-values/setup-secrets.sh#L610-L638).
>
> **Test evidence:** [The receipt contract tests matching keys, wrong keys, tampering, and revision mismatch](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/contracts/check-production-receipt-attestation.mjs#L30-L55). Local key and receipt checks do not prove a live transaction.
>
> **Revision:** `8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32`.
>
> **Limit:** No signing-authority provisioning or live receipt result is established here.

### 1. Verify source before cluster execution

First complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation)
in the disposable checkout and retain its sanitized evidence.

```bash
npm run verify:worker-core:trust
npm run verify:prism:deploy-script
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Expected observation is zero from each command. On 2026-10-09, the Prism
deployment source check passed at `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`
with Node.js `v24.21.0`. `verify:worker-core:trust` also passed locally on 2026-10-12.
No new deployment-truth or live Worker Trust result is available.
Run all three checks for your selected checkout.
Stop on any nonzero exit; a local source check does not prove live peer authorization.

### 2. Observe the installed identity chain

After all source checks pass for the selected source, capture the chain:

```bash
assert_cluster_binding
kubectl --context "<context>" -n spire-server get pods -o wide
kubectl --context "<context>" -n spire-system get pods,daemonset -o wide
kubectl --context "<context>" -n "<namespace>" get \
  deploy,pods,svc,serviceaccount,networkpolicy -o wide
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
./scripts/deploy.sh prism-smoke
```

Expected observation: SPIRE server and agents are ready, CSI-backed workloads
are ready, protected Services have endpoints, and component smoke exits zero.
These observations prove dependencies, not peer authorization.

### 3. Check the live-execution boundary

The implemented command is `npm run verify:worker-core:trust:live`. It runs
`deploy.sh worker-trust-e2e` in this checkout.

After the owners qualify the signing, lifecycle and denial-observation
prerequisites below, this implemented live command uses deployed workloads and
a real unit process. It does not use a test-double server or fabricated completion
result. Local synthetic checks remain separate from this live execution. This
implementation fact does not establish a live result here or make ambiguous
negative-probe JSON sufficient denial proof.

Its effects occur in this order:

1. The live script waits for Nova, Buster, Prism Control, and Prism Worker,
   inspects loaded SVIDs, and checks protected proxy paths.
2. Nova sends a Prism design request through its loopback proxy. The script
   generates a project key internally and uses it as the idempotency key. A
   `202` response admits durable work: Control persists the project and active
   design request, starts a design round, and admits a design-agent job. Agent
   execution can invoke its configured provider. This is not only a health
   request, and deleting test Jobs does not remove that work.
3. The script checks plaintext rejection and creates two Jobs and two
   ServiceAccounts for wrong-identity tests, in the recorded application and
   Prism namespaces. It waits for the Jobs and emits live trust JSON.
4. On exit, its trap attempts asynchronous Job and ServiceAccount deletion.
   The wrapper then runs the Nova unit production preflight. This submits a
   signed source snapshot to Buster, runs a real unit process, and imports its
   evidence. The operator signer checks the deployed Buster revision, signs
   the unit result, verifies it with the installed trust anchor, and writes
   `dist/verification/unit-production-receipt.json` in this checkout.

The current live script does not retain the design request's original key,
architecture digest, project response, round, or agent-job response. It discards
an accepted dispatch response. It also does not emit creating object UIDs or a
cleanup receipt. Its internal `RUN_ID` is not an operator input or a guaranteed
retained receipt. Raw kubectl output can incidentally expose resource names;
that does not prove their creating identities or durable-request identity.
The deletion trap uses `--wait=false`, suppresses output, and ignores errors.
Exit zero and final live JSON therefore do not prove cleanup.

Before execution, the platform and workload-identity owners must approve an
isolated target and a maintained independent evidence and reconciliation
procedure. The Prism data/agent owner must approve retained design history,
provider effects, retention and eventual retirement. The procedure must capture:

- The original submitted project key, idempotency key, architecture content,
  digest and revision, and the accepted project, round and agent-job identities.
- Each actual test resource name, namespace and creating UID, including partial
  creation or a lost response. Its resource cleanup must check those identities
  and independently observe completion with recorded API exit statuses.
- For each negative route, the tested caller identity, destination, port, path,
  time and actual rejection observation from the receiving proxy or application.
  Pair it with a reachable authorized request to that destination through the
  same relevant network and proxy path. A positive control is this comparison
  request; it must establish reachability during the negative test. The owner
  must name the observation source, access rights and evidence that distinguish
  peer authentication rejection from application authorization rejection.
- The original Nova unit run/job identities and immutable source/worker
  revisions, evidence digests, and separate operator-signed receipt.
- A recovery route for denied reads, interruption, replaced objects, a lost
  dispatch response, and possibly completed provider or unit work.

This repository does not supply that complete independent capture and
reconciliation procedure. If the owners have not supplied and qualified it,
stop before running the live command. For a new installation that requires
complete verification or operational approval, stop before its first probe or
workload mutation. Local key qualification, source checks and component smoke
cannot remove this boundary. Do not waive mandatory positive, negative or
source-signing proof, invent an input flag, or assume broad logging captures
identities that the current command discards. An independently maintained
owner procedure can resolve the prerequisite; it must identify its actual
capture sources, exact observations, rights and protected evidence location.
Its qualification must cover successful, partial and interrupted execution
without modifying production state or treating ambiguous effects as absent.
The workload-identity owner must also qualify the denial observations against
actual peer or allowlist rejection, unavailable endpoints, timeouts and server
errors. If lifecycle capture is qualified but denial observation is not, the
same stop remains in force before the live command and before the first probe
or workload mutation for a complete installation. This repository supplies no
complete independent denial-observation procedure.

### Required results and cleanup observations

After the owners resolve that prerequisite, retain the complete command output
and exit status separately from each result. Live JSON with
`schemaVersion=worker-trust-cluster-e2e.v1` declares successful Nova-to-Buster,
Nova-to-Prism, Prism-Control-to-Worker and Prism-Worker-to-Control paths. Its
negative paths cover plaintext, wrong SVID and forged forwarded identity.
A positive result without its paired denial is incomplete. This JSON does not
contain source-signing proof or a cleanup result. It also does not establish
why a negative request failed.

The wrong-SVID probes first check that the unintended SVID was loaded. They
then accept any non-2xx response (a status outside 200–299), and also accept a
fetch exception, as denial. TLS (Transport Layer Security) authenticates peers
and encrypts the connection. The direct TLS probes accept any network error or timeout as rejection. Thus an
unreachable proxy, connection refusal or HTTP 503 can still lead to success
JSON. These outcomes do not prove that a peer or allowlist rejected the caller.
Earlier positive requests use different callers or endpoints and occur at a
different time; they do not establish the cause of a later failure.

Classify unavailable endpoints, timeouts and HTTP 5xx server-error responses as
inconclusive.
Stop approval, preserve the failed observation and repair reachability or the
server through its owner. Even a non-2xx response such as HTTP 403 needs the
owner's correlated identity and rejection evidence. Retain the actual peer or
authorization rejection and its reachable positive control for each negative
route before accepting the paired result. The plaintext, wrong-SVID and forged
forwarded-identity paths remain mandatory. Do not replace them with smoke checks
or treat the live command's exit zero as independent denial proof.

> **Source evidence — negative probe limits**
>
> **Claim:** The wrong-SVID probes accept fetch errors and any non-2xx status; direct TLS probes accept network errors and timeouts. The final JSON does not distinguish these causes.
>
> **Implementation:** [Direct TLS error and timeout handling](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/tests/verification/live/worker-trust-cluster-e2e.sh#L38-L52) and [Prism](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/tests/verification/live/worker-trust-cluster-e2e.sh#L146-L146) / [Buster wrong-SVID commands](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/tests/verification/live/worker-trust-cluster-e2e.sh#L182-L182).
>
> **Contract or setting:** [The final JSON names required positive and negative routes](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/tests/verification/live/worker-trust-cluster-e2e.sh#L190-L199).
>
> **Test evidence:** Local synthetic execution of the exact extracted probes confirmed acceptance of connection refusal, timeout and HTTP 503 in the applicable probes. No cluster authorization result was obtained.
>
> **Revision:** `430633accc4a374a740b5f12f384eeeb9dce228d`.
>
> **Limit:** The live verifier alone cannot distinguish authorization denial from failure to reach a working destination.

The separate unit receipt has `schemaVersion=nova-unit-production-preflight.v2`.
It contains the Nova run and Buster job identities, source and worker revisions,
plan/result/decision and imported-evidence digests, process/JUnit/resource
checks, and an operator attestation. `runnerCleanupVerified=true` and
`clusterCleanupNotApplicable=true` describe the unit runner. They do not prove
removal of the live script's Jobs, ServiceAccounts or Prism design state.
The wrapper overwrites the fixed receipt path on success. Retain each original
receipt and command record in protected evidence before any authorized repeat;
an existing receipt or earlier live JSON cannot prove the current invocation.

For a retained signed unit receipt, the following local verification uses the
same installed public key. `<nova-runtime-revision>` and
`<buster-runtime-revision>` are the exact revisions independently observed for
that invocation, not values copied from an unchecked receipt. Complete the
key qualification above immediately before verification:

```bash
node scripts/production-receipt-attestation.mjs verify \
  dist/verification/unit-production-receipt.json \
  /etc/kubeclaw/production-receipt-authority.pub \
  "<nova-runtime-revision>" "<buster-runtime-revision>"
```

Expected observation: exit zero and `production receipt attestation verified`.
Retain the signed file, its digest, qualified public-key fingerprint and
verification exit. A missing, stale, mismatched or invalid receipt is a failed
verification, even if earlier live paths passed. Do not rerun the wrapper to
repair signing: first reconcile its already admitted requests and jobs.

For test-resource cleanup, only successful independent named read-back can
establish API absence. The owner procedure must retain reads and exits for
each exact Job and ServiceAccount and any dependent test Pods. A denied read,
timeout or replaced UID is an unresolved result; stop and escalate to the
resource owner. If creating UID or ownership cannot be established, preserve
the objects and evidence. Do not infer ownership from the `worker-trust-`
prefix, delete a replacement object, or use production labels for cleanup.
This page supplies no universal deletion command because the current verifier
does not retain the identities required for one.

Prism design state requires separate reconciliation. Use the original request
and job identities with the Prism owner's authenticated observation procedure.
If those identities were lost, stop new test admission and have the owner
reconcile audit, project and agent/provider records; do not guess a project or
send a new key. Follow [Prism's stop and retention boundary](prism-studio.md#stop-or-abandon-the-journey).
Project deletion and whole-journey cancellation are not supplied. Preserve
accepted history and effects under the owner's retention decision; eventual
retirement uses the governed data/access procedure. Removing test Jobs or
closing Studio does not undo admitted design work.

To remove this execution boundary, platform operations, the workload-identity
owner, production-operator signing owner and Prism data/agent owner must retain
a qualified procedure and actual exact-cluster results: all required trust
paths and observed peer or authorization denials paired with reachable positive
controls, the verified unit receipt, original durable-request/job
identities, resolved external effects, and UID-safe cleanup with independent
read-back. Live success is still unproved here.

> **Source evidence — live effects and separate receipts**
>
> **Claim:** The live verifier admits durable Prism work and suppresses cleanup outcomes; the wrapper separately persists a signed unit receipt.
>
> **Implementation:** [Internal test identity and suppressed asynchronous cleanup](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/live/worker-trust-cluster-e2e.sh#L12-L23), [design dispatch with discarded accepted response](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/live/worker-trust-cluster-e2e.sh#L91-L105) establish the script effects.
> The [Control's persisted request, round and agent admission](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/skills/prism/server/control-server.ts#L214-L229) establish the lifecycle effects.
>
> **Contract or setting:** [The unit wrapper executes remotely before signing and stores the fixed unit receipt](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/deploy.sh#L2011-L2052). [The unit transaction checks imported evidence and emits its own receipt](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/e2e/nova-unit-production-preflight.mts#L101-L131).
> [The unit preflight requires its token, source key and provider adapter](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/e2e/nova-unit-production-preflight.mts#L20-L43); [Nova's selected values provide the Secret references](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/my-values/nova-values.yaml#L120-L129).
>
> **Test evidence:** [The live JSON lists trust paths only](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/tests/verification/live/worker-trust-cluster-e2e.sh#L190-L199); [receipt validation keeps unit cleanup separate from cluster cleanup](https://github.com/datrab/kubeclaw/blob/8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32/scripts/production-receipt-attestation.mjs#L99-L125). No live result is established.
>
> **Revision:** `8c22254ea6cc3f6e98e3e453f2ff91c8ec4eba32`.
>
> **Limit:** Source evidence does not recover an already lost request identity or establish successful resource/provider cleanup.

### Failure distinction

Check in this order:

1. context and namespace;
2. SPIRE server persistence and agents;
3. CSI socket mount;
4. Envoy bootstrap, readiness, and loaded SVID;
5. Service endpoint and target port;
6. NetworkPolicy in both directions;
7. application identity allowlist;
8. source-signing key configuration;
9. separate operator receipt signing and verification;
10. durable request reconciliation and test cleanup.

A timeout, unreachable endpoint or HTTP 5xx response is inconclusive denial
evidence. Diagnose reachability and server health first. An observed TLS/SVID
rejection concerns identity issuance or peer verification. A correlated
authenticated denial concerns the application allowlist. A
successful wrong-identity request is a security incident: restrict the owning
Service, retain evidence, and stop admission.

Use the exact error code to select the first repair. Do not weaken a trust rule
to remove an error.

| Error code | Meaning | First repair |
| --- | --- | --- |
| `WORKER_TRUST_PEER_MISSING` | The verified forwarded-certificate header is absent or contains more than one certificate entry. | Inspect the destination Envoy ingress and confirm that traffic enters through it. |
| `WORKER_TRUST_PEER_INVALID` | The header does not contain exactly one valid SPIFFE URI. | Inspect the verified certificate URI SAN and Envoy `SANITIZE_SET` output. |
| `WORKER_TRUST_POLICY_INVALID` | The application allowlist is empty or contains an invalid SPIFFE ID. | Restore the exact expected identities before restarting the workload. |
| `WORKER_TRUST_PEER_FORBIDDEN` | The authenticated SPIFFE ID is not in the application allowlist. | Compare the caller namespace and ServiceAccount with the configured identity. |
| `WORKER_TRUST_PROXY_REQUIRED` | Worker Core received forwarded identity from a non-loopback address. | Route the request through the colocated Envoy listener. |
| `REMOTE_TEST_GATE_SPIFFE_PROXY_NOT_LOOPBACK` | A remote-suite provider selected SPIFFE proxy authentication with a non-loopback endpoint. | Set that provider endpoint to its Nova loopback Envoy listener. |
| `NOVA_REMOTE_PLAN_SPIFFE_PROXY_NOT_LOOPBACK` | The Nova remote-plan transport selected SPIFFE proxy authentication with a non-loopback endpoint. | Use `http://127.0.0.1:28891` for the Buster plan route. |
| `BUSTER_REMOTE_SPIFFE_POLICY_INVALID` | Buster has no valid trusted Nova SPIFFE ID. | Restore the exact Nova identity in the Buster policy. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_MISSING` | Nova did not receive the source-attestation private key. | Inspect the `pipeline-test-gate-source-attestation` Secret reference and its `privateKey` key. |
| `NOVA_SOURCE_ATTESTATION_PRIVATE_KEY_INVALID` | Nova cannot parse the private key or the key is not Ed25519. | Replace the complete Ed25519 keypair and restart both key consumers in the maintenance window. |
| `BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING` | Buster did not receive the source-attestation public key. | Inspect the same Secret reference and its `publicKey` key. |
| `BUSTER_SOURCE_ATTESTATION_CONFIG_INVALID` | Buster cannot parse an Ed25519 public key, or its trusted source authority is invalid. | Compare the public key and authority with Nova's active signer configuration. |
| `BUSTER_SOURCE_ATTESTATION_INVALID` | The received source snapshot does not pass signature, authority, or content verification. | Stop execution. Compare the selected revisions, authority, archive digest, and active keypair before retrying. |

The two loopback errors are separate because the plugin adapter and the Nova
transport validate different configuration boundaries. Both reject a remote
URL before any request can claim SPIFFE proxy authentication.

> **Source evidence — failures are deliberate admission stops**
>
> **Implementation:** [Worker Core identity failures](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/worker/core/worker/trust.ts#L17-L51) ·
> [remote-suite endpoint check](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/plugins/remote-test-gate/src/adapter.ts#L46-L61) ·
> [Nova transport endpoint check](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/core/test-gates/remote-dispatch.ts#L109-L132) ·
> [Nova private-key checks](https://github.com/datrab/kubeclaw/blob/8da6157b77247dcbdf209ef12f491f0b92ca858a/skills/nova/core/test-gates/runtime-config.ts#L51-L68).

### Recovery, rotation boundary, and evidence

Repair only the first failed layer. Rerun component readiness, then reconcile
every previously admitted design request, provider effect and unit job before
authorizing another live test. Each new invocation generates new identities;
it does not resume the previous request. If original identities or cleanup are
unresolved, stop and use the owning procedure above. Once reconciliation and
the live prerequisites pass, repeat both positive and negative paths. Restore the previous exact trust configuration
before revocation when a planned change fails. Complete timed SVID/CA expiry and
independent SPIRE restore are not established, and the source-attestation
Secret supports one active keypair; its rotation requires a maintenance window.
Use the [canonical rotation procedure](maintenance.md#canonical-rotation-procedure)
and stop if an authority-specific issuance, overlap, revocation, or restore
step is absent.

Retain source and release identities, context, trust domain, ServiceAccounts and
expected SPIFFE IDs, non-secret Secret metadata, source-check output, component
readiness, positive and negative live JSON, actual peer or authorization
rejections and their reachable positive controls, failure-layer diagnosis, recovery,
the separate signed unit receipt and its verification, original request/round/job
identities, resource names/creating UIDs, independent cleanup observations,
retained-state decisions, and any open boundary. After evidence is retained,
unset `KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE` in the administration shell.
Dispose of temporary signing access only through its owner; do not remove the
installed trust anchor or retained receipts as test cleanup. Never retain
private keys, SVID key material, or Secret values.

## Source Authority

The live command is dispatched by
[`cmd_worker_trust_e2e`](https://github.com/datrab/kubeclaw/blob/2a8558d795054d25aa4b72dbdc296c9321ba38f6/scripts/deploy.sh#L2672-L2687).
The deployment health program checks the mounted code bundle, gateway, Redis,
and drain/startup state
([implementation](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/kubeclaw/templates/deployment.yaml#L880-L915)),
while the workload defines separate startup, readiness, and liveness probes
([probe wiring](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/kubeclaw/templates/deployment.yaml#L1479-L1513)).
