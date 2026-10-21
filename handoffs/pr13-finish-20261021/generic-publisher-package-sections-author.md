# Generic runtime and signed HTTP publisher — author handoff

Status: authored, **requires independent review**. No gate self-acceptance.

Only `docs/site/understand/openclaw.md` and `communication.md` changed. New generic `:runtime` section distinguishes its exact HMAC/proxy/JSON HTTP registration from `:openclaw` Gateway spawn; publisher section distinguishes its signed HTTP request/ACK/durable protocol from the Redis adapter. Two crossover rows added. Configuration, grants/dependencies, bounded payload/result, authentication, source-owned state, error/cancellation/uncertainty, safe recovery and configuration/protocol change boundaries covered without claiming activation or a live receiver.

Source check: 19 new immutable links to 10 regular tracked sources; every linked source's current full bytes equal allowed revision 0e35889a3c4e65d5c47ba88e924611aace67eb1d. All ranges in bounds and <=60 lines. Existing immutable links unchanged. Exact original-content preservation passed after removing inserted sections/rows and intro clarification: SPIFFE and all earlier accepted content remain unchanged.

Checks: docs-check PASS171; refs PASS6135 local links /3306 anchors /8347 repository references /32052 pinned links; diff-check PASS. Actual-source direct probes PASS exact generic/publisher protocol and retained-state branches using dependency stubs, not Core activation or real wire traffic. Publisher maintained config-validation and package-boundary PASS. Full publisher npm test FAILED at live-function.test.ts195 with canonical effectRequest / EFFECT_OUTCOME_UNRESOLVED; one sanitized rerun excluding SWARM_CONFIG/NODE_ENV failed identically. No environment cause established and no runtime/test edit attempted. This failed maintained test remains explicitly disclosed, not converted to success by probes.

COM001/COM008/A9705/A9711 whole-union adoption stays held until parent independent correction/package-depth review. Prior no-gap union inference is superseded for these scopes. TEL002/A9707 remains separate. No metadata/runtime/shared-checker changes or cluster/workflow actions.

Machine-readable evidence and exact page hashes: `generic-publisher-package-sections-author.json`. Direct probe: `generic-publisher-direct-probe.mjs`. Source audit: `new-package-source-link-check.json`.

## Targeted rereview addendum

Explicit generic ID grammar and dated public verification-limit paragraph added at parent request. Exact fixture error retained; no schema relaxation or deployed transport claim. Final hashes updated in JSON; no further authorship planned.
