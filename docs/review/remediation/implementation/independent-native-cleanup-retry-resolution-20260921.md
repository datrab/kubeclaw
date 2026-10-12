# Independent native cleanup retry review

The production retry boundary passes independent behavioral review. The maintained-test typecheck correction and final frozen-source rerun are complete. This bounded Core change is accepted. This review does not accept Buster's unfinished role association, destructive cleanup, historical import or IFR16.

The reviewer did not author either changed Core module or the maintained tests. The original 24-case test and its fixture are byte-identical to the author's before snapshots. Fresh execution of those originals plus all 13 new cases passes **37/37**, with zero failures, skips or cancellations. Both journal insertion orders and repeated recovery execute successfully.

Thirteen separate reviewer probes pass **13/13**. They exercise all ten predecessor reference fields with otherwise coherent envelopes/ownership; a different-effect retry with valid result, archive and correspondingly updated ownership identity; final-owner counters differing from the actual archived process; lookup reentry into the predecessor journal stripe; and byte-for-byte immutability of every existing journal/output file across two resolutions. The callback throws if the ordinary reconcile method is called recursively; successful resolution does not invoke it.

A private loader mutation removes only predecessor/successor effects equality. The targeted independent case then fails with `AssertionError: Missing expected rejection`, while the unmutated case passes. This is an executed semantic negative control, not a module-loading failure. The independent probe intentionally avoids the stale-owner fixture issue found during review; the author also strengthened the maintained different-effect case before the final 37-case run.

Source inspection confirms deferred failed-cleanup rows are processed after ordinary recovery and outside the original journal stripe. The list is bounded by existing accepted journal limits. Core rereads the original sealed result, checks the fixed profile and complete reconciliation operation against it for both predecessor and successor, requires distinct attempts/claims and the exact same effect digest, checks all three positively disposed ownership records, then reuses real archived output/counters and the existing executor finalizer. It never edits failed receipts or turns callback booleans into proof. Missing or invalid evidence leaves admission fenced.

The filesystem, GNU flock, journal admissions, output spools, finalizer and persisted bytes in these runs are real. Ownership records are deliberately modeled; no cgroup quiescence or destructive role-side cleanup was executed. The direct resolver stripe-reentry probe complements the maintained recovery insertion-order tests; it does not replace the separately required kernel gate.

Commands, current tested source hashes, complete outputs and private mutation are retained under `docs/review/evidence/independent-native-cleanup-retry-resolution-20260921/`. The package command includes the new maintained module. Review found it missing from `tsconfig.native-scope.json`; author was asked to include it and run the test-bearing scoped typecheck. Core-only typecheck does not cover the new tests. No deadline, assertion or quota was weakened by this review.

## Final maintained typing and source binding

The author added the retry module to `tsconfig.native-scope.json` and omitted the optional callback for the missing-lookup case rather than assigning `undefined`. Scoped test typecheck and canonical lint pass. Independent verification matches all ten final author manifest entries to both live files and snapshots. Production and all test oracles remain unchanged from the independent 37+13 execution; the one test construction change is explicitly recorded in `final-binding.json`.

The parent's broader run 3 executed 75 passing tests but its wrapper correctly rejected source drift: this reviewer added a separate historical decoder test during its all-reliability-directory capture. It is not a frozen-source pass. Those roots are now held unchanged for run 4; that later result will be appended only after terminal verification.

## Final frozen-source execution

Parent run 4 is terminal with wrapper exit 0, **75/75** passing tests and zero failures, skips or cancellations. Independently checked that its 31,183-entry pre/post manifests are equal, the reviewed Core sources/final retry module/config/package match those hashes, and the new-source archive contains the exact final retry test. `run4-binding.json` binds the raw log, result, source manifests, patch and added-source archive. The eleven-module matrix retains all original modules plus retry; ten host-compatible modules ran here. The root deployment module remains a separate guest prerequisite, so this is not a whole-node-pools or kernel-root acceptance.

The final optional-property test correction is covered by that run. No Core production change occurred after the independent 37+13 runs and semantic mutant. All review findings are resolved within this bounded package; the previously stated Buster/kernel/live limits remain open.
