# Tailscale Exposure Implementation Plan

Status: implemented with production acceptance pending deployment

Audience: platform engineers
Purpose: define the three-phase replacement of `tailscale-preview`

## Phase A

Create `kubeclaw.tailscale-exposure@1`. Give it one typed deployment input and
one typed public endpoint output. Keep Kubernetes access in a brokered
capability. Do not give Kubernetes credentials to provider code.

## Phase B

Prove every baseline item. Keep URL acquisition separate from HTTP content
checks. Use the real namespace controller tests and the real provider process.
Run the live cluster check after deployment.

## Phase C

Remove the legacy suite, protocol name, runner registration, and old project
setup values. Add replacement-only checks. Keep the controller lease as the
expiry and cleanup authority.

## Stop Conditions

Stop when the controller reports a failed exposure. Stop when the returned URL
is not HTTPS. Stop when the public hostname is outside an approved suffix.

Production acceptance stays pending until the deployed Buster runtime runs the
live check against the real Kubernetes and Tailscale services.
