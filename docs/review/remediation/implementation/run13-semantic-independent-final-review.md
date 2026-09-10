# Independent semantic implementation review — bounded source accepted, integration held

Run `20260910t035412` began from the freshly read remote integration head
`e644a79fddd4d4d686fbd351b6edaec5575caf57`, tree
`64df9214237107c027b27caf4d5f75f27a222f51`. The mandatory resume documents,
current register and historical register at
`c38779c71bb92bc15c3fcb89930348e5417aa475` were fetched from the remote
repository before review. The historical set contains exactly 47
`implementiert` IDs; it is identical to `partial-47-scope.json`, every
original `source_finding_text` remains unchanged, and the current register
contains eight `verifiziert` plus 39 `implementiert` items in that set.

## Exact reviewed source and author evidence

The independently fetched source checkpoint is
`eba514b72993e4d4d686fbd351b6edaec5575caf57`, sole parent
`f92d3f9f1bb68734d551c3196b02362bc682d5b9`, tree
`ffa0439473012775eca2fc267fa906886be7c44c`. The tested checkout has that exact
tree and is clean apart from the two review-only history tests added by this
reviewer. The final author checkpoint
`15f6a808ed1666c3b7a2a3909749e3d4ee377904` has sole parent the current
integration head, tree `9c0e967294c2000a6ac2ac8264e4f01ea568c22b`, and
4,122 non-tree entries. Comparing all 1,694 non-documentation/non-test entries
shows zero blob, mode or type differences between the final author checkpoint
and the exact reviewed `eba514b` production tree.

The complete author report and five raw files were fetched from the remote
checkpoint. Their byte counts and SHA-256 values independently match the report:

- full unchanged Review package: 38,066 bytes,
  `a3aeea632a7ca33742ff365fd6afb3275d62a7f93d5c2be44553bdcbd2219632`;
- archived CLI probe: 815 bytes,
  `44a28e86f4c35f722eafda7d4c4448ed0e5265d8b8bf3bc222ba182499fe4980`;
- focused owner chain: 5,875 bytes,
  `01507db33ad7696068a126a0edd69ada67fb011dc1955b708231d32d3d432fdd`;
- Review/project-summary builds plus Nova typecheck: 427 bytes,
  `621a87b413930d9f559d78fdf4f9d930c681f5b0f638dfe600a30778e06c9dec`;
- phase-6 contract: 49 bytes,
  `0e6c2bd086b50c822a0ab8c4bd7606c5fe814f08657f43942f59fba989529848`.

The raw results contain the complete Review pretest/test/schema/coverage/posttest
sequence, the correct archived CLI probe, phase 6, all owning typechecks and the
27/27 focused owner chain, all with zero exit status and no skipped cases. No
author assertion was substituted for a raw result.

## Design and production review

The exact production delta conforms to the bounded design
`bbb07254936e59ad972e8525bbc4dda1a8df32dc` and its independent design approval
`8ee1f958057177b656d6bbd1f4f07ad395b0328e` in the portions that can be
established without the still-missing genuine producer gate:

- `review-semantics.utf16-v1` is an explicit Review-stage choice and requires
  the portable report encoding. It is not inferred from locale, source, cache or
  report markers. Omission retains the original bundle/governor/report versions.
- Policy inputs are JSON-admitted before field reflection. The selected mode,
  original candidate references and all source digests are held in private
  owner proofs. Verification receives an independently expected mode and
  recomputes the selected and provenance digests.
- Generated simplification facts and candidate-manifest bytes use the portable
  codec only under the explicit new mode. Existing logical schemas, policy
  values, candidate identity, ordering and legacy omission remain unchanged.
  The miner validates actual evidence bytes and digest before deriving source
  provenance.
- Snapshots and both governors reject invalid JSON before owned-field access,
  require the matching private policy mode, and bind the new bundle
  `policyDigest` before touching the invocation context. The task,
  verification and verdict consumers retain the same independent bundle/policy
  binding.
- Compiler, recovery and Summary use explicit paired semantic ownership; old
  compiler arities and unversioned legacy behavior remain available. There are
  no Worker Core, engine, provider or deployment changes in this package.

The prior independent checkpoint
`8ea539d74381c53791762400aa73609eb61ae51b`, preserved remotely by
`bc82098b2e5a0b345a32cf542d6cfee334ab7542`, already contains the unchanged
17/17 direct owner oracle plus original preflight pass against this exact
production tree. Its limits are retained: it is not a full lifecycle or native
producer proof.

## New independent execution

Three disjoint checks ran against the exact production source:

1. The unchanged semantic compiler graph test plus the original independent
   author-domain test passed 3/3. This confirms explicit module/final/both/neither
   graph ownership and rejection of mixed, partial, unknown and stray Summary
   modes without granting author input the selector.
2. The existing native report regression passed 9/9 through actual
   `EffectCoordinator`, `FileEffectJournal` and registered disk
   `ArtifactStore`. It covers portable CAS replay across four locales,
   archived untagged behavior, strict governor and Summary readers, genuine
   requested/accepted prefixes and no silent legacy migration. It is an
   unchanged old-domain regression, not a new semantic producer run.
3. A new independent semantic history test passed 1/1. It writes the paired v2
   bundle/v3 report through the actual Core and disk ArtifactStore, then reads
   the governor baseline in separate en-US and cs-CZ processes using
   `get_json_bytes` plus the complete portable reference. Both returned the
   identical baseline. The report/bundle are transformed artifact-contract
   fixtures; this proves the storage/history reader boundary, not fresh policy,
   provider or complete Review-stage production.

Complete output is in:

- `docs/review/evidence/run13-semantic-independent-compiler.txt`;
- `docs/review/evidence/run13-semantic-independent-legacy-native.txt`;
- `docs/review/evidence/run13-semantic-independent-history.txt`.

The new test source is
`tests/verification/reliability/review-semantic-history-independent.test.mjs`
with its separate-process child. No production file was changed by this
reviewer.

## Decision and remaining gates

The exact source passes bounded independent implementation review and the new
history-reader boundary. It still **must not enter MAIN** as the atomic semantic
cutover. The design requires a genuine registered current semantic producer
across en/cs and gate/lean/audit, persisted old/new bundle-report-history phases,
recovery and matched Summary acceptance. The saved native producer remains red.
A later helper action was safety-flagged and was not retried, rephrased or
rerouted here.

The separately demonstrated Summary return still has a locale-dependent
`delivery-manifest.v2` digest. Its owner/version change is outside this reviewed
source authorization and remains unresolved. Therefore this checkpoint does not
approve source integration, PCR-SDK-001 closure, register changes or any frozen47
completion claim. The durable next action is to complete independently reviewed
delivery-manifest ownership, then run the remaining authorized genuine
producer/history/recovery/Summary gates without weakening or substituting them.
