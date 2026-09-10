# Semantic final-source regression checkpoint — incomplete

Run `20260910t035412` started from current remote integration commit
`e644a79fddd4d4d686fbd351b6edaec5575caf57` (tree
`64df9214237107c027b27caf4d5f75f27a222f51`). The frozen baseline
`c38779c71bb92bc15c3fcb89930348e5417aa475` still yields exactly 47
`implementiert` findings, identical to `partial-47-scope.json` and the current
work-items ledger. All 47 original finding texts are byte-identical in the
current register. The register remains at eight verified and 39 incomplete.

The durable semantic source checkpoint
`eba514b72993e4d4a3ef1e1aca08a3d59afbbe65` was read from the remote repository
before restoration. Its tree is
`ffa0439473012775eca2fc267fa906886be7c44c`; its sole parent
`f92d3f9f1bb68734d551c3196b02362bc682d5b9` has tree
`d2889399337e122449a0926b47010ec364284c96`. The cumulative checkpoint delta is
exactly 58 non-tree paths. Every restored path matches the checkpoint's remote
blob SHA and mode. The current integration commit changes two different resume
documents relative to the same parent; those current documents are retained.
No old writer checkout is modified.

## Exact final-source checks

All commands below ran sequentially in the isolated checkout with the restored
production source and current integration documentation. They exited zero.

- `npm test --prefix skills/nova/plugins/review`: complete unchanged Review
  package, including pretest, original package tests, schema checks, coverage,
  posttest and report-encoding tests. Raw output is
  `docs/review/evidence/run13-semantic-full-review-final639.txt` (38,066 bytes,
  SHA-256 `a3aeea632a7ca33742ff365fd6afb3275d62a7f93d5c2be44553bdcbd2219632`).
- `node docs/review/evidence/wave47-project-legacy-resume-cutover-probe.mjs .`:
  the archived original CLI mismatch/recovery boundary, all 13 graph stages,
  terminal-run refusal, legacy-authoring import and source launcher passed.
  It executed no stages and makes no native acceptance claim. Raw output is
  `run13-semantic-archived-cli-final.txt` (815 bytes, SHA-256
  `44a28e86f4c35f722eafda7d4c4448ed0e5265d8b8bf3bc222ba182499fe4980`).
- `node tests/verification/contracts/check-plugin-system-v2-phase6.mjs` passed.
  Raw output is `run13-semantic-phase6-final.txt` (49 bytes, SHA-256
  `0e6c2bd086b50c822a0ab8c4bd7606c5fe814f08657f43942f59fba989529848`).
- Review build, project-summary build and full Nova typecheck passed in that
  order. Raw output is `run13-semantic-owning-typechecks-final.txt` (427 bytes,
  SHA-256 `621a87b413930d9f559d78fdf4f9d930c681f5b0f638dfe600a30778e06c9dec`).
- The existing direct owner/protocol/governor/verdict suite passed 27/27 with
  zero skips. Raw output is `run13-semantic-owner-focused-final.txt` (5,875
  bytes, SHA-256
  `01507db33ad7696068a126a0edd69ada67fb011dc1955b708231d32d3d432fdd`).

This establishes a complete unchanged package regression on the final corrected
source; the earlier full-package result on the superseded 6cb source is no longer
the only full transcript. It does not establish independent implementation
approval, a successful fresh registered semantic producer, provider execution,
or whole SDK/finding closure.

## Still open

The original native producer red at `cf45e370564dea42879c76cb83cfed3ffec03ea1`
remains part of the chronology. A later helper action was safety-flagged and was
not retried, rephrased or rerouted here. This run did not execute that helper or
claim a replacement native producer gate. The separate delivery-manifest digest
failure and its unapproved source boundary also remain unchanged.

Next action: an independent reviewer must inspect this exact restored source and
raw evidence, then execute the separately assigned independent checks. Required
genuine native/history/Summary acceptance remains open. Do not integrate the
semantic source or mark PCR-SDK-001 verified from this author checkpoint alone.
