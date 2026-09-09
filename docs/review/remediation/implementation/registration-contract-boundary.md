# Registration contract boundary integration

INT-BOUNDARY001 is an integration defect found while running the overarching
plugin boundary gate, separate from the 154 review findings. Buster quality gate
and project summary legitimately consume gate decisions, but importing the
contract root also loaded filesystem-backed schema validation. The former
remote digest import also pulled the observability root validator into stages.

The test-gate package now exposes the exact `./gate-decision` entry. Decision
parsing imports a pure digest module; its canonical serializer comes from the
observability package's exact `./canonical-json` entry. The canonical functions
were extracted without changing their text or bytes. Existing root exports and
remotePlanDigest API remain available. No schema, version, persisted digest or
existing SDK authority changed. A separately approved sha256Bytes helper adds exact byte hashing using the same existing crypto implementation as sha256Text. Existing producers keep writing the same decision bytes.

The registration checker approves exact exports, validates their package names,
export targets and actual Node resolution, then walks every local/transitive
contract import. Contract graphs reject privileged globals, URL loads, dynamic
imports and unapproved dependencies. Require remains forbidden except in the exact audited Prism helper graph described below. Only approved contract graphs may
import crypto; ordinary stages retain the previous path/SDK permissions. Native
negative fixtures cover transitive filesystem access, global access, dynamic
imports, misleading package-root imports, SDK escape from a contract graph and
export retargeting. A clean transitive digest fixture must pass.

The same gate exposed lint's report-validator dependency on its filesystem-backed
policy loader solely for a version constant. A pure policy-version module now
owns that unchanged constant, re-exported through the previous policy API. Report
content verification uses the existing SDK sha256Text instead of importing crypto;
the prefix comparison preserves the exact previous digest.

Cross-package integration tests were moved without changing assertions. Their
package test commands still execute them; imports and relative fixture URLs now
resolve from tests/verification/integration:

- human-approval/tests/architecture-approval.unit.test.ts -> architecture-approval.test.mts
- prism-design/tests/archive.test.ts -> prism-archive.test.mts
- prism-design/tests/wait.test.ts -> prism-wait.test.mts
- project-summary/tests/summary.test.mjs -> project-summary.test.mjs

Root separately moved runtime-dispatch's repository/result-path test. No tests are
exempted from boundary scanning, and a full scan found no remaining cross-package
relative imports in plugin trees.

Validation: Buster and project-summary original suites/builds pass; human approval
and Prism original suites/builds pass after relocation. Test-gate remediation and
both contract typechecks pass. The native digest regression checks the original
checkout's fixed Unicode/key-order/number digest and the identity of old/new API
exports. Existing decision/snapshot reliability tests pass. Observability's
original TS validation/digest checks pass; its Go invocation hardcodes an absent
/usr/local/go/bin/go, so the same real fixturecheck was run successfully with the
provisioned Go1.24.13 executable instead. No substitute Go implementation was used.

Prism's exact root export is also admitted after traversing its entire generated
validator graph. Four precise external files are admitted only from that graph:
Ajv ucs2length/equal, ajv-formats formats, and fast-deep-equal index. Their actual
Node resolution must match the audited files. The one static CJS edge (equal to
fast-deep-equal) is traversed; helpers still reject IO, globals, dynamic loads,
aliased loaders, module loader access, and arbitrary relative CJS dependencies.
Negative helper fixtures prove those denials. Ordinary registration ESM policy
is unchanged. No runtime Ajv compilation or new code-generation shim was added.

Prism archive verification now dispatches text to SDK sha256Text and binary
buffers to SDK sha256Bytes. The regression verifies Uint8Array and Buffer offset
views, the empty-byte digest, and unchanged text bytes. SDK original tests/build
pass. Lint original checks and live-function pass with provisioned ShellCheck and
shfmt; without those tools the existing real test correctly reports blocked.

The actual Prism stage graph passes. The ingress author relocated its newly added cross-package test independently.
The boundary check now reaches review/review-prompt-budget.ts, whose tiktoken
import differs from the existing approved js-tiktoken dependency. This is reported
to the parent rather than granted access in this change. The overarching
verify:plugin-system-v2 command passed SDK generation check, all plugin builds,
sandbox build, runtime typecheck and plugin-v2 contract validation, then stopped
before boundary verification at check-plugin-agent-output-contracts.mts, whose
import of buster/plugins/test-agent/src/protocol.ts no longer resolves. Both
unrelated blockers are reported to the parent; neither is bypassed.
Touched-code ESLint passes except the pre-existing verifyBaselineArchive
complexity of 35; only its hash import/helper changed, not that function.
