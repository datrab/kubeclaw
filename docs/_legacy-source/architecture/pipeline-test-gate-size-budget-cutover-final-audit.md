# Size Budget Cutover Final Audit

Status: complete

Audience: maintainers, operators, and reviewers

Purpose: Record the final Suite 4 implementation, parity, cutover, and production-path evidence.

## Outcome

The size budget provider is the only bundle-size authority.

The old bundle protocol name, runner entry, graph entry, and source file are removed.

Project setup converts a legacy bundle selection into an explicit provider plan.
The conversion requires an explicit build-output directory.
It preserves total-size and file-count limits.

The real workspace declaration creates a USTAR artifact before live checks.
The size-budget node blocks dependent HTTP and Kubernetes nodes.

## Phase A

The provider measures regular files, USTAR archives, and GZIP-compressed USTAR archives.
It supports total-size, file-count, matching-file, and growth limits.
It checks cancellation before and during input processing.
It rejects duplicate file and directory entries.

The official examples contain real artifact producers.
The growth example imports a reviewed baseline from the repository.

## Phase B

The parity ledger contains 35 proved items.
The additional item preserves the legacy maximum file-count limit.
No parity item is blocked or deferred.

## Phase C

The replacement is authoritative.
The active setup documents no longer offer bundle as a current suite.
The cutover check covers scaffolding, the real workspace, examples, and production proof.

## Proof

The contained proof uses a real file system, tar, provider process, command sandbox, typed artifact link, and common runner.

The production proof uses the real Nova client and the real Buster HTTP runtime.
It uses a signed Git snapshot, persistent job storage, result import, and retained evidence.
It restarts Buster and reads the retained job and baseline.
It then commits the baseline and runs a real growth comparison.

No mock, fake service, emulator, or compatibility wrapper controls these paths.

The old protocol rejects bundle. The migration bridge records the old suite as migrated.

## Decisions

Exact content bytes are authoritative. File-system allocation blocks are not authoritative.

One explicit typed artifact is required. Output-directory discovery is removed.

Size measurement stays separate from build, deployment, exposure, browser work, and live health checks.

## Commands

Run `npm run verify:test-gate:size-budget-cutover` for the three migration phases.
Run `npm run verify:test-gate:size-budget-production` for the Nova-to-Buster boundary.
