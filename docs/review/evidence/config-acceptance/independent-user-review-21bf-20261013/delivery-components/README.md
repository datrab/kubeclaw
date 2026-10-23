# Independent Delivery/components review — recovered completion

Baseline: `21bf51bc2075abec1191fdc091952492b6cb484e`. Original reviewer `/root/review_delivery_21bf`; recovery reviewer `/root/recover_delivery_review`. The original raw [report](report.md), [findings](findings.json), renders, loader outputs and mutant inputs remain preserved. Machine-readable completion: [independent-review.json](independent-review.json).

## Confirmed open findings

- **IR21BF-DC-001 · P2** — Both source-link batch validators calibrate required members from the same candidate file loaded at startup. Persisted member deletion with count correction therefore passes. Independently deriving required membership from frozen canonical schema/semantic inputs and exercising pre-startup mutations is necessary.
- **IR21BF-DC-002 · P2** — Existing but unrelated full A/B profile pointers pass. Batch01 checks only pointer existence; batch02 never validates that binding. Exact setting/case/profile/selected-field binding needs validation.

Recovery inspected both original scripts and independently reran their byte-identical copies for two baselines, two persisted member-loss candidates and two unrelated-profile candidates. All six exit 0; the four mutant successes independently confirm the two findings. Exact argv, outputs and script digests are saved in [recovery-verification.json](recovery-verification.json). All **286 frozen dirty inputs** retain their baseline SHA256; no author, canonical root or production files changed.

The current frozen data is not thereby shown incomplete or wrongly linked. Recovered independent audits report 1,162 matching source excerpts, 105 maximum coordinates/125 member bindings without issues, six structural/rendered bundle validations and six pure loader accept/reject pairs. Recovery inspected these prior raw artifacts but did not repeat the render/loader runs. Details and limitations remain in the original report; its two initial missing-CRD-schema lookup errors remain preserved.

**Verdict:** bounded review complete; document-validator completeness **not accepted**, findings **confirmed-open**. No global C0, native execution, module binding, package/image deployment or C1 acceptance is established. No author fixes were made in this review.
