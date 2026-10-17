# Four user-review corrections and independent guard recovery

**All four original findings and supplemental IFOUR-ROOT-001 are independently
verified corrected at bounded C0 document-integrity scope. No actionable finding
remains in this review scope. Global C0, native/runtime behavior, module binding
and C1–C6 acceptance/authorization are not granted.**

| Finding | Correction | Independent evidence |
| --- | --- | --- |
| UCORE-001 | Regenerate canonical root from stable current Runtime sources; conserve 1,248 Runtime rows and 6,320 native specifications. | [Initial recheck](../independent-four-findings-recheck-20261013/README.md) |
| URUNTIME-001 | Authenticate all 17 original rows before history insertion; retain incorrect digests and prior records as explicit correction provenance. | [All-17 audit](../independent-four-findings-recheck-20261013/all17-independent-provenance.json) |
| IR21BF-DC-001 | Derive exact coordinate/member requirements from frozen canonical inputs, including multiplicity; reject persisted member loss. | [Independent component audit](../independent-four-findings-recheck-20261013/audit-components.stdout) |
| IR21BF-DC-002 | Bind exact owner/field/EFFECT case/profile and selected A/B values; reject unrelated valid profile links. | [Initial recheck controls](../independent-four-findings-recheck-20261013/checks.json) |
| IFOUR-ROOT-001 | Structural checker requires complete normalized Runtime root row set and body, including history/correction provenance. | [Clean recovery](../independent-four-findings-recheck-20261013/root-guard-recheck/README.md) |

The reviewer was a fresh native subagent with no inherited conversation context,
given only the task/repository/reference locations. It independently read sources,
reconstructed bindings and generated persisted mutations. Initial review found
the additional root guard gap; the same non-author reviewer verified its fix
with 16 rejecting persisted negatives and two restored positives. Initial
findings/reports/failures remain historical; current dispositions are additive
in [disposition.json](disposition.json).

Author proof: [Runtime](runtime/README.md), [components](components/README.md),
[root integration](root/README.md), [root guard](root-guard/README.md). Structural
root checks pass; the existing 16 negative/two positive projection controls also
pass after the guard change. [Historical review conservation](historical-review-conservation.json)
records 209 original parent-review artifacts unchanged. Independent audits verify
248 protected historical inputs unchanged. No production code or original tests
changed, and unrelated chart-role-topology work was excluded.

The structured autoreview helper was attempted in local/Codex mode, including
after the guard fix; [final attempt](root-guard/autoreview-attempt.json) fails
because the Codex CLI executable is absent. This is **unavailable, not a helper
PASS**. The user-requested native independent review above is separate.

Input identities/patches bind the two review stages; before snapshots, prior
incorrect records and raw failing controls remain available. The canonical root
still says `in-progress-not-C0-accepted` / `in-progress-not-approval-ready`.
