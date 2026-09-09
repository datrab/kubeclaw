# WP06 review plugin remediation

Six scoped findings: PCR-REVIEW-AUDIT-001/002/003/004 and
PCR-REVIEW-POLICY-001/002. Implementation remains in
skills/nova/plugins/review; the dependency lock and two existing verification
consumers are updated where necessary. No boundary-checker exception, runtime
adapter source change, budget relaxation, staging or register mutation.

## Finding evidence

| Finding | Change | Evidence and limits |
| --- | --- | --- |
| AUDIT-001 | Selected incompleteness blocks before completion; invalid terminal outputs are neither checkpointed nor reused. Cache identity v2 excludes pre-fix records. Initial context requests remain resumable. | Original parser → preflight → production completion/reuse helpers reject malformed JSON objects, wrong evidence, and terminal context requests; accept certified output and distinguish explicit policy deferral. Existing cache/audit suites pass. No live model was induced to emit malformed terminal output; this is not claimed as live-model E2E. |
| AUDIT-002 | Normalize producer scope prefixes to the original receiver contract; reject forbidden path segments early. | Original Core → audit plan → original repository/artifact adapters in temporary real Git repository: plugin radius0/radius1 and path with/without terminal slash all pass. Read back actual prepared snapshot artifacts and assert exactly included files; sibling plugin excluded. Revalidation uses the same compiler/profile path and genuine IO tests. |
| AUDIT-003 | Pre-dispatch maxVerificationJobs guard and shared synchronous retry admission; audit and revalidation use the same admission helper. | Genuine revalidation stage with2 in-scope persisted baseline findings and maxVerificationJobs1 opens0 connections.12 concurrent admissions with reserve3 admit exactly3 and reject9. Runtime transport is an uncertain external effect in actual Core, so that stronger reconciliation boundary supersedes local retry testing. No fake reviewer supplies a retryable transport response. |
| AUDIT-004 | Dedicated input/integrity classification; original storage/transport errors reach Core. Uncertain external effects immediately propagate and cannot be retried locally. | Real missing artifact read yields2 Core attempts. Actual TCP peer disconnect yields1 connection and core.effect_reconciliation_required, not a review-integrity block. Invalid completed output is classified in the parsing boundary; no live malformed-model response claimed. Revalidation has no per-finding resume guarantee. |
| POLICY-001 | Free stable policy profile IDs remain free in report type, parser and schema with the policy's128-character bound. | Valid custom settings → original policy resolver → snapshot → report builder → AJV and runtime parser passes. Empty, whitespace and oversized names fail both validators. Required artifact/model complete-stage custom-policy E2E is not claimed by this bounded test. |
| POLICY-002 | Lexically mask comments/strings/templates/regex before bounded forwarding syntax; position-based IDs; symbol/ID separation; producer self-validation and explicit omission counts. | Real producer/parser/AJV/miner tests cover `$`/`_`, two same-name local wrappers, comment/string/template decoys, default arguments, >256 valid candidates and retained diagnostics. JSX text is not falsely certified: JSX/TSX produces an explicit unsupported-source omission. Existing scanner and advisory suites retained. |

## Tokenizer and stale verification consumers

The unchanged boundary checker already authorizes js-tiktoken. Replaced the
review registration's tiktoken import/dependency with js-tiktoken1.0.21's real
getEncoding API. Compared actual BPE token sequences with the still-installed
native tiktoken runtime dependency for both encodings, including Unicode, lone
surrogates, code and serialized JSON. Existing golden token/reservation tests
retain thresholds and special-token rejection.

Built an actual Nova role bundle using scripts/build-runtime-role-bundle.mjs,
archived it, and ran check-review-bundle-tokenizer.mjs successfully. The checker
requires the new JS dependency and retains the native WASM presence check for
the privileged runtime adapter. This is local packaging verification, not a
published bundle or deployment. Lock diff contains only the review dependency
switch and js-tiktoken/base64-js package entries; unrelated npm lock churn was
restored.

check-plugin-agent-output-contracts.mts imported a retired Buster test-agent
package, not a moved module. Removed only that retired consumer and its obsolete
PASS-envelope assertions; retained active judged quality-gate assertions, added
explicit retired-package absence, and corrected the count to6 active consumers.
The checker passes. This does not claim the separate Test-Agent policy audit is
complete.

## Verification disposition

Before changes, the full existing review npm test passed. After initial changes,
the same full suite passed; canonical new/helper scoped lint had 0 errors and 5
existing unused-disable warnings. New tests call original implementations and
real Git, durable storage, Core/adapters and TCP where applicable. No new mock
context, substitute parser, fake model response or unconditional success fence
was introduced. Original pre-existing unit and HTTP-fixture tests remain, and
are not relabeled as live-model evidence.

Final author gates: full review `npm test` (including new parser/admission/fact
and original-Core IO regressions) and `npm run build` passed. The stricter foreign
evidence fixture also passes after ensuring it is structurally valid through the
original parser, so rejection is genuinely at preflight. Scoped canonical ESLint
completed with 0 errors and 6 pre-existing unused-disable warnings; no suppression
was added. `git diff --check` passed. Logs: /tmp/review-final-test.log,
/tmp/review-final-build.log, /tmp/review-final-lint.log, and
/tmp/review-tokenizer-bundle.log. Independent review approved all six scoped findings and the separate integration follow-up after the corrections below. This is not a claim that the full 154-finding program or live-model E2E is verified.

Independent POLICY-002 review reproduced literal arguments erased into whitespace by lexical masking. The producer now requests explicit literal-opening markers from the original scanner, so constants, regex literals and template transformations cannot become same-parameter forwarding candidates. Original import scanning defaults are unchanged. Regression checks reject all four reproduced argument cases and retain real comment-bearing forwarding.


## Integration follow-up INT-REVIEW-UNCERTAIN001

Independent review ran the original audit stage through Core and original runtime/network adapters against a real TCP disconnect. It observed two dispatch connections with one permitted local retry, then a generic retry outcome: both scalable review/verification loops retried the unresolved-effect sentinel, and auditDispatch replaced its prefix. This follow-up is separate from the historical 154 findings. Both loops and auditDispatch now propagate that original sentinel unchanged, preserving Core reconciliation instead of creating a new uncertain effect. The real repository/Core test requires one connection and one `core.effect_reconciliation_required` attempt despite available local and stage retries. No generic Core disposition or completed-response parsing behavior changes.

The same bounded recognizer rejects a line terminator after `return` (including one inside a comment), so automatic semicolon insertion cannot turn an undefined-returning function into a forwarding fact. Actual producer regressions cover both forms.

Independent verification reran original fact extraction, remediation, audit/revalidation/job/verification and build checks. Its unchanged real-Core audit probe reproduced two connections/generic retry before the integration fix and one connection/Core reconciliation afterward. Post-review targeted canonical lint reports zero errors; additional pre-existing unused-disable warnings in the two newly touched dispatch modules remain unchanged. The opt-in scanner preserves LF, CR, U+2028 and U+2029; eight direct/comment-contained ASI cases reject, while import-scanner defaults remain unchanged.
