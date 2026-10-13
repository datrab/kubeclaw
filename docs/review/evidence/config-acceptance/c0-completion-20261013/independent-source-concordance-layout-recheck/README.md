# Independent bounded source-concordance / author-layout / entry-contract recheck

Reviewer: fresh native task `/root/source_concordance_layout_recheck`, 2026-10-13.
Checkout: `/home/node/.openclaw/workspace/kubeclaw-config-c0`;
HEAD/base comparison `a0d5588c4b4a9944d3c9e98140f1223d77bf5af3`.
Current reviewed corrections are working-tree artifacts, not a committed implementation.
Read GOAL-START.md and OPENCLAW-CONFIG-GOAL.md first. Author conclusions were
challenged against actual JSON bodies, git baseline bytes, and productive source.

## Verdict

**BOUNDED VERIFIED**: CANONICAL-JOIN-001 association correction and its parent
integration; G2 physical-author correction; proposed C1 entry/profile wire is
coherent at definition scope. No material blocking finding in this bounded recheck.
This is **not global C0 acceptance, package approval, runtime acceptance, or
implementation authorization**. No original result is promoted or reclassified.

## Exact conservation and integration observations

| Independently computed check | Result |
|---|---|
| Original candidate IDs / body SHA256 identities | 358/358 retained in original order; 358 bodies recomputed from named original definition inputs, zero mismatches |
| Corrected versus original concordance records | 7 changed, 351 byte-equivalent parsed records |
| Setting-link removals / additions | 41 removed, 0 added |
| Corrected associations / distinct settings | 507 / 281 |
| Linked / explicitly unmatched candidates | 262 / 96 |
| Overlay original candidate-ID order | Exact 358-ID match |
| Overlay by-setting associations | All 507 candidate/relationship/witness tuples exact; 281 setting keys exact |
| Original setting digests / inventory pointers | 281/281 exact; zero pointer mismatches |
| By-setting original case references | 1,354 references, exact original per-setting case sets/digests/status metadata; zero reciprocal setting membership errors |
| Corrected candidate-to-case multiplicity | 2,241 (distinct from deduplicated by-setting references above) |
| Canonical inventory / matrix / requirements | 2,409 rows / 6,845 cases / 50 requirements conserved |
| Canonical roots against git baseline | Only `currentSourceConcordance` added; every other property, row, case, requirement and authorization unchanged |
| Canonical concordance references | Both roots identical; overlay file SHA256 current; overlay points to current corrected concordance SHA256 |
| Original 80 whole-file input identities | 76 still match current bytes; 4 intentionally superseded roots/drafts match their exact git-baseline bytes |
| G2 original physical target contracts | All 177 affected setting targetAuthorRef objects/path mappings agree exactly with unchanged canonical originals |
| Historical pre-layout draft preservation | Both scope.json and config-c1-package-current.md exact prior git bytes |
| Initial complete profile source/settings digests | All 7 profiles exact: six standard owners plus complete Buster runtime |
| Initial settings versus staged C1 owner schema required/unknown member sets | All 7 have zero missing/unknown differences (static structure comparison, not runtime validation) |

Canonical JSON digest comparisons use UTF-8, sorted keys, compact separators and
unescaped Unicode (`ensure_ascii=False`) for overlay original rows/cases. Candidate
body hashes were independently recomputed using their original documented encoding.
The four historical whole-file changes are scope.json, config-c1-package-current.md,
config-semantic-inventory.json and config-acceptance-matrix.json. Their expected new
root/draft bytes do not invalidate unchanged original row/case bodies. No finding
was manufactured by demanding old whole-file hashes of intentionally changed roots.

## Actual source-domain challenge

Read actual `skills/common/plugins/openclaw-agent-observer/src/config.ts` helpers
and complete resolver return object, rather than treating its containing file as
one shared domain. All **61 resolver-helper associations** were checked:

- boolValue: redisTls only (1); requiredBooleanValue: enabled only (1).
- stringValue missing/empty normalization: exactly redisHost/redisUsername/redisPassword at each of two witnesses (3 + 3).
- positiveInteger missing/bounds: exactly eight actual positiveInteger callers at each of two witnesses (8 + 8); maxEventBytes uses its separate generated normalizer and is not included.
- positivePort: redisPort at each of two witnesses (1 + 1); integerValue: hookPriority only (1).
- configuredValue and complete resolver return: the 17 actual returned fields at each witness (17 + 17).

All **15 fixed-role replica/resource associations** were checked against the actual
`range $name := list "control" "studio" "worker"` in
charts/prism/templates/workloads.yaml:13, replicas:22 and resources:138: exactly
three replica members and twelve CPU/memory request/limit members. Ingestion is
outside that loop, not a permissible fourth inferred role.

