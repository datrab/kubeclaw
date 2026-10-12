# RuntimeSecurity component policy — implementation checkpoint

Status as reviewed on 2026-09-24: RuntimeSecurity V3, the dedicated credential-environment adapter and V4 full-service proofs are integrated locally. Independently inspected evidence confirms 61 consumer cases and 20 combined capture/service cases. RS2's previously missing full-service proof is satisfied at the recorded Service2 generation. Eight combined service controls are accepted. The corrected full regression, all nine RuntimeSecurity controls, lifecycle gate/controls and final documentation acceptance remain pending. The current seventeen-command run is in progress; no complete-run result is claimed here. Overall CONFIG, original findings and live acceptance remain open.

## Resulting behavior

All eight host inspection settings are required in the selected complete `buster-engine` component at `settings.clusterInvokers.runtimeSecurity`. Shared executable/group and projected namespace retain one author. The retired runtime JSON object rejects by presence before registry/store effects. Capability grants independently enable use. Direct construction validates before filesystem access, copies policy arrays and captures scalars without supplying defaults. Both charts validate and deliver the selected complete bytes. The [operator reference](../../../architecture/buster-runtime-security-configuration.md) lists every field, domain, unit, migration and external binding.

The migration preserves RuntimeSecurity's nonempty string prefixes without borrowing the namespace-generator length or DNS constraints: a 50-character prefix and a prefix ending in `-` remain valid. Request namespace text remains limited to 63 code units. Freshness requires explicit future skew; original assertions retain their prior 5000 ms value. The dedicated transport adapter reads only HOME, KUBECONFIG and Kubernetes service host/port per command; invoker policy does not import a fixture implementation or gain a direct-environment exception.

One intentional correction records output exhaustion before aborting the child, so abort cannot replace `KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED` with TIMEOUT. The quota counts combined stdout and stderr. This does not fix production child ownership.

## Accepted evidence and required completion

| Evidence | Result and limitation |
|---|---|
| [V3 source review](../../evidence/independent-runtime-security-policy-20260924/source-review-v3.json) and [lint adapter review](../../evidence/independent-runtime-security-policy-20260924/lint-correction-v2-source-review.json) | Source and integration accepted; direct environment access remains forbidden in both invokers. Source approval alone is not execution proof. |
| [Security Runtime1](../../evidence/independent-runtime-security-policy-20260924/security-runtime1-evidence-review.json) | 61 new consumer cases and thirteen original cluster commands passed. The full original security command failed before downstream checks because scanner/database prerequisites were absent. |
| [CI2 Service2](../../evidence/independent-cluster-ci2-proof-20260924/ci2-service2-evidence-review.json) | All 20 capture/service cases passed. RuntimeSecurity executes signed Nova request → production runtime/service → genuine provider child IPC → factory/invoker → genuine local CLI for both profiles. A reloaded smaller output cap produces the exact imported failure; denied grant/route leaves CLI count unchanged. This resolves the historical RS2 integration gap. |
| [Eight combined service controls](../../evidence/independent-runtime-security-policy-20260924/ci2-service-controls1-evidence-review.json) | All intended hook applications and consumer failures independently confirmed with exact source binding and clean drift. |
| [Consumer2 and security Controls1](../../evidence/independent-runtime-security-policy-20260924/security-controls1-review.json) | Complete 61-case baseline and eight clean controls accepted. The ninth control also cancelled orthogonal age/skew cases; it is not accepted from this run. |

The [reviewed consumer isolation correction](../../evidence/independent-runtime-security-policy-20260924/consumer-isolation-v1-source-review.json) gives only orthogonal age/skew requests their already-effective 600 ms bound and joins genuine work/child close before removing test files. The execution-limit assertion remains uncapped by a request deadline. It is integrated; the complete baseline and all nine controls must be repeated and inspected.

The [prepared scanner/cache inputs](../../evidence/runtime-security-test-tools-20260924/preparation-result.json) bind genuine pinned scanner bytes and a separately resolved fresh test cache. The unchanged locked database exceeds the unchanged 48-hour policy. Test prerequisites do not update the production lock or constitute a security-regression pass. The current full run must prove the complete original cutover chain as well as all other planned commands.

## Historical failures and lifecycle scope

Initial Fast1 passed five type projects but failed canonical lint on direct environment access and invoke complexity; shell checking was not reached. The [lint V2 review](../../evidence/independent-runtime-security-policy-20260924/lint-correction-v2-source-review.json) approved the dedicated adapter and cohesive helper without relaxing rules. Later fast checks passed. The initial failures remain archived.

V3 consumer composition did not execute the full production service, and the V4 source candidate initially had no execution evidence. These were historical gaps, subsequently resolved by Service2. Service1 failed because both Kubernetes profiles lacked required HTTPS fixture credentials; the correction supplied explicit credentials through the existing production contract.

Ownership1 could not start nested tests because inherited NODE_TEST_CONTEXT caused recursion/skips. Its reviewed environment fix deletes only that context and preserves NODE_OPTIONS guards. Ownership2 passed timeout cleanup and late-close retention, but simultaneous body/stop rejection obscured the stop cause in Node's primary-error reporting. Both attempts remain unsuccessful evidence.

The [stop-oracle review](../../evidence/independent-runtime-security-policy-20260924/ownership-stop-oracle-v1-source-review.json) and explicit [scope decision](../../evidence/buster-runtime-security-policy-20260924/ownership-stop-oracle-v1/scope-decision.md) use a successfully settled body to isolate a real stop rejection while preserving cause, child-close and retained-root checks. The earlier simultaneous body-rejection trigger was withdrawn; simultaneous error reporting is not proved. The integrated correction requires all three lifecycle cases and the two cleanup controls to pass with independent raw-evidence review.

## Remaining owners and limits

RuntimeSecurity still reads manifest bytes with unbounded `readFileSync`; command-output limits do not bound that allocation. Its local kubectl wrapper can settle before actual child close and lacks detached process-group ownership. Fixture cleanup does not establish production ownership. Provider request defaults/schema bounds and controller refresh/finding-capacity policy retain separate owners. Modeled controller responses/native preparation are not live Kubernetes, native isolation or production security acceptance. These remain explicit open boundaries, and final documentation must reflect their actual disposition rather than infer closure from the local gates.
