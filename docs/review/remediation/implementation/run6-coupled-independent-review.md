# Final independent coupled Product/controller/chart review

**Verdict: approve this bounded source package for integration against the
verified fresh parent; recommend IFR-18-001 verification after root integration.**
This is not T01-F02/F-T14 or all-47 completion and is not deployment approval.

## Exact source and fresh-head reconciliation

Independent source freeze `78ef08eaae0c8fcbfc6412d4c0f0f93113caec81` is based on
remote `b06c06dce3364c482a1da5637c36bc2b14ba8c72`, tree
`78f4ce6ebccc20f5dd00817d7349d68bb64ece60`, local `ca00dc7`. All 3,448 base
blobs/modes/types match the freshly fetched untruncated remote tree. All 73
original Product459/Controllere21/Chart47 package paths still match their exact
immutable source SHAs and modes. All 3,432 untouched base blobs are preserved,
including the newly integrated shared Blob reader and Adapter identity repairs.

All 2,088 non-document blobs of the independently tested checkout were compared
with final author backup `d9b9a42d1ae3f2e3f3ea8795f93b5e81c03edfdf`
(`fix/resume-47-run6-coupled-38aaf5c`): zero mismatches. The author evidence-only
freeze `38aaf5c` makes no source changes after the tested source freeze. Full
provenance is in `run6-coupled-independent-provenance.json` under review evidence.

The mandatory current resume files/register were freshly reread. All original
IFR-18/T01-F02/F-T14 requirement texts remain unchanged. The exact original 47
IDs were rederived again from remote commit `c38779c` and matched the current
scope, with no substitution. The repair head was freshly checked again after
all independent tests and remained exactly `b06c06d`.

## Independent regression after Reader and Adapter integration

All commands/raw outputs are in `docs/review/evidence/run6-coupled-independent-*`.
No failed setup, running test, skipped case or static trace is counted as a pass.

- Full corrected original native API harness: exit 0 after cleanup, no skips.
  Actual Kubernetes v1.35.0/etcd 3.6.6, alternate-SA TokenRequest/TokenReview and
  RBAC/VAP, original structural/CEL install, immutable status/CAS, 128/129 history
  and individual maximum-field boundaries all pass. Original signed-controller
  native persistence, exact error-code negatives, valid-expired signing window,
  unchanged-Ready extension, stale cleanup rejection, and a genuinely dropped
  successful native PATCH acknowledgement recover without a second apply.
  Full API/etcd/controller raw evidence is in `run6-coupled-independent-native/`.
- Shared original Blob-reader boundary and independent suites: 6/6 passed, zero
  skips. Actual concurrent parent replacement and real low-descriptor repeated
  oversized/exact-boundary reads remain enabled and pass after integration.
- Original Product/session/SQL/HTTP/TLS/config/proxy suites: 21 registered passes,
  zero skips. Existing shared imports repeat four composition cases, so there
  are 17 distinct cases. The PATH-T02-002 blocked-successor diagnostic remains
  diagnostic, not closure. Inter-test-file execution was sequential to fit disk
  headroom; no intra-test concurrency requirement or assertion was changed.
- Full original Go controller suite: 55 top-level groups passed, zero skips,
  including the real current TypeScript signer-to-Go interoperability test.
- Original paired controller/chart tests: 6/6 passed, zero skips.
- Complete Prism typecheck: exit 0. `git diff --check`: exit 0.

## Capacity recovery and dependency provenance

Initial fresh dependency installation encountered an actual full 32GB filesystem;
its ENOENT/ENOSPC setup output is retained separately. The reviewer removed only
its own prior and failed reproducible dependency directories, never another
checkout, source or evidence. The final tests used root-authorized immutable
hardlinks to external dependency cache files from the current root checkout.
Root and reviewer lock bytes have exact Git blob
`96cdba80650e16fb5699df314516b14d08931b95`; cached external versions match it.
All 62 workspace source links were reconstructed from this lock and verified to
resolve inside the independent final checkout, not the root or author source.
An inherited scratch test-agent link was excluded. No install, formatting or
dependency-file mutation occurred after hardlinking. Physical external bytes
are shared; independent physical dependency copies are not claimed.

Heavy native, Blob-reader and Product tests ran sequentially in an owned temporary
directory after the author released the heavy-test window. Original native
binaries are the previously independently checksum/member-byte-verified official
assets, reused read-only. Cleanup confirms both servers exited and were reaped.
No existing kubeconfig, remote cluster, Deployment, Pod, workload, production,
CI, paid resource or third-party message was used.

## Closure recommendation and strict remaining boundaries

The exact immutable IFR-18-001 requirement is satisfied: a genuine alternative
controller ServiceAccount, authenticated by native-issued credentials, executes
allowed managed test-namespace CREATE/DELETE through the original RBAC and
actual original VAP. Wrong-prefix/unlabelled CREATE and control-namespace DELETE
are denied by the specific native policy, and the control namespace remains
non-terminating. This covers two sequential alternate namespace/prefix settings.
Recommend marking **only IFR-18-001 verified** after root confirms that the
integrated owning source is identical to this reviewed candidate and publishes
against the freshly read exact parent. Legacy installed-policy migration and
simultaneous Helm-release compatibility remain documented operational caveats,
not invented additions to the original finding's specified acceptance gate.

The prior full coupled-source review remains valid: the current ControlService
composition, shared startup session snapshot, exact operator/Origin/CSRF authority,
immutable SQL intent/receipt, dedicated signer, source/generation/revision fences,
opt-in Control-only chart mounts and narrow transport policy are preserved.
The formerly missing native CRD/CEL coupling gate is now independently proven.

T01-F02/F-T14 remain open. Seeded Ingress metadata and a labelled receipt are
admission inputs, not real Tailnet, app login or operator delivery. Recreated
handlers do not prove OS-crash behavior; PGlite does not prove native pg.Pool;
the signed-controller fixture's outbound API uses private test admin credentials,
whereas the separate IFR-18 fence test uses the original controller SA/RBAC.
No production CNI, real recipient, deployed TTL cleanup or complete product graph
acceptance is claimed. Shared Worker Core and role-specific Engines remain intact.

Integration must contain only the reviewed disjoint delta over `b06c06d`, preserve
the newer Reader/Adapter bytes and use an exact-parent fast-forward update. If
the repair head changes first, reconcile again and repeat affected tests. Root's
final recheck is still its own handoff step. Overall frozen-47 completion is false.
