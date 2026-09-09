# Independent combined Product/controller/chart review

Candidate `ef41e378633ea04cf728e48c2413e92c33d39bd8` was reviewed in an
independent checkout over freshly fetched repair head
`5a437c726646d75d5500c23504ee3a3540547c3f`. All 3,389 base blobs/modes/types
matched the untruncated remote tree. Every one of the 73 original package paths
matches its immutable Product459, Controllere21 or Chart47 source SHA and mode,
and its expected predecessor matches the current base. There are no package
overlaps or unrelated source replacements. The separate corrected native test
harness is frozen author `59498a93758d24101de6fead097d81303955fb41`.

Provenance details: `docs/review/evidence/run5-coupled-independent-provenance.json`
and the author's exact `run5-coupled-source-manifest.json`. The complete source
delta was inspected, together with both preceding independent Product authority
and ControlService port reports. This is not approval obtained solely by copying
a prior native install result.

## Source assessment

The Product wrapper composes the current original ControlService; it does not
restore the old monolithic listener. Production retains genuine pg.Pool ownership,
awaited authority setup before listen, and the same session-secret snapshot.
The existing Studio proxy forwards Origin; original signed session, exact
operator allowlist, configured Origin and CSRF guard the human signer. SQL stores
the immutable original intent/envelope before transport and preserves unknown
outcomes and exact-receipt recovery. Native Go verifies dedicated signed bytes,
human issuer/actor, live source/generation/revision/expiry and current native
objects before its CAS. Shared Worker Core and role-specific Engines are intact.

Product configuration is opt-in and disabled by default. Chart authority mounts
and audience-scoped token belong only to Control, with an independently owned
signing Secret, exact destination egress, and the coupled controller ingress
identity. Existing trust annotations and disabled-case behavior remain intact.
No Secret bytes were placed in manifests or logs. The static operator page uses
textContent for returned data and preserves pending versus applied decisions;
its browser/Tailscale execution is not claimed by this review.

## Actual original and native regressions

Fresh local `npm ci --ignore-scripts --no-audit --no-fund` installed dependencies
for this checkout. Sources and workspace resolutions are not borrowed from old
worktrees. Commands and raw output are preserved in
`docs/review/evidence/run5-coupled-independent-{product,go,chart,types,native}.txt`.

- Original Product/session/SQL/HTTP/TLS/config/proxy suites: 21 registered test
  executions passed, no skips. Four composition tests are registered twice by
  the existing import arrangement, so this is 17 distinct cases, not 21 unique
  cases. The PATH-T02-002 blocked-successor diagnostic is not finding closure.
- Full original Go controller suite: 55 top-level groups passed, no skips,
  including the original TypeScript signer-to-Go interoperability from this
  combined checkout. Its old HTTP API fixtures are not relabelled native tests.
- Original paired controller/chart tests: 6/6 passed, no skips. An initial
  reviewer command omitted Helm from PATH for one suite despite setting the
  other suite's explicit Helm variable. Raw setup failure is retained; adding
  the actual toolchain to PATH reran unchanged assertions successfully.
- Complete Prism typecheck passed, exit 0.
- Complete corrected native API suite passed, exit 0 after cleanup, no skips:
  actual alternate-ServiceAccount TokenRequest/TokenReview/RBAC/VAP, original
  structural/CEL install and status/CAS, 128/129 and individual maximum-field
  boundaries, signed original-controller native persistence and real lost-ACK
  recovery. Full raw API/etcd/controller logs and exact manifests are in
  `run5-coupled-independent-native/`.

The native expiry assertion defect found by this reviewer is fixed and its
actual earlier failure retained: the corrected valid past interval now reaches
`DEMO_PRODUCT_DECISION_EXPIRED`, not an unrelated malformed-time rejection.
See `run5-native-independent-review.md` on the independent native review backup
`9b0526390ffbb4a9d2b4505fef53d4ea90457538` for the full boundary and provenance.

## Verdict and remaining scope

No source blocker was found in this combined reviewed package at the stated
base. The formerly missing real native CRD/CEL coupling gate and original IFR-18
alternative-SA admission regression are genuinely established. This does not
close T01-F02 or F-T14: actual application login, Tailnet/browser/operator access,
real recipient delivery, deployed TTL cleanup and full product graph acceptance
remain their original separate requirements. PGlite is not native pg.Pool; seeded
Ingress status/receipt are not actual delivery; recreated handlers are not an
OS-crash test. Outbound controller-native API operations use private test admin
credentials, while the separate IFR-18 fence path uses original controller-SA
RBAC. No deployment, workload, production, CI or third-party message occurred.

**Final integration remains conditional on fresh-head reconciliation and affected
suite repetition.** The repair branch advanced with the shared Blob reader after
this candidate was frozen; a pending Adapter identity change is also coordinated
by root. Do not publish this old candidate tree over either change. Preserve the
new parent, apply only the original disjoint package delta, then rerun the
affected Product/Go/Chart/native tests and record that exact candidate before
fast-forward integration. Overall completion of the frozen 47 remains false.
