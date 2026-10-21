# Independent finite custody review — pre-correction

Candidate HEAD: 0e35889a3c4e65d5c47ba88e924611aace67eb1d. Read-only reviewer; no repository edits or checker execution. Report is outside repository. Applied exhaustive-source-review/SKILL.md and its counterexample/evidence-contract notes.

## Verdict

FAIL, coherent finite metadata correction required. The current new operation is semantically a documentation-test fixture consumer and can be admitted after exact semantic requalification. No generic interpreter, glob expansion or file-wide product exemption is warranted.

## Findings

1. `reviewedRootNodeEntryRecipes.entries["scripts/tests/docs-tree-boundary.test.mjs"].declarations` omits one current top-level ForOfStatement. Its syntax digest is f72b3d6f1b7dd41cc4956f407c5a5b1d3a59240f29464d529bb92dcb082a365b. All previous declarations remain unchanged and ordered. The first observed local Helm failure correctly rejects that missing receipt. This is current source drift, not a TypeScript AST/version normalization problem.
2. The same entry terminalPurpose is stale (claims operations only through line529 and omits the ten-checker loop). Renew purpose/limits to expressly bind the ten literal checker/page pairs, copying actual source into a new isolated fixture, retained read-edge assertions, and changed-source revocation assertion. `documentationSelectorReceipt(documentationExecutableSelectors(...))` is exactly unchanged: no added or removed selector. This is because the new nested test registration is beneath a ForOfStatement, not a top-level ExpressionStatement. Full declaration coverage, not selectors alone, seals it.
3. `reviewedRootNodeEntryRecipes.closure` for `scripts/docs-tree-boundary.mjs` is stale too. Its units and ranges describe the 936-line former file, whereas the current file has the new `reviewedStandaloneDocumentationTools` initializer plus extended canonicalDocumentationTooling. Registered parseTreeArguments is line29, now45. Selected initialization comparison is false. Therefore renewing only the test receipt leaves a mandatory caller blocked at the next closure predicate. Renew all exact affected tree units/ranges/initialization after semantic qualification; do not remove closure checks. The tree executable-role selector comparison is also unchanged; independently check its operation-fact digest and child authority, whose purpose is distinct from selector identity.

## Complete owning test read and semantic path

Read the complete owning test file in nontruncated chunks 1–215, 215–435, 430–end (including overlap). Imports: builtin assert, child_process, fs, os, path, node:test; named atomicWriteTreeOutput and parseTreeArguments from docs-tree-boundary. sourceRoot is fixed to the owning file directory two levels up. run invokes execFileSync with explicit fixture cwd and UTF-8, captured output only when requested. write creates directories under the explicit root and writes fixture bytes. failFileSystem injects only one selected write/rename failure. fixture creates a new tmpdir, copies the tree CLI, transition module and gates module, creates canonical/legacy documents, initializes/commits a synthetic Git repository, captures baseline, moves legacy source, bootstraps/generates/checks classification. mustFail requires the actual child check failure to contain the expected diagnostic.

The entire remaining test corpus is fixture-only: missing/ignored docs, atomic inode/content/temp preservation, CLI modes/no writes, symlink traversal, parity roots, direct/indirect/structured input carriers, provenance-only references, untracked/composed/aliased/ASI/template readers, diagnostics, executable YAML, SHA256 Git trees, canonical docs validation, deletion/baseline checks, exact SDK docs-test namespace and its outside/legacy negatives. None exports a product API or publishes maintained product configuration. Generic imported atomicWriteTreeOutput accepts an explicit root and remains independently subject to ordinary source analysis; it is not granted test-only immunity.

The new loop enumerates exactly ten checker/page pairs: extension-class→extend/README; contract→extend/developer-handbook; plugin-manifest→extend/plugin-catalogue/kubeclaw.lint; provider-registration→reference/buster-provider-configuration; fixture-registration/report-registration→reference/buster-suites; capability-policy/registrations/vocabulary/registrations-controls→reference/capabilities. Each callback creates a fresh fixture, writes a synthetic canonical page, bootstraps its classification, reads the actual maintained checker bytes from sourceRoot, and copies them to the fixture. It does NOT import or execute the checker. The only child remains the copied tree CLI. It reads generated inventory and asserts canonical classification, genuine executableConsumers inclusion, and consumers.inputUse. It then appends a genuine productConfiguration read to the copied checker and requires canonical-input rejection. This is a positive-preserved-edge / changed-source-negative control, not a promise that checker drift semantics execute against the deliberately minimal page.

