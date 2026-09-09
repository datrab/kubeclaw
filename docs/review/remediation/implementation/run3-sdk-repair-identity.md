# Repair identity cutover — work in progress

Run `20260909t2146`, isolated branch `fix/resume-47-run3-sdk`. Original repro
checkpoint remote `a29a9df8cce605f393fa0bec413604a5ae426eeb`; all affected source
and repro blobs matched the local committed cache before use. No uncommitted
work from the prior invocation was copied or modified.

This source checkpoint is **not reviewed or approved for integration**. It
introduces an explicit completion producer encoding, portable tagged pending/
order digests, and semantic/causal legacy projection binding. It does not infer
encoding from snapshot versions and preserves legacy completion-only prefixes.
Administrative repair projections remain separate explicit decisions.

Initial original repair-budget suite: 8/9; the administrative projection path
revealed a real compatibility regression, corrected before this checkpoint.
The two original administrative cases then pass. Full Nova typecheck and the
canonical focused lint pass. Final full tests and independent review are next.

Historical producer archive and helper are independently prepared in `ec8596e`:
original sources are byte-verified against remote blobs and replayable without
old Git objects. Genuine negative and cross-locale current/legacy tests follow.
Broad PCR-SDK-001 remains incomplete; no native infrastructure gate is claimed.
