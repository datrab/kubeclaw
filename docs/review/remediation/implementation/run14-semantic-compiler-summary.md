# Compiler and Summary semantic binding — incomplete checkpoint

The approved Review semantic design now has an explicit fourth compiler mode, genuine CLI creation opt-in, independent recovery and Summary expected-mode binding. Original one/two/three-argument compileProject results remain unchanged; legacy-import authoring definitions remain identical. No wrapper, arity-based inference or report/source-marker inference selects semantic mode.

Only a final Review produces the matching Summary final.reviewSemanticEncoding binding. Module-only, final-only, both and neither cases and both source modes roundtrip through actual graph/snapshot storage; missing/unknown/mixed/stray mode changes reject without rewriting saved bytes. New Summary mode requires bundle-v2/report-v3/governor-v2 and exact portable Artifact refs. Original both-unversioned Summary artifact-contract fixture remains admitted only under legacy expected absence; it is not mislabeled as an actual Review-produced report.

New Summary mode selection now validates before any artifact read. The report-builder additional root/reviewer counterexample is corrected: its plain snapshot JSON is validated before schema reflection, explicit unsupported versions reject, and legacy partial helper absence stays historical. The method-bearing surrounding owner input is not blanket serialized. Independent reviewer reports unchanged expanded eleven-case oracle passes on source 1595f98; final combined source is still unapproved.

## Original CLI assertion transition, not an assertion removal

Original check-project-compiler.mts first ran unchanged and failed only its full graph comparison between the newly explicit CLI semantic owner and the intentionally preserved default exported API. Full untruncated stderr is run14-cli-explicit-owner-before.txt. Root-approved correction changes only the expected new CLI compilation call to explicit source/report/semantic arguments, retains the entire deep graph equality and adds a separate assertion that old default API configs omit the semantic field. Original authoring import now additionally compares its entire definition to the unchanged old API. Additive compiler/recovery cases and original real CLI/import pass; raw run14-semantic-compiler.txt.

## Distinct Summary digest red — no unauthorized fix

The additive Summary child/test uses real original EffectCoordinator, disk FileEffectJournal and ArtifactStore. Other provider evidence is the pre-existing explicit artifact-contract fixture, not model/provider or full Review lifecycle proof. It creates admitted bundle-v2/report-v3/governor-v2 values, stores them using the real owning writers, then the original Summary validates and reads those same immutable refs under en and cs.

Both locales successfully pass the new semantic pair, ref, coverage and bundle digest checks. However the additional comparison of the returned delivery-manifest.v2 digest fails: en sha256:adee836993c1cd9c9ff09d496bdba1dffb285088fb4fd0caa3fe9dee0dc11830 versus cs sha256:7757bf621fed180598c3cb460d3016910dbc89cacef510924dd447dc0f6dd23e. Exact raw: run14-semantic-summary-before.txt. The assertion remains red; it was not weakened, skipped or converted into acceptance.

A real separate owner is located: project-summary/src/stage.ts persists this value with original put_json, and remote-test-gate/src/evidence-adapter.ts assertManifest recomputes its digest before downstream Demo evidence acceptance. This run has NOT yet executed that downstream adapter on a stored generated manifest. The source callpath is therefore distinguished from the executed returned-digest comparison. No delivery-manifest codec/schema/producer/reader source was changed, and the Review selector was not silently broadened.

This distinct Summary consumer test is not the safety-flagged helper fresh-producer execution. That unavailable boundary has not been retried, rephrased or rerouted. No candidate fresh policy/lean/audit green proof is claimed.

Next action: preserve this source/raw checkpoint and refresh the metadata-only MAIN advance; implement only the independently approved bbb072 policy/generated-evidence extension. Keep the separate delivery-manifest owner candidate open pending actual producer/storage/consumer binding evidence and separately reviewed design. Complete remaining allowed independent/native gates without treating static checks or partial successes as closure.
