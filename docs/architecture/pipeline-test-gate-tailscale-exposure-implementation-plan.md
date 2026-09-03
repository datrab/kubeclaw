# Tailscale Exposure Implementation Plan

Status: source implemented; production parity and cutover pending live acceptance

Audience: platform engineers
Purpose: define the three-phase replacement of `tailscale-preview`

## Phase A

Create `kubeclaw.tailscale-exposure@1`. Give it one typed deployment input and
one typed public endpoint output. Keep Kubernetes access in a brokered
capability. Do not give Kubernetes credentials to provider code.

## Phase B

Prove every baseline item. Keep URL acquisition separate from HTTP content
checks. Use the real namespace controller tests and the real provider process.
Run the production closeout gate after deployment. The gate must use the normal
Nova-to-Buster plan route. It must not construct capability invokers directly.

## Phase C

Remove the legacy suite, protocol name, runner registration, and old project
setup values. Add replacement-only checks. Keep the controller lease as the
expiry and cleanup authority.

## Stop Conditions

Stop when the controller reports a failed exposure. Stop when the returned URL
is not HTTPS. Stop when the public hostname is outside an approved suffix.

Production acceptance stays pending until the deployed Nova and Buster
runtimes pass the closeout gate against the real Kubernetes and Tailscale
services. Store the successful execution receipt before the status changes to
complete. The production operator must sign the receipt only after it observes
final resource deletion. The closeout check must verify that signature with a
trusted public key supplied outside the repository and must match the signed
Nova source revision and the deployed Buster image revision.
