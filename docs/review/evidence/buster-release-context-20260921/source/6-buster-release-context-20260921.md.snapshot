# Buster native release rendering context

Preimplementation acceptance:

1. The selected-release renderer must carry the explicitly provided Buster native
   node, namespace and policy digest into its baseline, matching the existing
   Prism context treatment. No image, bundle or arbitrary overlay field enters
   the baseline through this channel.
2. Missing native binding, mismatched namespace and mutable image references
   remain rejected by the actual chart. No production node default is invented.
3. Original release/GitOps cases and assertions remain. Their rendering-only
   fixture binds Buster to its own explicit test node policy; fixture values are
   not represented as executed host-preflight evidence.
4. Run both complete original modules, preserve the prior failure, and exercise
   a negative restoration of the missing Buster-context branch.
5. DOC: explain that immutable image selection is topology independent, while
   rendering/export requires the generated operator native overlay. Actual
   deployment still requires the existing host/runtime preflight before mutation.

The regression was observed in the Studio integration run: three GitOps cases
and one immutable-release rendering case failed at the new mandatory Buster
binding guard. The guard is correct; the baseline context and legacy rendering
fixtures did not yet supply the new role binding. Source baselines are retained
under `buster-release-context-20260921/before-identities.json`.

Implementation complete; independent review pending.

The baseline now carries the three explicitly supplied `busterNative` identity
fields. Registry context remains unchanged and no other values are copied.
Immutable release materialization still invents no topology. GitOps activation
also invokes the existing Buster deployment selector on the exact committed
Buster resources before invoking the host preflight, alongside Prism's existing
check. The actual exported bundle is checked for the fixture's computed policy
digest and exact node affinity. Missing/wrong-namespace overlays fail without
publishing a bundle; a valid-shaped wrong digest is exported and committed, then
rejected at activation before the host-preflight call. These are rendering and
preflight-composition tests with explicitly modeled external observations, not
claims that a host was admitted.

Both complete original modules plus the new export negative test pass 9/9 with
no skips (`original-tests-final3.txt`). All original assertions remain. Existing
canonical complexity violations in `validateBundle` (27) and
`bootstrapDocuments` (22) were preserved in before logs and resolved through
specific bundle-revision, bundle-selection and bootstrap-address helpers. The
Buster deployment checker similarly separates image and capability validation.
The complete five-file scoped lint passes (`lint-final4.txt`).
`verify-extraction.mjs` expands helpers only after checking their exact arguments,
then compares full non-trivia token sequences, including literal contents and
statement order, against the saved original functions; all three comparisons
pass. It does not substitute for the real Helm/GitOps tests.

Two runtime-only controls leave production files untouched: removing Buster's
baseline context reproduces the actual mandatory-binding Helm failure; removing
its committed-resource preflight produces a real missing-expected-exception
assertion in the wrong-digest activation case. The test fixtures provide neither production defaults nor executed image,
node or deployment evidence. Buster BP/IFR16 and the broader remediation findings
remain open. Operator instructions for supplied Buster context were added to the
native-worker host-pool runbook.
