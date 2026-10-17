# Independent same-entry engine binding review 01

## Bounded verdict: NOT ACCEPTED

One material definition-level defect, **SEEB-R01-01**, remains in the proposed complete `pipeline-entry.v7` admission path: Security tuple admission uses the initial captured owner rather than the supplied current owner that was just schema/domain validated. The proposal therefore does not yet establish its promised all-owner/all-profile, current-owner/root/selected-profile concordance before resolving one requested caller. This is not a runtime authorization bypass: the pure public result explicitly sets `activationAllowed:false`, and no native effects were exercised.

This review concerns the frozen `same-entry-engine-binding-01` package and its explicit inherited dependencies, not whole C0, current production implementation, native eligibility, or approval to activate. Gateway and Browser are not implicitly adopted through current navigation or “latest” artifacts. Later separate Gateway work does not change this frozen v7 verdict.

## Exact finding SEEB-R01-01 — captured Security owner escapes supplied-owner concordance

### Source and causal mechanism

`same-entry-engine-binding-01/check-generation.mjs:14` constructs `inheritedSecurity({owner,root:original,assoc,decls,componentDocuments})` once using the stand's initial owner. At line 18, `validateGeneration(entry,overrides)` obtains the supplied `securityOwner` from `config/plugins/kubeclaw.security-providers.config.json`, schema-validates it, and evaluates `security.owner(securityOwner)` across its profiles. However, line 23 invokes `security.entry(entry,docs)` without that supplied owner.

The copied, source-bound `entrySource` in `inherited-definition-functions.mjs:4` filters package tuples and compares tuple instance/profile against the closure's `owner`: `t.instanceId!==owner.instanceId` and `!owner.profiles[t.profileId]`. `inheritedSecurity` at line 6 creates that closure from its original dependencies. Thus the owner used for schema/all-profile admission and the owner used for exact same-package tuple/profile admission can differ.

The selected original tuples are the five `kubeclaw.security-providers` registrations `headers`, `dependency-trivy`, `image-trivy`, `kubernetes-policy`, and `kubernetes-runtime`. All select instance `fixture.security-providers`, ownerPath `plugins/kubeclaw.security-providers.config.json`, profile `A`, and service `fixture.service.buster-security-runtime`. No tuple or service mutation is needed to expose the defect.

### Narrow counterexamples, using the exact existing functions

The independently saved `probes.mjs` copies the existing collector's definitions up to its first observation, retains its original input base and inherited helper imports, and appends only these finite override probes. It does not supply a substitute validator, execute a provider, or change author inputs. Every request is the original controller caller, demonstrating the defect at whole-generation admission before an unrelated original requested scope, not merely inside a Security-specific result.

| Supplied current owner change | Actual result | Required current-owner result |
| --- | --- | --- |
| No change | admitted, public structure only, activation false | admitted public structure |
| Security `instanceId = foreign.actual.owner` | admitted, public structure only, activation false | reject tuple/current-instance mismatch |
| Delete Security `profiles.A` (other valid profiles retained) | admitted, public structure only, activation false | reject missing selected current profile |

Both malformed generation associations pass the supplied owner's schema and remaining profile semantics. The preserved old closure makes them appear to have the old instance and profile A. These are material current-generation/source/tuple definition failures even though activation is forbidden.

Analogous exact-function controls reject: Provider foreign instance with `WRONG_PACKAGE_REGISTRATION_INSTANCE`; Provider missing A with `MISSING_PLUGIN_PROFILE`; Prism missing selected profile with `ENGINE_MISSING_PROFILE`; Chart profile key/id contradiction with `PROFILE_ID_KEY_MISMATCH`. Those controls do not establish every possible family relationship, but show the concrete Security regression is not a general interpretation that overrides are outside admission. The current Provider and Prism selected-profile paths actually obtain the supplied owner; the Chart relation actually checks the supplied profile.

### Effect and correction boundary

The defect affects the all-generation guarantee covering the integrated Security original 89 fields/587 cases and the complete 168-field/1,008-case root, even when the requested caller is controller. It does not modify original bodies or waive their requirements/effects; it invalidates the claim that this current owner was correlated with that root and selected profile before resolving a scope.

Bind Security entry/registration/profile/capability/resource closure validation to exactly the same supplied owner document used by schema and all-profile validation. Passing the owner explicitly or constructing an owner-bound helper per admission are possible concrete approaches. Preserve package, instance, ownerPath, selected profile, service, role, runtime/resource source projections and the full native capability closure; do not replace these relationships with a profile label, a universal stand hash, or a weakened “any Buster binding” test. Reject both counterexamples before resolving any scope, while retaining original valid domain profiles and all existing negative/original requirements. Receivers and input identities must describe that same admitted owner/root, not a stale captured stand. No production implementation change is approved here.

