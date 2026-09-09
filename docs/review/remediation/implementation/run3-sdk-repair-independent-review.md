# Independent review: versioned repair identities

Verdict: **approved for this repair-identity package**, implementation
`3b7f609a8165bf35f2435530a870c020c1b496b2` (source changes in `570f439`,
`e72fc85`, and `3b7f609`). This is not closure of all PCR-SDK-001 consumers or
the frozen 47 findings. The orchestrator must still integrate against the
fresh repair-branch head and run the affected integrated tests.

## Independence and original evidence

The reviewer used an isolated `fix/resume-47-run3-sdk-review` checkout, added
adversarial tests without modifying the author's checkout, and compared the
tested Core tree against the author's frozen commit (`git diff --exit-code`:
zero differences). Current SDK workspace resolution was checked locally.

The original requirement in the freshly fetched register calls for validated
JSON, locale-independent serialization, and controlled persisted-digest
versioning. The original open defect was reproduced with Core, real local
Git, the original ArtifactStore, and disk journal, using the existing
deterministic repair-budget checker fixture. Its contract-valid Unicode
`reason.details` keys are data, not fake native/gateway proof.

The archive in `tests/fixtures/repair-budget/legacy-core.json` contains six
unaltered original producer/consumer source files and the original audit
script from remote checkpoint `a29a9df8cce605f393fa0bec413604a5ae426eeb`.
All seven content Git blob hashes were independently matched to the freshly
read, untruncated remote tree. At test runtime, original source bytes are
checked against those hashes and overlaid on the current checkout's source
and dependencies. No old Git object, network fetch, prior local path, or
removal of new journal tags is required. The actual old producer still
reproduces en-US acceptance and sv-SE rejection; the repaired reader accepts
the original approval without changing its digest.

## Review findings corrected before approval

The initial `570f439` implementation was held despite successful ordinary
repair/recovery tests:

- A genuine administrative repair transcript accepted a changed actual target
  or changed requester findings when both redundant request copies agreed.
  Merely validating its administrative envelope was insufficient.
- Duplicate administrative causes and duplicate administrative projections
  were not rejected.
- A normal repair order could be attached to the prior successful source
  completion by changing its outer stage. That non-requester completion
  bypassed repair reconciliation.

The before evidence is retained in `admin-before.txt` and
`projections-before.txt` under `docs/review/evidence/run3-sdk-review/`.
`e72fc85` removes those gaps: administrative recovery reconstructs the
request/order from the original completion, prior state, exact generation,
and budget disposition; outer requester identity and invalid dispositions
are rejected; administrative causes/projections are unambiguous.
An unchanged canonical lint rule then reported complexity 17 > 15.
`3b7f609` factors the real extra-order predicate without suppressions or
threshold changes. Final typecheck and focused canonical lint are clean.

## Final genuine tests

`docs/review/evidence/run3-sdk-review/final-tests.txt` records the complete
independent command and raw output: **53/53 Node-reported tests passed, zero
failures, cancellations, skips, or todos**, using Node v24.19.0.
`types-lint-final.txt` records the full Nova typecheck, focused canonical
lint, and exact source-tree comparison.

Coverage includes original repair budgets and administrative/restart crash
prefixes; original old-producer en-US to current sv-SE recovery and actual
`resumePipelineV2`; current tagged production and actual resume; read-only
en-US/sv-SE/tr-TR recovery preserving journal bytes; exact same-locale old
completion-only decisions; and original wait creation at `attempt.completed`.
The resumed original fixture genuinely succeeds with four source attempts,
one approved extra repair, and the original approval digest.

Independent negatives cover changed history, category, source facts,
requester, findings, extra fields, requester attempt, mixed digest pairs,
wrong stage/causation, duplicate projections, unknown producer/pending
encodings, and the corrected administrative gaps. These controlled
transcripts are written through the original FileJournal, with valid hash
chains, so rejection is semantic rather than merely a broken JSON hash.
New pending digests are independently recomputed from the exact portable
subject; the producer's explicit encoding is inside that subject. Forged
tagged pending digests and forged matching order-ID/requestDigest pairs are
rejected.

## Preserved boundaries

Encoding comes from the original completion event, not the run-snapshot
version, caller input, locale probing, or fallback serialization. Legacy
stored IDs are reused only after full matching of their recorded semantic
body against the original completion and validated causal prefix. A legacy
completion-only prefix keeps its existing legacy calculation instead of
being rejected wholesale; there is no invented earlier approval to restore.

The generic Worker Core and role-specific engine architecture is unchanged.
These tests do not claim a real LLM, OpenClaw/Gateway closure, browser,
Kubernetes, production deployment, CI run, or all-consumer SDK acceptance.
PCR-SDK-001 therefore remains incomplete until its other recorded consumers
and required evidence are handled.
