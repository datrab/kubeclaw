# Independent same-entry engine binding review 02

## Bounded verdict: SEEB-R01-01 CLOSED

The additive `same-entry-engine-binding-02` correction resolves the supplied-current-Security-owner defect identified in the immutable independent review 01. No new material finding was found within this correction's finite definition scope. This is not whole C0, implementation, native eligibility or activation acceptance. The complete physical v7 root and its prior requirements remain frozen in `same-entry-engine-binding-01`; supplement 02 replaces only the stale admission helper/projection behavior, not that root, its schemas or configuration writers.

## Actual causal correction

The corrected `check-correction.mjs:18` obtains `securityOwner` from the supplied current owner override or existing physical owner, schema-validates that document, then constructs `currentSecurity=inheritedSecurity({owner:securityOwner,root:original,assoc,decls,componentDocuments})`. That same helper evaluates all current owner profiles. At line 23 its entry closure evaluates the current root tuples against that owner and the actual supplied component documents. No stale `security.entry` call remains in admission. The old top-level helper remains available but is not the helper used for this path.

The unchanged source-extracted `entryErrors` checks five registrations, unique common package instance/profile/ownerPath/service, current `owner.instanceId`, current selected profile existence, registration declaration/kind, exact Buster/WorkerCore service bindings and roles, selected component/resource profiles, native-resource projections and each registration's required capability ceiling. Captured component owner paths and native-resource association are explicit source/receiving concordance witnesses, not an invented generic grant or universal policy restriction. The actual receiving closure consumes supplied component overrides; it does not treat a profile-label string as its resource witness.

`check-correction.mjs:25` derives the returned selected Security registration policy and semantic `admittedOwnerSha256` from that same admitted `securityOwner`. A valid selected processing change therefore changes the returned policy and whole-owner digest. A valid unselected processing change changes whole-owner digest while the selected A policy remains selected. This does not replace the frozen root raw SHA or the length-framed input-generation codec with the semantic owner hash: those remain separate identities. Alternate supplied owner probes are definition examples, not authenticated new source/transport receipts or finalized new physical generations.

Whole-generation validation still precedes authorization of one requested tuple. The unchanged discriminated selector rejects composite/unknown/cross-scope requests and returns only public structure with `activationAllowed:false`. Root/package/profile/source concordance is a local admission requirement despite that activation prohibition.

## Decisive replay and original contrast

After reading the full correction README/contract/checker and diffing it against the original collector, the inspected existing pure collector was replayed directly, with output only in this review directory: **1,565 observations, zero reported failures, exit 0**. No production module was imported. The imports are builtins, existing Ajv/YAML and the frozen copied source-specific inherited functions/recovery relations. No provider/native/CLI/transport effect occurred.

Both schema-valid prior counterexamples reject during generation, before each of controller, original Provider, launcher, recovery and Security-provider resolution (ten causal rejections):

| Current Security owner override | Correction result |
| --- | --- |
| Foreign `instanceId=foreign.actual.owner` | `SECURITY_SERVICE_CLOSURE:wrong-package-instance-profile-kind` |
| Delete selected `profiles.A`, leaving other valid profiles | same rejection |

The stage predicate explicitly requires rejection while still in `generation`, not a later missing caller or failed authorization result. Complete current-owner positives admit all five scopes, still activation-forbidden. Selected and unselected denied-header profiles reject before all five scopes with the actual resolved native `HTTP_RESPONSE_HEADERS_INVALID` boundary. The 163 complete Security entry contexts are admitted with the supplied whole owner, not merely counted. The inherited 22 Provider and 22 Prism full contexts remain exercised.

The independently retained original seven-probe script's exact definitions were replaced only with the corrected definitions, preserving its original narrow variants and input base. Its new raw output rejects both Security variants, while original review 01's frozen output still records their historical admitted outcomes. The Provider foreign instance/missing A, Prism missing selected profile and Chart key/profile contradictions retain their original rejecting errors. Historical failure/observation claims were not rewritten.