## Actual producer/import/child/receiving behavior

Read complete docs-tree-boundary.mjs, complete docs-parity-transition.mjs (revisited initial truncated portion as 1–125 and 120–180), complete 13-line docs-parity-gates.mjs, and complete ten checker files (revisited the initially truncated final three individually). The standalone sources genuinely validate reader content against registry/interfaces, SDK and pipeline contracts, plugin/schema manifests, provider records, E2E policy, report declarations, validated platform grants, registration capabilities, and vocabulary. Registrations-controls copies manifests/page/checker to a separate tempdir and runs only the declaration checker with restored-positive, changed-input and malformed-input outcomes. These purposes justify their exact canonical-page validation exception, not product-input roles.

Tree sourceConsumers records read edges; executableConsumers retains standalone script edges; canonicalExecutableConsumers filters only inputUse edges whose sources are not canonicalDocumentationTooling. The new exact table requires safeTreePath and an actual full-file SHA256 match. Appending productConfiguration therefore revokes the canonical-only exception. No consumer edges are erased. Legacy/deletable document checks still use the independent executableConsumers and indirect dependency paths, so this new canonical exception does not legitimize legacy executable input. safeTreePath checks path normalization and symlink components. CLI root is file-location-bound. Importing the tree module initializes constants and imports transition, but main is script-identity guarded. Transition approvedDocumentationDeletions immediately returns empty sets when no committed approval exists, as in these new fixtures; historical worktree/npm/readiness replay remains a separate branch, not exercised by the loop.

The qualifier checks actual package bytes and caller inventory, reviewed caller identity, native npm/node/shell authority before cache reuse, package public-entry nonreachability, export absence, exact declarations/selectors and closure. Cache key includes selected source bytes and all closure bytes. Caller is exactly docs:tree:mutations with four explicit native --test paths. output-discovery syntheticNodeTestSources consumes the selected set; nodeProductExecutableSources excludes qualified harness roots, while documentationModuleGraph rejects any later import/dynamic/public admission of a synthetic harness. This is caller-qualified acquisition, not globally approved source behavior. Read the finite qualifier and receiving discovery functions, not the entire unrelated 26K-line recipe corpus.

## Expected output effect and safe correction

Admission should restore config/localHelm discovery of this mandatory test caller without introducing product API outputs. New loop outputs only temporary documentation-tree inventory/classification/baseline fixture files, child diagnostics and assertions; copied checker bytes are fixture source inputs. Renew the one declaration receipt, semantic purpose text, and current tree closure metadata, plus independently affected operation facts if present. Preserve exact caller, source export/public-entry and native authority guards. Then rerun owning tree mutations, finite custody guard controls, config/localHelm qualification, and fresh output comparisons. A zero-status isolated receipt comparison does not establish whole-pipeline acceptance; current raw local-helm failure remains historical evidence until a fresh full result completes.

## Frozen reviewed inputs

- test: 1f045e306575b2df32f9fc574b4f29c773cfa0c1489286441229a36853be348d
- tree: ee1487ec2e081cc6630ac7869895bd69f3251e0c44ffd8877e574b335981ae52
- transition: ec822cb8788a05b2d054d947d2221ffbdb59df86f925ab3bae947bd963394a19
- gates: 07029087fdb45199b916ab684d49b04fc9c779420d861a075802720b5ef0d92f
- custody: 283e76bfc3f39a91a6cf38889b00441326d71423a559eeb159f62fcac336e8df
- discovery: 53f86c84a0e8ff3bd666060c7719b35c6b47be93f11913f21ccda9afebcf63ed

No AP09.11/12 publication/reference gate verdict supplied by this bounded review. Await authored correction for independent rereview.

## Independent affected-scope rereview — authored correction