The nine corrected role-image links use the same three-role loop, the exact
repository/digest members read by prism.imageRef in _helpers.tpl:3-4, and the
separate pullPolicy render at workloads.yaml:79. Four other imageRef calls in
backup.yaml:56, ingestion.yaml:20 and jobs.yaml:27/45 read only repository/digest:
pullPolicy is no longer falsely attributed to that helper. The retired lease guard
in kubeclaw/_swarm-config.tpl:270-271 iterates only leaseApiGroup/leaseApiVersion;
the other 34 parent-subtree links are removed. Its two retained component links
express the precise retirement/authoritative-field relation, not consumption of
the entire broker object. `_buster-native.tpl:4-5` checks exactly nodeName,
namespace and policyDigest, so its three associations are retained with exact
validation witnesses. The removal arithmetic is 3 + 34 + 4 = 41.

## G2 and proposed wire coherence

Read actual current swarm.schema.json, swarm-components.schema.json,
swarm-bundle.ts and current author documents, plus the six staged
components/batch-15/schemas/C1/{owner}.schema.json files. Current production is
still swarm-entry.v2 / swarm-component.v1 with fixed sibling filenames; the loader
currently captures basename file identities. The proposal explicitly evolves that
boundary rather than asserting v3 already works.

- Sole composition root: config/pipeline.config.json, pipeline-entry.v3.
- Sole physical owner authors: config/components/{owner}.config.json for exactly
  six known owners. Buster standard/runtime are complete settings profiles in
  the same physical buster-engine author, never a second editable runtime file
  or a keywise merge.
- pipeline-component.v2 envelope matches actual staged C1 `{schemaVersion, owner,
  profiles}` / complete `{settings}` owner schemas. C3/C4 additive staged policy
  fields are not silently imported into value-preserving C1.
- Current fixed profile/features/tuning/empty overrides metadata is retained;
  tuning.retention=high is not invented as an adjustable duration.
- Explicit `(role, owner, instanceId)` identity selects exactly one named complete
  profile. No first/default profile, defaults/coercion or new-start old-author
  fallback is admitted. Missing or incompatible selected installed-role relations
  must reject, rather than fabricating a plugin/role grant.
- Contract profileId names are a narrower lower-case subset of the staged owner
  schema's broad fixture-name domain. This is coherent for standard/runtime;
  local-A/local-B remain test inputs, not inferred deployed bindings. Publication
  must honor the explicitly chosen selection domain, not infer compatibility from
  a fixture name.
- All owner files and all declared profiles must validate before publication;
  fixed six refs, owner identity, safe relative paths and symlink/escape rejection
  remain normative obligations. No arbitrary include system was substituted.
- Same immutable root+components generation must reach both real Charts and all
  consuming images. Relative-path+SHA+selected binding/profile identity explicitly
  corrects current basename-only identity for nested components. Read-drift,
  no-follow/regular-file and freeze properties remain required.
- SWARM_CONFIG stays an explicit mandatory transport locator, now pointing to
  /etc/kubeclaw/config/pipeline.config.json, not a second settings authority.
  Current Helm/native callers still use the old location; the proposed package
  correctly requires their inseparable future migration. Authentic historical v2
  closure is separated from forbidden new-start fallback; C5 durable module/run
  binding remains separate from C1 service startup.

These observations check proposal coherence, not delivery of the future code.
They do not demand unapproved implementation or native deployment proof.

## Verification method, identities and limits

Read-only commands: rg --files / bounded source reads; inline Python JSON/hash/set
and member comparisons; git rev-parse HEAD and git show a0d5588c4:<path> for original
canonical/history bytes. No project tests, source edits, schema edits, credentials,
API/deploy operations or new persisted validators. Only this README was written.

| Reviewed artifact (relative to evidence base) | SHA256 |
|---|---|
| independent-canonical-source-join/source-canonical-concordance.json | 19f182e1aac16037e4a2dac7666d9414762e02019681bb940e1ef4823247bfe1 |
| independent-canonical-source-join/correction-01/corrected-concordance.json | e817b509fc7491bf997db78dc5d7916467ab41525cbd9aa3ab07f8fb1354351e |
| integrated-source-concordance-01/overlay.json | 93973f2892bf1adc1c6bd7f3aab8e5ddfc39fe67a9fc323c69103e43ac51ffe4 |
| c1-package-draft/scope.json | a612f10014bbd0a77e139fba22f93f7d4893145385e069d693cfc1e1f4cfc0c9 |
| c1-package-draft/author-layout-decision.json | 4ad059b3d2aa31fabcfb3631a8ddd53f431c452c1decaa3ee592f23a20ede13b |
| c1-package-draft/entry-profile-contract.json | 822128919e9445478b9e70e2aed01d4cb5fbd0e6d8709cd26f976261e33c3b1c |

Remaining parent obligations are unchanged: disposition of all 96 explicitly
unmatched candidates; completion/review of all 229 C1 selected case specifications
(the draft selects 160 canonical settings and 229 cases, all 229 unresolved);
full C0 source/authority/activation/module and delivery/package contracts and fresh
full-scope independent review. This report does not satisfy those obligations.
