# Controller snapshot integrity qualification (additive)

The five reported snapshot mismatches compare **gzip container hashes** with **original uncompressed input hashes**. All five decompress to exact initial SHA and byte length. All73 archived logical inputs match:68 plain snapshots and five lossless gzip snapshots. No payload mutation was found.

This does not assert that raw gzip-container hashes equal original input hashes. Both domains are explicitly recorded in [observations](integrity-observations.json), with preserved encoded copies. Original report/freeze/receipt/snapshots and parent diagnostic remain untouched.

All17 primary and28 source identities, plus15 copied replay input payloads, are intact. The pure scripts write generated reports outside the archived inputs; no evidence attributes snapshot mutation to those controls. DCTRL-01/02/03 frozen definition findings are unaffected. Current author corrections still need a separate material review.

Old closeout live drift2 is distinct from snapshot encoding. This later check records seven current whole-live files changed and current selected49 rows/six canonical containers with new metadata; it does not assert current stability from the old report.

[Qualification](independent-integrity-qualification.json) · [current selected metadata](selected-scope-current-observations.json) · [end archived integrity](end-snapshot-integrity.json).10 negative encoding/payload controls and one restored all73 positive pass. No global C0 or runtime verdict.
