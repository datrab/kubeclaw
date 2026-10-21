# Platform correction author report — not independent acceptance

Author: /root/operator_acceptance. Source candidate: 0e35889a3c4e65d5c47ba88e924611aace67eb1d. Only docs/site/understand/communication.md and telemetry.md edited. Parent owns all concurrent other files, source-checker policy and final source/generation pins. This author does not accept these corrections.

## Changes

- communication.md: every managed-model row and endpoint row now separates selected Nova GPT6.1Sol/GPT5.5fallback from Buster/chart-default and selected Prism GPT5.6Sol/GPT5.5fallback. Explains conditional GPT6allowlist and Codex agent-runtime mapping. Discord no longer claims universal mention: chart/Buster true, selected Nova false; user allowlist remains. Six immutable0e source links to exact current values/template blocks; source selectors/rendering are not traffic or persisted-state proof.
- telemetry.md: all13host-ingress v1types tabulated with exact hooks, validator-required versus declared optional fields, all common metadata/event_bytes,15identity names/tool-parent requirements, complete subagent/history fieldsets, null/array/omitted normalization and source aliases/coercion,12hooks+model-usage diagnostic and runtime-stream mappings. Explicit reception clock, timestamp validation and no invented run correlation.
- telemetry.md: documents pipeline inner openclaw-agent-event.v2 (three reduced fields) and outer agent-observability-event.v2 (exact eight fields); canonical domain event provenance/order remains Nova authority. Explains telemetry.emit append and artifacts.write put_json canonical resource IDs/namespace, selected sink ownership, awaited rejection/retry/checkpoint boundaries, payload-only SDK redaction, unchanged identity, redaction bounds and file/artifact default byte limits. No v1Redis-to-v2converter or deployed end-to-end proof invented.

## Source read

Full contracts/agent-observability/v1/src/{types,constants,validation}.ts; openclaw-agent-observer/src/{hook-payloads,hook-normalizers,hook-values}.ts; agent-observability/src/observers.ts and plugin.json; openclaw-agent-events/src/adapter.ts; SDK values redactor; telemetry-store adapter/projection and artifact-store size/encoding paths; selected Nova/Buster/Prism values and gateway model/Discord rendering. New immutable links were checked against source bytes at0e and current files, all ranges valid and at most60lines span.

## Checks (author verification only)

- node tests/validation.test.ts in contracts/agent-observability/v1: exit0, ingress validation contract.
- node tests/observers.unit.test.mjs && node tests/parity.test.ts && node tests/live-function.test.ts in skills/common/plugins/agent-observability: exit0, projection/redaction/subscription parity and local real-file telemetry+artifact delivery/checkpoints; no deployed host.
- node tests/live-function.test.ts in skills/common/plugins/openclaw-agent-observer: exit0, host normalization registrations pass/fail/crash controlled paths.
- node scripts/docs-check.mjs: exit0,167active pages; architecture9diagrams/61evidence/185links and operations21evidence/209links.
- node scripts/docs-check-refs.mjs: exit0, source references match current repository evidence.
- git diff --check -- docs/site/understand/communication.md docs/site/understand/telemetry.md: exit0.
- source-aware author check: exit0,24new source links at exact0e/current bytes; all13ingress types appear; preservation facts in platform-corrections-author-check.json. This targeted static check is not independent content acceptance or a new committed test suite.

## Preserved acceptance boundaries

COM011SPIFFE section, A9710entire success/failure/global-retry trace and TEL003producer/consumer/subscription section are byte-identical to0e. Existing lifecycle payload, retention, redaction warnings, raw-host confidentiality and domain authority material unchanged except adding the explicit v2redaction row. Source-checker code/shared pin untouched. Runtime release knip stop remains. No cluster/workflow/publishing action.

## Required independent next review

Parent/cross-reviewer should compare the new13type catalogue with declared interfaces AND validator/normalizer null/alias behavior; inspect exact8outer and3inner projection fields, payload-only versus identity redaction and both consumer contracts. Independently compare all managed-model rows to selected values and conditional template (not external provider docs). Confirm unchanged scoped SPIFFE/subscription/trace preservation. Then adjudicate COM001/COM008/TEL002/A9705/A9707/A9711 and preservation of COM011/TEL003; no gate is closed by this author report. Owning whole-source pin checker may still reject new mixed immutable source revisions until parent performs coherent semantic source validation; do not bypass or bulk-repin links.
