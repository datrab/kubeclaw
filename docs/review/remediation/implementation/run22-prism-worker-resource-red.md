# Prism worker resource ownership: durable RED checkpoint

Run `20260910t052307`. Remote base
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff`, tree
`692a57a387d823d4b6636062e90dfbbeb07d28cd`. This checkpoint is deliberately
**incomplete** and does not change production code, the remediation register or
the status of PCR-PRISM-WORKER-002/-003.

## Fresh authority and scope

The current remote resume documents, register and original finding text were
read before work. The 47 IDs whose baseline status was `implementiert` exactly
equal the current frozen scope and work-item ID set. Both target finding texts
are unchanged. Machine-readable counts and comparisons are in
`run22-prism-worker-resource/scope-proof.json`.

## New genuine RED

The new integration test holds a real original Prism operation at the actual
HTTP artifact read, consumes unrelated CPU in the same service process and then
lets the small original deterministic render complete. Current production
reports 302 ms for the attempt while the independently measured unrelated work
used 274.767 ms. The isolation assertion fails. Result: 0/1 passed, 1 failed,
zero skipped, exit 1. This reproduces the remaining concurrent attribution
defect of PCR-PRISM-WORKER-002 without a fake counter, substitute engine or
weakened budget.

The unchanged Chromium cancellation integration was rerun. Result: 0/2 passed,
2 failed, zero skipped, exit 1. Both tests stop at the honest native prerequisite:
the pinned `chromium_headless_shell-1234` executable does not exist. Playwright's
`chromium.executablePath()` only prints an expected cache path; `existsSync` is
false. No browser was downloaded or substituted.

## Retained positive behavior

The unchanged owning Prism/Core suite passes 37/37 with zero skipped. It covers
the existing CPU baseline window, real HTTP/TLS cancellation, full-log upload,
artifact integrity, engine cache ownership, deadline and unresolved-phase
behavior. Prism typecheck and focused lint of the new RED test both exit zero.

## Boundary and next action

The existing process delta is a real code defect under concurrent work, but a
correct implementation is not a local counter edit. The long-lived service
process must retain authenticated admission while a generic Core attempt owner
places the role-specific execution host, real browser and capability children
under one delegated kernel scope. The terminal observation must include
completion hooks and precede scope disposal; termination must drain that scope
and preclude later local writes. The narrow design is recorded in
`design/run22-prism-attempt-owner-narrow-design.md`.

This host still mounts cgroup v2 read-only and provides no delegated writable
subtree. It also lacks the repository-pinned Playwright Chromium. Those are
required to implement and verify the original whole-attempt CPU/peak/process
and browser-child termination gates. The next action is to supply both native
prerequisites, implement the Core-owner plus Prism execution-host slice
atomically, keep this RED unchanged, and run the exact native concurrency,
child-reaping, capture/upload cancellation and full owning suites. Independent
review is required before any integration or finding-status change.

## Raw evidence

- `docs/review/evidence/run22-prism-worker-resource/concurrent-attribution-red.txt`
- `docs/review/evidence/run22-prism-worker-resource/browser-native-red.txt`
- `docs/review/evidence/run22-prism-worker-resource/native-prerequisites.txt`
- `docs/review/evidence/run22-prism-worker-resource/original-positive-suite.txt`
- `docs/review/evidence/run22-prism-worker-resource/typecheck.txt`
- `docs/review/evidence/run22-prism-worker-resource/focused-lint.txt`
