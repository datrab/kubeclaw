# Tailscale Exposure Operator Guide

Status: deployment configuration reference

Audience: KubeClaw operators
Purpose: configure and verify the Tailscale exposure fixture

## Required Parts

Install the Buster namespace controller, its CRD, and the Tailscale Kubernetes
operator. Configure the Tailscale Ingress class. Keep the lease controller as
the only Ingress owner for this fixture.

Add `kubernetes.exposure` to the Buster plan runtime. Configure the real
`kubectl` path, controller namespace, lease API, namespace prefixes, and
approved public suffixes. The default deployment permits only `.ts.net`.

The Buster lease client needs `get` and `patch` for BusterNamespaceLease
objects. The existing chart already grants these verbs. Do not grant direct
Ingress authority to the provider process.

## Run the Live Check

Deploy the current Nova and Buster images. Select a digest-pinned HTTP image
that listens on port 8080 and returns HTTP status 200 at `/`. Then run this
command from an operator shell:

```sh
./scripts/deploy.sh nova-tailscale-preflight \
  registry-local.kubeclaw.svc.cluster.local:5001/kubeclaw/pipeline/HTTP-IMAGE@sha256:DIGEST
```

The command runs inside deployed Nova. Nova signs the committed fixture and
sends the resolved plan to deployed Buster. Buster must use the real
Kubernetes API and the real Tailscale operator. The HTTP provider must send a
real HTTPS request through the returned MagicDNS endpoint. Nova must import
the evidence and issue a passing decision. The runner must disable the
exposure and delete the deployment fixture before it exits.

The command prints a `nova-tailscale-production-preflight.v1` receipt. Store
that receipt in the release evidence. Buster first completes reverse cleanup.
The operator then confirms that the run namespace and lease are absent. Only
after these checks does the deploy command sign the receipt with the external
production-operator Ed25519 key.

Set `KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE` to the private-key file
outside the repository. Install its approved public key at
`/etc/kubeclaw/production-receipt-authority.pub` on the control node before the
run. Keep the private key in the operator-controlled secret store. Do not
commit either key. The fixed public-key location is the external trust anchor.
The deploy command verifies the final signature before it stores the receipt.

To close the migration record, set `productionRevision` to the signed
`runtimeRevision`. Set `productionBusterRevision` to the signed
`busterRuntimeRevision`. Set `productionReceiptKeyFingerprint` to the signed
fingerprint of the public key at the fixed trust-anchor location. The deploy
command reads the Buster revision from the authenticated result of the worker
that ran the plan. The Buster image embeds this revision at build time. The
migration check rejects an unsigned receipt, a different key, a changed
receipt, or a different Nova or Buster revision. Do not close `TSX-CUT-005`
from a test file or from a direct capability check.

Use `verify:test-gate:tailscale-exposure-capability-live` only to diagnose the
brokered Kubernetes capability. That command is not production acceptance.