## Material review of the remainder

### One physical root, owners, typed receivers, and generation dependencies

The proposal explicitly supersedes reviewed full v6 `same-entry-deployment-binding-02` and original v5 integration with one complete v7 root, six existing component owners, and the separately existing Prism engine owner. Independent body comparisons confirm the original nine component bindings and four Provider selection contexts exactly survive. Five original component owner objects and the original Buster whole object are conserved except for exactly `security-source-A` and `security-https-source-A` added to the sole Buster owner. The engine is not a seventh component. No second private root or simultaneous same-key writer is introduced.

The current concordance resolves actual JSON pointers and schema/root identities, not substrings: all 156 Provider/Security field nodes and all 1,114 member nodes (454 Provider plus 660 Security) match their physical current receiving nodes. The eight typed v2 Provider arms point into this v7 generation; inherited scalar schema fragments are immutable members rather than a second active v5 root writer. Nova's adapter projection remains separate. Provider03, Security01/02, and Prism01 dependencies are explicit frozen inputs, not a transitive acceptance of their whole native or implementation obligations. The earlier bounded independent review receipts remain unchanged.

All 22 Provider full-entry contexts, 163 Security entries and 22 Prism full-owner contexts are present and exercised by the existing pure collector. Security's sole package owner retains 158 profiles. These are admission/domain fixtures, not installed package instances or 158 physical C1 author-tree owners. All-profile validation and one-request selection remain separate normative requirements; SEEB-R01-01 is the identified exception to the purported complete relationship.

The distinct added Security service is explicitly a structural future instance. Actual current runner-worker-profile lookup, provider-loader registry snapshot, and runtime capability mapping do not route it merely because a tuple exists. The receiving/runtime migration and authentic caller/image/task/grant receipts are required. No installed new service, simultaneous registry routing, private writer, or invented package roster is accepted.

### Security source domains and native receiving constraints remain substantive

The preserved source-bound Security02 guard resolves preset/remove/replace/add rules before transport, counts unique response header names rather than total rule count, and uses the immutable native header catalogue and native `HTTP_RESPONSE_HEADERS_INVALID` boundary. Legitimate 64-rule compositions over few names are not capped to 32 rules. A supplied 32-name list can yield 33 returned names when content-type is added; that post-resolution native consumer boundary remains explicit. Header name grammar, denied names, and the content-length exception are not substituted by a generic validator.

The five registrations' same-service relationship includes genuine selected complete Buster/WorkerCore owner and runtime/resource fields, applicable role, namespace/grant/task prerequisites, registration capability closures and source projections. It is not only a string-equality profile claim. Captured network/source projections are this generation's concordance witnesses, not a silent removal of otherwise supported Buster policy domains. The narrow finding above concerns which package owner supplies the instance/profile side of that relationship, not removal of the Security02 resource guards.

Original per-source header oracles, all five processing families, lifecycle requirements, evidence baselines and actual quiet-provider behavior survive. A mandatory evidence baseline does not invent guaranteed produced logs. The 25 unsupported distinct-safe alternates (five labels, fifteen evidence, five matrix) remain unsupported alternatives, not waivers of original effects. The canonical Kubernetes nginx service is HTTP on port 80. HTTPS/web prerequisites require an authentic HTTPS producer; a Tailscale public endpoint is not the same producer contract. No fake eligibility grant is inferred from a profile or fixture.

### Provider and Prism intent, deadlines, evidence, and receiving ownership

Provider03's corrected default/ceiling/task-deadline distinction remains inherited. API-flow per-step task deadline intent is not silently moved into CONFIG; default and hard ceiling remain distinct, and actual source schema default injection and resolver rejection boundaries remain prerequisites. HTTP/OpenAPI cap admission does not manufacture an independent native task deadline. Nova R captures caps once for a whole run; per-request adapter caps are not invented as native honored controls. POST admitted request bytes/decompressed response parsing and returned raw native UTF-8/status/digest, including non-2xx, remain separate body/effect boundaries. Eight source-budget processing contracts and source-domain timer/pattern/ref/redirect/evidence dependencies remain pinned, not replaced by a generic source-budget assertion or protocol exemption. Genuine missing old-ledger coordinates remain missing rather than receiving ghost identities.

Prism's 12 original fields and 13 original cases are preserved, with 22 complete owner/selected-profile contexts and the actual engine/role/service/control binding. The existing control-to-agent-job row remains the proposed same-J capture path, not a new scheduler. Standard captured values retain claim 960,000ms versus Core 940,000ms plus startup allowance, CLI 900 seconds from 900,000ms, kill grace 1,000ms within 10,000ms cleanup, and 10,000ms claim/finish HTTP caps. Runtime alternates remain whole profiles, not merged knobs. Exact caller/task clock, source image, roles, output and grant prerequisites are still mandatory. No launcher, model, bridge, Control, or native case was executed.

