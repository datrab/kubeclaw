# Full coupled Product / Controller / Chart candidate

Status: author-tested, independent full-candidate review and fresh-head integration
reconciliation required. Not all-47 completion or full F-T14/T01 delivery proof.

Fresh source base `5a437c726646d75d5500c23504ee3a3540547c3f`, local equivalent
`741da29`; all 3,389 blobs, types and modes matched the untruncated remote tree.
`docs/review/evidence/run5-coupled-source-manifest.json` records the exact original
73-path delta: Product `459eaf9779a6bf735a1420cc12b5d98f276f45b3` (43 paths),
Controller `e21a2998f8b0e39b60705dfd8bbd6855452a0395` (20), Chart
`47b392dc2aa36cb37fdbd8f63b1a6f10a1823973` (10). No cross-package overlap or
conflict with the fresh base. Each restored blob exactly matches its remote SHA;
no whole old tree was imported, and current Review codec/CLI hooks are retained.
Initial exact source restoration commit: `796ec61`.

The independently reviewed native harness and full raw history were added from
`59498a93758d24101de6fead097d81303955fb41`, preserving its exact-expiry correction
and privilege/fixture boundaries. Full source freeze tested: `ef41e37`.

Author actual results, all exit 0 and no skips:

- Original Product Control/HTTP/SQL/config/transport/session suite: 21/21.
- Original complete Go namespace-controller suite: 55 top-level tests, including
  original TypeScript signing interop from this full candidate checkout.
- Original Controller + Prism Product Helm gates: 6/6; expected missing-authority
  render failures remain part of their negative assertions.
- Full native Kubernetes/etcd VAP/CRD/CEL/CAS and original signed-controller
  matrix, including actual dropped successful PATCH acknowledgement and exact
  expiry rejection, passed against this assembled candidate.
- Prism typecheck, unchanged focused Product lint command, and Go vet passed.

Raw outputs are `docs/review/evidence/run5-coupled-{product,controller,chart,types,native}.txt`,
`run5-coupled-static.json`, and the complete `run5-coupled-native/` output tree.
Dependencies were freshly installed in this checkout with lifecycle scripts
disabled; no CI or deployment was started. Existing broad Control handler lint
debt is documented in its original independent report, not silently waived or
claimed corrected by focused lint.

Next action: independent reviewer verifies the full manifest, cross-component
source and reruns all required suites. Root has a concurrent unrelated shared
blob-reader repair in progress: reread the latest integration head, reconcile
its exact delta, and repeat affected Product/native tests before any integration.
Back up this candidate on its isolated branch first; do not update the integration
branch or mark T01/F-T14 complete merely because this coupled native gate passes.
