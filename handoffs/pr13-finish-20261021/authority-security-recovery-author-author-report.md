# Authority, security, recovery and deployment Source-callout author batch

Status: frozen OFF-TREE author proposal, requires independent nonauthor review. Prepared 2026-10-22 by `/root/workflow_acceptance`. Main, register and generators were not modified or run.

## Baseline and exact proposed changes

The baseline is `e1791bbbcdc3c16da1ef0fc7532d6c67fd92094b`; `baseline.json` binds all four original page bytes. At handoff main `0ded6b68eb6170c4ea5e76251ad5e13adf2f664b`, all four originals still match that captured baseline, and every freshly read current Source hash still matches (`handoff-current-source-check.json`).

Actual MarkdownIt parsing finds **50** Source blocks, not the historical literal-field triage estimate: components-and-authority14, security-and-trust14, request-state-recovery12, deployment-and-trust10. Forty-seven receive concise claim-specific semantic field sets. Three already complete equivalent blocks (global1,15,42) remain byte-exact; their existing `Test`/`Checked revision` semantics count without relabeling. Existing meaningful Limit text is retained rather than duplicated. `per-box-mapping.json` records every actual block, disposition, exact semantic field text and source/candidate ranges/hashes.

The six mapped semantics are Claim, Implementation, conditional Contract/setting, negative/test evidence, Revision and claim-specific Limit. New test-evidence language distinguishes source-backed assertion boundaries from actual execution. No maintained-test absence is inferred from lack of a test link. No field asserts a new live success. Fields preserve packaging/activation/invocation/grant separation, mutable versus frozen authority, signal metadata versus authentication, native ownership versus sealed results, configuration equality on recovery even with package upgrade, and workload identity versus product approval/signatures.

All original URLs/order, pins, headings/anchors, diagram bytes, page metadata and dates remain exact. Outside Source boxes all bytes remain exact **except the separately authorized administrative authentication sentence**. See `admin-auth-source-proof.md` for its complete bounded implementation/entry/consumer/test proof. `source-boxes-only.patch` excludes that sentence; `admin-auth-only.patch` contains only that sentence; `candidate.patch` is the combined proposal. Do not apply both the combined and split patches.

## Actual Source work and bounded reuse

All four whole original pages and complete actual Source-box context were read. `source-bindings.json` covers94unique local pinned objects:91 whole pinned bytes equal current; three older deployment objects differ. Both complete historical and current versions and their whole diffs were read:

- `my-values/prism-agent-values.yaml`: current startup-doctor configuration and node-loopback exec probes differ; old agent/bridge relationship remains applicable, not a current-complete probe inventory.
- `charts/prism/templates/networkpolicy.yaml`: current adds agent Redis egress6379; old relationship is not the complete current egress list.
- `charts/prism/files/prism-backup.sh`: current adds bounded database-readiness gating before dump/proof; this is not a retry of dump/restore operations.

The corresponding Revision/Limit fields explicitly distinguish these old pins and actual current differences. No repin, false whole-file-current claim or broader current deployment claim was introduced.

`fresh-source-read-ranges.json` identifies the exact additional complete and bounded inert Source/assertion reads with hashes. It includes whole administrative entry/reopen/repair functions, graph/lifecycle/repair-budget consumers, relevant Prism worker/session/decision functions, secret-resolver implementation/test, Ops bootstrap and the three historical/current deployment files. Bounded schema/generated-type, durable-effect, snapshot, setup-secret and phase6 assertion sections are explicitly not advertised as whole-file fresh reviews.

`reuse-impact.json` names the seven unchanged prior accepted TopicSource records and their declared-source impact (all empty), retaining their actual accepted topic subsets and historical failures/limits. Reuse includes named authority/runtime/Worker/security/communication/codec closeouts; it does not accept the earlier explicitly open topics through byte equality. Whole trust detail is in `handoffs/pr13-finish-20261021/operator-platform-acceptance.md`; prior summary-only records are used only for their recorded scope, not invented fresh full-read receipts. No new whole94object semantic audit is claimed merely from source-byte binding.

## Checks actually performed

- Actual installed MarkdownIt parser: all50 Source blocks retain all six semantic fields in the **same parsed block**; URLs/order and headings exact; three previously complete blocks unchanged; outside bytes exact after reversing only the authorized admin sentence. `actual-structure.json`, `static-final.txt`, `validate.mjs`; terminal0.
- The original Reader boundary CLI against this isolated four-page candidate: `node scripts/check-site-reader-boundary.mjs`, terminal0, output `Reader-site boundary check passed.` Final separate receipt tool chunk `c9a30d`; original log retained as `reader-boundary.txt`.
- Full combined patch `git apply --check` against main: terminal0 (`patch-check.txt`; original tool chunk13899f).
- Every newly added non-Revision field is at most25 whitespace words. This is a concise-prose check, not a semantic acceptance proxy.
- Final current baseline/read-hash recheck: terminal0; all four original pages exact and no freshly read current Source drift.

These are finite inert text/Git/parser/boundary checks. No product source import, product test suite, provider/cluster/service action, generator, publication build, browser or fresh Reader execution occurred in this author batch. A full publisher/global language/gate check was not claimed. Local copied checker/test scaffolding, baseline and scripts are not production deliverables.

## Review and integration boundary

The only publication candidates are the four `docs/site/understand/*.md` files bound by `candidate-hashes.json`. `packet-hashes.json` freezes handoff evidence and split/combined patches. The independent reviewer must assess new fields and the separate admin correction, reusing unchanged named scopes only with their original limits. Root owns integration, owner-map refresh, current Source facts, publication/Reader checks and acceptance-register decisions. No A912-05, whole-topic, corpus, gate, runtime or release approval follows from this author packet.