Current wrong service, wrong ownerPath and wrong role controls reject at Security receiving closure. The author's emptied capability array and increased maximum response ceiling controls reject earlier at schema, so those two observations alone are **not causal proof of the downstream source closure**. Two independent narrow controls preserve schema admissibility: remove the required header capability while retaining the other nonempty capabilities, and reduce the native response ceiling by one within its supported numeric schema domain. These reject respectively with `missing-declared-capability-ceiling` and `wrong-captured-native-resource-projection`. This confirms the supplied component/resource document participates in the unchanged actual source closure; no broad validator or additional test framework was introduced.

## Preserved full-v7 material boundaries

The correction adds no owner/schema/profile writer, new root generation, installed package instance or new routing implementation. The unchanged 120-member input codec, root raw identity, receiving schema/view bindings, unsealed receipt, proposed two read-only S outputs and physical author tree are still those reviewed in 01. No stale v5 root context or new implicit Gateway02/Browser dependency is introduced.

The preserved header helper retains source preset/remove/replace/add resolution, actual native catalogue and 32 unique requested-header boundary, content-length exception and possible added content-type yielding 33 returned names. It does not impose a total 32-rule cap on legitimate 64-rule/few-name compositions. All 158 full Security profiles, supported original domains, caps, per-rule semantics, evidence baselines, five registrations, requirements/lifecycles and 25 unsupported alternates remain unchanged. Quiet providers still do not promise a produced log. HTTP nginx/service:80 is not an authentic HTTPS producer; authentic HTTPS/role/namespace/grant/task prerequisites remain outstanding where required.

The 156 current Provider/Security field nodes, 1,114 member edges, eight typed v2 arms and original root/service/schema joins remain physically exact. Provider deadline/default/ceiling ownership, Nova whole-run captured caps, native body/request/response boundaries, source-budget processing contracts and missing supplemental coordinates retain the prior bounded review's qualifications. Prism's 12 original fields/13 cases, all 22 whole-entry contrasts, separate existing engine owner, Control same-J capture/SQL claim authority, absolute task clock, CLI/termination/cleanup relations and source/mount/role dependencies are unmodified.

Original nine bindings and four Provider contexts survive. The same Buster owner gains exactly the two already frozen Security profiles; no other old owner property changes. The C1 eight-old-file movement remains one root/six component destinations plus the separate existing Prism owner, not the Security fixture roster. Actual source/image/mount/render/native readers remain unimplemented as documented. The extra Security service is structural future migration only; current registry/profile/capability consumers do not install or route it. Original caller/fence/clock/grant/store/frame/source/trust/secret/output/epoch/archive/FD9–FD10–11/effect requirements remain mandatory. No private ledger, composite grant or “latest A” substitution is accepted.

## Fresh independent conservation

Independent body/node inspection and reread in `capture.py`, rather than author counters alone, establish:

| Check | Actual result |
| --- | --- |
| Original field / case bodies (including retained native body references) | 168 / 1,008; zero mismatches |
| Actual current owner/receiving field / member nodes | 156 / 1,114; zero mismatches |
| Original manifest / inherited source-input pins | 377 / 465; zero mismatches |
| Actual source copies versus live source | 42; zero mismatches |
| Original bindings / Provider selections | 9 / 4 exactly conserved |
| Prior entire Buster object minus only two additions | exact |
| Correction's frozen base/review pins / correction manifest | 962 / 11; zero mismatches |

Lossless frozen input copies, per-path byte/source/tool identities, raw replay and both probe logs are retained beside this report. Node v24.21.0 and Ajv 8.20.0 match the previous review, with executable/entry hashes recorded. All replay/probe/capture commands exit 0 and stderr is empty. Productive/native cases executed: zero. The author's earlier pre-policy-projection output is preserved as history, not the final receiving-policy result.

The final `end-input-stability.json` records every input rehash and HEAD separately. Changes to unrelated repository navigation or other work would not silently supersede these frozen dependencies. Only this new independent review directory was written; canonical, source, schema, tests, author and historical packages were not edited. No provider, gateway/browser, process CLI, PG/Helm, network/API, credential, native or Eval activation occurred.

## Closeout scope

SEEB-R01-01 is closed for this explicit additive correction. The immutable independent 01 report remains a truthful rejected historical generation observation. This receipt may support an explicit bounded dependency integration; it does not automatically accept whole C0, current runtime implementation, any other package/generation or original native effects.
