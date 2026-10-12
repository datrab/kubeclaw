# Buster provider cancellation: observed integration failure

Status: open production-path investigation. The full original Runner contract
reached its real registered-provider cancellation case and failed the unchanged
assertion that the provider's context signal is aborted before forced termination.
The provider had written `ready.txt`; `aborted.txt` was absent. The original failed
output is retained in the Worker Core migration's `run8/original-runner.txt`.
This is not treated as a configuration-test pass or silently changed fixture.

Source inspection identifies a plausible race: `ProviderProcessSession.#terminate`
sends an IPC abort and immediately signals the process group with SIGTERM. The
child handles the IPC abort but currently has no SIGTERM handler to forward that
signal to its context controller. The native supervisor also forwards SIGTERM.
This source relationship does not by itself prove the exact scheduling of the
failed run; the correction must be tested through the original real process path.

Acceptance before correction:

- PC1: Cancellation reaches the actual cooperative provider context after a
  proven provider start. Retain the original cancelled result and marker
  assertions. Do not substitute a model or weaken the observable requirement.
- PC2: Keep forced termination of an actual noncooperative provider and the
  existing 500-ms escalation, 1000-ms termination bound and original hard-timeout
  deadline/assertions. No new grace interval or isolation bypass is authorized
  by this fix. Actual process closure remains required; an IPC send is not proof.
- PC3: Preserve capability cancellation/drain, evidence and cleanup ordering,
  original complete Runner and real-provider tests, and relevant Core/deadline
  tests. Deliberately remove the corrected signal path in a private control and
  require the real cooperative-cancellation observation to fail; unrelated
  initialization or syntax failure does not count as detection.
- PC-DOC: Document the actual graceful-abort/forced-stop sequence and its
  limits in the maintained Buster runtime documentation. Bind changed sources,
  original test changes and raw results; require an independent nonauthor review.

This belongs to the still-open Buster execution integration. It neither closes
that finding nor CONFIG. The separate Worker Core settings migration and its
source bindings must be updated if this productive dependency changes.

## Current author result (supersedes investigation status above)

The minimal permanent SIGTERM listener is implemented in provider-child.mjs; it
forwards to the existing AbortController without new grace, fake completion or
isolation changes. Multiple TERM deliveries are possible through group signaling
and supervisor forwarding; AbortController handles them idempotently. The precise
scheduling of the original failure was not traced, so that remains a source-based
race diagnosis. Maintained runtime semantics are documented in
[Engine boundaries](../../../../skills/buster/engine/BOUNDARIES.md).

LC run9 passes the complete original Runner, original real-provider, Core, deadline,
new policy and actual production replay checks, plus both typechecks. In private
control1, removing only this signal handler from the actual child makes the complete
original Runner fail exactly `cancellation reaches the provider context signal before
forced termination`; wrapper0 denotes successful negative-control detection, not a
positive original run. Both bindings report drift[]. The control maps the child
path and its matching exact filesystem-read permission to the copied file, leaving
other sandbox parameters unchanged.

Strict child lint is NOT green: archived before and current after each have the same
12 rule/message findings (top-level mutable state, dynamic loading, console), with
line offsets from the three-line insertion. See lint-before.json, lint-after.json
and lint-comparison.json under the PC evidence directory. These remain quality work.
Independent nonauthor PC review remains required; no Buster/global closure is claimed.
