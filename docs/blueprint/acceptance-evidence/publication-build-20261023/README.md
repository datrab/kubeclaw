# Current local reader build and CI publication guidance

Reviewed commit: `2a78151955534f57f8c6ebeb49d051383b3a3afa`.

The independent current-topic review finds Source accuracy, reader usability
and quality PASS for PUB-008. Its sole adoption condition was the still-running
coordinator source-link check. That unchanged-artifact check subsequently passed
at 19:58:26 UTC, before this adoption. No content fix or repeated review was
needed. The actual primary-source check verified 14,947 links and 4,061 source
objects; the full result remains in targeted operations evidence, not copied
into a new source archive.

The original publisher check passed for 177 pages and 51 plugins; the committed
HTML build passed. All five final artifact/search/source-link/source-preview/
diagram checks passed. 106 publication/CI/reader tests passed. The artifact
checker verified 241 outputs and 40,885 local links; all 435 evidence boxes have
previews (2,000 excerpts), and 28 fresh diagram hashes match. These counts are
tested scope, not semantic completeness or assistive-technology acceptance.

Review: pinned upstream autoreview `fe588b1a6267eb47f785d0c748db9f6f3e9a3b4f`,
Codex `gpt-5.6-terra`, high, P2, local mode against a bounded read-only snapshot
of complete current topic/owning Source files. Exact root/revision/bytes and
omitted responsibilities are in `reviewed-source-manifest.json`. The complete
bundle was 369,280 bytes, one review pass; each file is below the verified
180,000-byte per-file bound. No truncation. The reviewer performed static
bundle-only inspection, not shell tests or a practical persona exercise.
Command: `run-autoreview.sh --mode local --max-priority P2 --codex-bin
/app/extensions/codex/node_modules/.bin/codex --prompt-file REVIEW-TASK.md
--stream-engine-output --json-output <operations>/review-publication-topic.json`.
No accepted/actionable findings.

Adoption is only PUB-008: 225/261 requirements and unchanged 56/89 gates. All
95 prior completion scopes remain intact:89 original objects are byte-equivalent
in the existing JSON serialization;6 receive only the reviewed revision
transition and appended narrow check/impact record. The earlier PUB-008 failure is
retained in its closure history. No global publication, screenreader, hosting,
configuration inventory, runtime or release claim follows. The original API
receiver still stops at `artifacts.ts:41`; no custody or release receipt is
rewritten. Browser library recovery affects only the operations runtime.


## Six preexisting scope transitions repaired together

The original structural checker exposed six preexisting stale source revisions,
not a new reader defect: MNT-017, PUB-002, A912-04, A912-09, PUB-004 and A912-07.
Their page/renderer/search/preview/layout sources are unchanged. Only the three
listed custody files differ; no old acceptance is counted anew. The exact
109-recipe object membership and role/child/authority-input fields are preserved;
105 full old/current native vectors were digest-checked against their respective
Source profiles (99 identical,6 precisely compared). The top-purpose object's
68 inputs/11 producers/24 descriptors are identical except the classifier input
digest and its helper seal. No authority is renewed by this repair.

The first preservation review incorrectly required a globally green API inventory
as a prerequisite for these bounded scopes. Its failure is retained in operations
proof. The original e993 receiver already failed at runner1263 while explicitly
preserving these same six scopes. Supplying that missing original terminal proof,
the original six scope contracts and the controlling compact acceptance contract
repaired material context. The final complete two-chunk review independently
returns preserveExistingScopes=PASS with no actionable findings. The global API
failure at artifacts41 remains, not waived or promoted.

Additional coordinator diagnostics:18 WCAG-tagged scans across9 representative
routes at320/1440 pixels report no violations;10 color-contrast outcomes remain
incomplete rather than passed. Native keyboard skip/navigation/search/result
activation passes at both widths. Initial Axe harness-context errors were fixed
by genuine browser contexts and retained separately. No human screenreader,
independent participant or whole accessibility gate is claimed or accepted.
