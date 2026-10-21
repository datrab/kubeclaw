# Proposed original-deployment ABI and destructive recovery closure

Normative additive definition over `prospective-original-deployment-binding-OPEN.json`.
This chooses the previously deferred version/error/history rules and explicitly
includes rollback. It is not implemented, installed, native-tested or accepted.
All original field/case bodies and future not-run obligations remain unchanged.

## Versioned same-path migration

Use a new immutable registered value contract
`kubeclaw.kubernetes-deployment-fixture@2`, value discriminator
`kubernetes-deployment-fixture.v2`. Preserve the existing v1 deployment fields;
add REQUIRED `originalDeployment`, exactly the object defined by
`expected-original-deployment.schema.json`. The existing producer remains sole
authority; neither CONFIG nor task intent can supply/override this object.
Existing original runner input/output provenance authenticates the typed value;
the object shape alone does not authenticate anything.

Producer capture must retain the server UID from the ORIGINAL acknowledged
create/apply response in the same existing operation result/effect receipt.
Before output publication, verify that response name, controller namespace,
requested namespace, image, manifest, expiry and endpoint agree with the original
request/source/grant. Do not treat an arbitrary later Ready GET as that receipt.
If creation was uncertain, reconcile the original operation identity and retained
server result; missing authentic UID receipt blocks publication, not duplicate
creation or current UID adoption. The actual native creation receiver must return
that response; its current discarded stdout/status-only path must migrate.

In the same approved slice, update Kubernetes-fixture output and Tailscale input
manifest contract IDs, `fixture-authority.ts` discriminator registry, actual
producer result validation and mapping, runner prepared inputs/result/recovery
codecs, provider `deploymentInput`, native request/response and cleanup codecs.
All schema hashes/package/source/role/registration/owner/root/output receipts
must describe ONE generation. Reject mixed v1/v2 wires before dispatch; never add
silent extra fields to v1 or permit a task-owned expected tuple.

At Tailscale `deploymentInput`, select the actual original endpoint with existing
unique endpoint rules, then require it equals originalDeployment's serviceName/
servicePort and namespace/leaseName/expiresAt. Carry the object unchanged as
native payload `expectedDeployment` for prepare, release and retained cleanup.
Native capability receiving version is `tailscale-exposure-request.v2`, a required
payload discriminator `schemaVersion`; old v1 receivers must not see this request.
Existing request resource/capability/original R/J/M/source/grants remain required.

## Equality and every effect boundary

For E from the authenticated original output, compare metadata.name and uid,
spec.namespaceName, verifiedImage, manifestDigest, serviceName/servicePort,
status.namespaceName/expiresAt and original requested tuple. Syntax/owner/Ready
checks remain separate. Use the fresh response resourceVersion for conditional
PATCH only after equality; conflict forces fresh equality or rejection, never
retry the stale patch against new identity. After each wait and before returned
handoff publication, recheck original identity as well as observed generation.

The exact protected paths are:

1. `#prepare`: before first exposure PATCH, including an already-owned retry.
2. `#prepare`: before handoff transfer PATCH and on recovered pending handoff.
3. `#release`: before any owned OFF PATCH.
4. `#rollbackFailedPrepare`: before owned OFF PATCH after failed/uncertain prepare.
   Change this private call to receive the retained original E/request identity;
   do not reconstruct it from the freshly read lease. Current rollback checks
   owner/resourceVersion only; that is a source counterexample, not tuple proof.

For release/rollback, first preserve the existing foreign-owner fenced no-op
(no mutation; successor unchanged). When owned, missing/mismatching E prohibits
OFF just as it prohibits ON/transfer. Cleanup does not require Ready if the
original preparation failed: apply original tuple and owner/resourceVersion
checks without confusing exposure-readiness with authority to undo an owned
effect. An expiry does not renew/reset authority, budget or lease; cleanup uses
the original cleanup permission and total deadline. No new ledger is introduced.

## Exact proposed errors and historical recovery

- `TAILSCALE_EXPOSURE_ORIGINAL_DEPLOYMENT_REQUIRED`: missing original object,
  wrong input/receiver contract version, or missing authenticated creation receipt.
- `TAILSCALE_EXPOSURE_ORIGINAL_DEPLOYMENT_MISMATCH`: well-formed E conflicts with
  original request/endpoint or fresh native tuple. Zero PATCH on that branch.
- `TAILSCALE_EXPOSURE_ORIGINAL_DEPLOYMENT_UNCERTAIN`: original creation/effect
  receipt cannot be authenticated or safely reconciled. No E from current state.

Malformed schema rejects at typed input validation before invoke. Preserve the
existing fixed rollback aggregate error boundary, with original failure and
cleanup failure classified separately; no successful cleanup result on an owned
identity mismatch. Uncertain prior PATCH remains uncertain in the original effect
record until reconciled; mismatch is not proof it never happened or permission
to erase an uncertain result.

New v2 modules accept only complete v2 upstream output. Retained v1 runs recover
only under their authentic captured v1 source/schema/package/receiver closure;
they retain their historical limited guarantee and never gain v2 tuple proof.
If that original closure is unavailable, or a run asks to cross to v2 without an
authentic original creation receipt, reject/block explicitly with REQUIRED or
UNCERTAIN. No backfill from latest lease/B, no automatic recreation/deletion.
An operational migration of such historical uncertainty is a separate explicit
decision, not inferred CONFIG authorization.

## Decisive future oracles, not executions here

For each original UID/image/manifest-related field/case member already listed in
the five-field overlays, use genuine original creation/result/output receipt E.
Matched control must traverse prepare/transfer/owned release/failed-prepare
rollback. Substitute a valid differing UID, image or manifest while all other
guards pass. Count ON, transfer and OFF PATCH separately: each mismatching branch
must produce zero PATCH, including rollback after a post-ON failure. Preserve
the existing uncertain ON record; do not claim zero earlier historical patches.
Foreign successor owner must remain successful no-op with identical successor
UID/spec/expiry. Crash before/after create receipt, output publication, ON,
transfer and OFF must recover original E and original effect/counter/deadline.

Mutate only rollback's original-tuple compare: the failed-prepare mismatch test
must fail specifically because OFF occurs. Mutate each other compare in its own
affected branch, kill with wrong-but-valid tuple, restore and rerun matched
positive. A missing native tool/setup failure is not a killed mutant. Historical
v1/missing receipt/mixed-version cases reject at the boundaries specified above.
Real native observation remains future not-run after approval, not a C0 blocker.