Source verdict: PASS for the exact two-file correction reviewed. Full git diff contains only one additional root test-loop declaration, renewed semantic purpose, and the tree closure metadata plus two warm-cache negative test cases. No selector, caller, native-acquisition, cache-key, export/public-entry guard or generic discovery logic changed. The prior complete source-purpose review remains applicable because those owning implementation/checker inputs are byte-identical. Re-read the entire api-output-node-entry-custody.test.mjs and all changed recipe fields.

The corrected test entry has55 exact declarations. Independently compared every44 tree closure units for exact kind, line positions and syntax digest, every7 ranges for byte digest, and the16 initialization receipts; all match actual source. The new constant and canonicalDocumentationTooling/build changed definitions are explicitly represented. Independently recalculated ordinary tree operation facts digest:4d04b1bf3ba93e1f69085c27a4a7604506487253e47ff53b71fb5d6b62b15d5b, exactly unchanged; no blanket digest renewal is needed or made.

New negative1 warms successful qualification then changes the preserved executableConsumers assertion within the new loop; exact declaration qualification rejects it on same-root reuse. Negative2 warms qualification then changes the first exact standalone checker binding to64zeros; tree closure qualification rejects it on same-root reuse. Both mutate actual fixture bytes after cache population, not a candidate-reloaded expected baseline. Existing product-neighbor, import/public-call, exports, glob controls remain intact. Parent's actual custody-tests.txt is terminal7tests/7PASS/0FAIL. local-helm-after-custody.txt was still empty at this rereview snapshot; no full localHelm/pipeline success is asserted.

### Exact preservation intersection

Queried the current matrix completionRecords with verdictPASS whose literal sources array intersects the two changed files. Exactly five match custody.mjs; none names api-output-node-entry-custody.test.mjs. The five records are:
- AP09-complete-static-reader-search-20261021 — PUB-002
- AP09-search-reader-gate-20261021 — A912-04
- AP09-rendered-source-bounds-gate-20261021 — A912-09
- AP09-complete-same-source-code-preview-20261021 — PUB-004
- AP09-complete-responsive-reader-layout-20261021 — A912-07

Narrow preservation verdict: PASS for those five historical scoped verdicts at this correction. Static search/page inclusion, synonym ranking, rendered immutable Source-location checks, same-source previews and responsive layout implementations/content/assets did not change. This patch restores exact evidence for finite existing documentation harness purposes; it cannot introduce new publication pages, search terms, HTML/CSS, SVG or snippets, and it strengthens changed-source cache rejection. Prior role/public-entry limitations remain enforced. Their historical scopes, checks, claims, review identities and limits remain historical, not fresh executions or broader acceptance. Preserve original snapshots, append an explicit narrow impact review if rebinding source identity, and do not silently rewrite old raw evidence. Do not treat stale historical limit strings as newly rerun/current blockers or as a new acceptance of previously excluded gates. The five-record direct intersection is not a blanket matrix renewal.

### Exact corrected inputs
- scripts/docs-api-documentation-role-custody.mjs: 14550db1139f12271a10f3a9c9494cb614074b5755390af3a024c043e8ade204
- scripts/tests/api-output-node-entry-custody.test.mjs: d153dcce25143c0110d2848049492f23672760f43e3e5920995e3958585fb6f6
- docs/blueprint/documentation-completion-matrix.json: acbeadd56a01d268ce48e774154d8b05a13c10d08b9a9dc3f70a7cab28716b4b

### Remaining reference/publication gate triage (not whole-gate acceptance)

Read current AP09 acceptance-contract sections9/10 and current A911/A912 gate/record scopes. A91101/02/04/05/06/07/08/11/12 remain not-accepted; A91103/09/10 accepted. A91201/03/05/08/11/12 remain not-accepted; A91202/04/06/07/09/10 accepted. The finite custody correction alone cannot close exhaustive reference coverage, independent clean-checkout generation, redirect request behavior, six-field evidence consistency, human screenreader/fresh-context role usability, or dual-clean-build determinism. Those require their own complete role/effect evidence. No additional whole-gate review was represented as complete by this bounded correction review.
