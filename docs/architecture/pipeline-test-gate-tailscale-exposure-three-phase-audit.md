# Tailscale Exposure Three-Phase Audit

Status: source implementation and source cutover complete; parity and production cutover pending live acceptance

Audience: maintainers and release operators
Purpose: record the final Suite 7 migration state

## Phase A Result

The typed fixture, brokered capability, runtime configuration, project setup,
and real workspace graph are implemented. The provider does not own content
tests.

The controller uses the Tailscale Ingress class. The TLS host sets the desired
MagicDNS name. The path rule accepts the full MagicDNS host.

The controller stores a digest of immutable lease fields. One bounded upgrade
rule migrates leases that used the former full-spec digest. The CRD keeps all
ownership and retention fields immutable during this migration.

## Phase B Result

The ledger contains 38 items. Thirty-seven items have repository proof. One
item requires the deployed Kubernetes and Tailscale services. The accepted
deployment condition is explicit. The closeout gate now uses the normal
Nova-to-Buster provider-plan route. A test file is a planned gate. It is not
production evidence until the gate stores a successful execution receipt.
Buster completes reverse cleanup. The operator then independently checks
cluster absence and signs the final receipt with a key outside the repository.
The closeout check uses the external public key and requires the signed Nova
source revision and Buster image revision. Self-authored receipt fields cannot
close the status.
The Buster result includes the build revision of the worker that ran the plan.
This prevents a different replica from supplying the revision during a rollout.

The audit added six migration requirements. Project setup preserves expected
text, smoke paths, smoke markers, and the maximum request time. One HTTP
deadline replaces the separate legacy connection timer.

## Phase C Result

The legacy suite file, protocol name, runner registration, and telemetry path
are removed. The replacement is the only source authority. Production cutover
remains in progress until the deployed route passes the closeout gate.

Cleanup verifies the lease, namespace, Service, port, and expiry before it
disables exposure. It waits for the controller to report `Off`.

## Audit Corrections

The final audit corrected these defects:

- Mutable exposure changes no longer fail the immutable lease digest check.
- Root preview URLs now contain the required trailing slash.
- Non-root exposure paths now flow into the linked HTTP test.
- Nullable status fields now accept controller cleanup patches.
- Release requests now verify complete lease ownership.
- Tailscale path rules no longer bind to an incomplete host name.
- Full MagicDNS host names now enter status and suffix checks.
- Polling removes abort listeners after each wait.
- The committed fixture now contains its required `.swarm` directory.
- Production receipts now have an external operator Ed25519 signature and revision bond.

## Mock Report

No Suite 7 mock, fake registry, fake Tailscale service, or Kubernetes emulator
provides acceptance evidence. Pure provider validation uses plain values. The
final acceptance command requires the real cluster and Tailscale operator.

The repository tests use a real local HTTP server, real processes, the real
`kubectl` binary, real Helm rendering, and real Go tests. The planned production
gate signs a committed source snapshot, sends the full plan from Nova to
Buster, runs the isolated providers, imports evidence, checks Nova's decision,
checks runner cleanup, and confirms that the namespace and lease are absent.
The live receipt is the only accepted deferral.