### Scope authorization, physical source and migration honesty

The public pure authorization selector is discriminated: controller, recovery, provider, or launcher; exact caller/request equality and one matching tuple are required. It rejects unknown/composite keys and does not turn stand equality into a grant. A single requested original caller does not inherit another scope's authority, clock, fence grant or private ledger. The original-first recovery relations, source identity, epochs, FD9/FD10–11 accounting, archive/claim/counters and uncertainty remain inherited. Native FX and original effect requirements are not waived by local schema observations or the fixed Eval remains-unused state.

The proposed 120-member physical file set has explicit `kubeclaw.same-entry.input.v1` domain separation, NUL, sorted UTF-8 paths, length framing and source hashes. Root raw identity is distinct from the input codec; generated outputs are excluded from input digest. Duplicate/raw JSON, path escape, nofollow/descriptor identity, role/source/secret/output drift and unsealed receipt rejection have finite local controls. This replay covers ordinary captured files and specified negative fixtures, not filesystem race robustness or authentic issuance. The two proposed read-only S output receivers do not create another author root, and unsealed receipt v2 cannot activate.

The actual 42 captured current sources equal their live counterparts. Current `swarm-bundle.ts`, Dockerfiles, Chart Files.Get/mount paths, runtime-input filters, role images, bridge runner and controller code do not implement a v7 reader/materializer merely because the proposed ABI is present. The full source migration identifies those concrete gaps. Current Dockerfile.prism-agent contains the existing bridge/OpenClaw setup but no claimed new author tree. Current agent-job runner retains existing timeout/claim behavior; it is not exercised here.

The C1 author movement is exactly the eight old flat component/runtime config files to one root plus six component destinations; the old Buster runtime file becomes another profile in the same Buster owner. The existing Prism engine owner remains separately mapped. Security's 158-profile fixture roster is not relabeled as the finalized image-baked C1 author tree. Proposed `/etc/kubeclaw/author/config/...` image inputs and authentic nofollow input capture are distinguished from projected ConfigMap symlinks, which cannot masquerade as author input. Image/mount/render receiving closure and local ABI/migration definition are inspectable; authentic image/issuer/runtime receipts remain future. The finding is local definition incompleteness, not a generic excuse that all implementation concerns are external.

## Frozen conservation and execution record

Independent `capture.py` compares actual canonical/original case bodies and physical receiving nodes, retaining lossless gzip copies of every input, with identities in `read-identities.json`.

| Independent check | Result |
| --- | --- |
| Original field bodies | 168, zero mismatches |
| Original case bodies and retained native bodies | 1,008, zero mismatches |
| Actual current field nodes | 156, zero mismatches |
| Actual current member nodes | 1,114, zero mismatches |
| Author manifest members | 377, zero mismatches |
| Inherited frozen input pins | 465, zero mismatches |
| Actual current source copies | 42, zero mismatches |
| Original bindings / Provider contexts | 9 / 4 exact |
| Buster old whole owner excluding only two additions | exact |

The inspected existing collector completes **1,529 observations, zero reported failures**, under Node v24.21.0/Ajv 8.20.0. That is finite local evidence, not semantic completeness: the two new causal counterexamples are absent from its original observation roster. Both original three-probe and expanded seven-probe raw outputs are retained. `commands-and-exits.json` records commands, exits, script identities and read-only navigation mistakes; no failed guessed path was treated as an input witness. Author historical failure logs/snapshots and final claims are frozen unchanged, not repaired or erased. All productive/native cases executed: zero.

At initial capture HEAD was `e42dab0fa474d8bf7c726db2d100efff1c825a65`. End re-read of **756 inputs** found zero byte changes and the same HEAD. Node executable and Ajv entry hashes are in `conservation-and-physical-joins.json`; individual tool/script/source identities and exact preservation details are in the adjoining JSON records. Unrelated repository navigation/state movement before capture is not evidence of frozen-body drift, and no current navigation may silently integrate another generation.

## Closeout

SEEB-R01-01 requires an additive corrected package and an independent bounded correction review. The retained body/domain/physical-join successes stand, but do not overcome the supplied-current-owner admission failure. No canonical, production, schema, test, author, or historical input was edited. Only this independent review directory was written. No CLI/native/provider, gateway/browser, PG/Helm, API/network, credential or Eval activation occurred. This report grants neither whole C0 nor native/implementation acceptance.
