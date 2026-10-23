# Independent component configuration and Worker listener review

Status: bounded source and local runtime review accepted after one corrected original-fixture finding. This does **not** close CONFIG/D17, actual image delivery, live Git/Argo activation, or positive native Worker startup. The reviewer did not author either migration. Earlier Buster admission implementation is explicitly prior authored baseline; its behavior is regression evidence here, not fresh self-acceptance.

## Observed result

| Independently executed scope | Result |
| --- | --- |
| Full explicit component/Prism/Studio/Helm/package modules | 562/562 |
| Original Buster admission/identities/ledger and E2E profile modules | 18/18 |
| Five original release/GitOps modules, including additional release-images consumer | First 31/32; corrected full release-images module 2/2 |
| Four remaining original/new listener modules | 24/24 |
| Four scoped TypeScript projects; original deployment truth; canonical lint of 51 files | Exit 0 each |
| Seven component and five listener semantic mutants | All twelve applied and detected by actual assertion failures |
| Source/dependency/tool manifests before and after each block | Empty drift throughout |

The combined positive scope contains 636 cases, with the two-case release-images module rerun separately after its fixture correction. There is no single retrospectively green run: run2 remains Exit 1. All positive TAP blocks have zero skipped, cancelled or todo cases. Negative controls intentionally select affected cases; they do not substitute for full positive modules.

Run2 session 35409 ended with a real missed original-fixture migration: `release-images.test.mjs` copied and committed only `swarm.schema.json`, so the actual materializer correctly rejected the absent canonical `swarm-components.schema.json`. Root corrected only copying/committing both actual schema files into that temporary repository. The reviewer inspected the exact patch; every assertion remains unchanged. Run3 session 35578 permitted precisely this one source delta against run2, then ran the full corrected module and every outstanding positive/type/lint check. Session 22416 completed the private controls. All sessions are terminal.

## What was inspected

The entry schema names exactly five fixed component filenames and owners. `readSwarmBundle` resolves the entry's physical generation, reads regular component files through no-follow descriptors, validates each complete envelope and owner, then checks descriptor and pathname identity before returning immutable data. The actual `..data` switching, old-generation removal and file-change tests exercise this implementation. The claim is observed local generation consistency, not adversarial ABA prevention or a security sandbox.

The typed projection reuses the existing relationship validation and maps the five authored domains to the real Control, Studio, Worker and Buster consumers. Existing preparation/admission policy values are preserved; the Worker listener is a separately explicit new central field. No locator fallback or inline operator override is accepted. Canonical schema/helper symlinks retain one physical author, and release validation binds their actual targets. Two-profile process, HTTP, CLI and render tests observe consumer behavior rather than merely loading JSON.

Worker activation captures the authored ingress port once. Presence of legacy Worker `PORT`, including equal and empty values, fails; Helm rejects its former value author. Service targets, numeric probes, Envoy worker-local targets and plaintext policy edges follow the authored port. Stable discovery Service 8080 and authenticated sidecar 8443 remain distinct contracts. Worker secret/trust/database installation inputs and the pre-existing control-discovery URL remain outside this bounded port migration; this is not a claim that all Worker code defaults are gone.

Both actual Helm packages contain the complete bundle; ConfigMaps, directory mounts and rollout checksums include the authored owners. Every owner is mutated separately after identically formatted baselines. Missing packaged component, omitted single-owner checksum and omitted Docker COPY input are detected. Docker COPY inspection is structural only; no image build was executed.

## Preservation, isolation and negative controls

The 36 saved component-original files and listener before snapshots were inspected together with the explicit assertion inventories and final deltas. Field references move to their exact owner files; diagnostic expectations follow the new validation boundary. The three executor-limit assertions observe actual executor process arguments rather than the intentionally narrower native allocation arguments, with an additional count assertion and unchanged Memory/Tasks allocation checks. This observer models ownership and proves no kernel execution. Worker-specific prior PORT expectations migrate to rejection/authored probe values while original Control destinations, trust assertions and deadlines remain.

Deploymenttruth mappings target already-existing pinned browser delivery, the exact existing capability set, fixed state helper and native-parent/supervisor/service chain. They are structural assertions, not fresh native/image evidence. The saved native shutdown fixture still has its original deadlines and assertions, with explicitly authored compatible profiles; it was not executed here.

A fresh name audit covers all names in the full preserved component and listener logs after explicit TAP escaping normalization. Names alone do not establish assertion equivalence or dynamic coverage; raw complete module execution and inspected source deltas supply those separate obligations.

The historical component integration5–7 pass counts are **not accepted**: their fixture aliases modified real authors. This review uses the independently restored source and corrected fixture detachment/inode checks. A separately tested diagnostic write hook rejects writes through source aliases and hardlinks. Its negative control fails an actual expected-exception assertion when disabled; unlinking a temporary alias and making a real independent copy succeeds. No protected-source write attempt occurred in the combined runs. This hook is not a sandbox: direct file descriptors/FileHandle methods, external tools and changed child environments can bypass it; before/after source binding and explicit fixture inode checks are still required.

Component mutants remove required validation, remove the owner equality check, restore legacy authority, resolve through a moving generation, or lose output/poll/close arguments. Each has an application marker and a boundary-specific assertion failure. Port mutants restore the old loader or independently stale Service, probe, Envoy and policy values in real private chart copies; numeric expected/actual failures detect them. Private target files are regular, own-realpath files with inodes distinct from the originals. Syntax/import failures are not counted as detections. Actual maintained package tests independently exercise single-owner checksum loss and missing delivery input.

## Binding and evidence limits

The reviewer authored the orchestration and assembled the full explicit module scope, adding release-images because it consumes the changed release helper. Inspected author mutation hooks are reused as exact bound transformations, not as trusted result claims. Source, contracts, tests, charts, scripts, Docker and values files, root manifests, installed dependencies, the complete selected GNU tool root, actual executable binaries and their discovered dynamic libraries are bound. Relevant symlink text, resolved targets, mode and device/inode are recorded. Dirty source patches and new-source snapshots are retained.

Run2 binds 33,179 identities; run3 binds 33,180; controls bind 33,177 (the evidence/helper lists differ, not the productive dependency scope). Actual loaded-file audits cover 1,790, 1,184 and 230 distinct path/hash pairs respectively, with no mismatched bound bytes. Run2's 75 temporary loaded paths are accounted for: 74 are byte-identical copies of bound source, and one generated read-only kubectl fixture is exactly reconstructed from the bound test and observed Node path. It is modeled cluster input, not cluster execution. No unclassified loaded dependency remains. Tracing records underlying on-disk bytes; deliberate in-memory mutations are separately bound through hook definitions and raw application/assertion evidence. Some actual worker negative children intentionally replace their environment and do not inherit tracing; their source/dependency tree remains bound, but this is not a universal child-load interception claim.

Initial review preflight errors (manifest-shape assumption and a dangling unused GNU-cache symlink) occurred before tests and remain preserved. The corrected binder records dangling symlinks explicitly. No failure, source-drift event or original deadline was erased or relaxed to obtain this result.

## Criterion disposition

| Contract | Disposition |
| --- | --- |
| Component owner/value mapping, required fields/conflicts, local generation consistency, cross-file relationships, original local consumers, semantic controls | Accepted for this bounded migration |
| Component Helm/package/configmap/checksum/mount delivery | Accepted locally |
| Component actual Buster/Studio built-image delivery | Open; structural source checks are insufficient |
| WL1, WL2, local WL4, WL6 and WL-DOC | Accepted locally |
| WL3 | Partial: real HTTP loader/server composition on two ports and actual worker.ts invalid-start children pass; positive native worker.ts startup on two ports remains unexecuted |
| WL5 | Partial source/role-loader evidence only; actual built-image gate remains open |
| Live two-profile Git/Argo activation and invalid-update behavior | Open |
| A1–A8 and CONFIG F/D17 | Bounded evidence applies only to this slice; no global acceptance or reduced original scope |

No unresolved production defect was found within the locally exercised migration boundary. The corrected original fixture finding is closed by the actual full-module rerun. Operational gates and remaining component/plugin/Core/Orchestrator defaults remain explicit work, not waived criteria.

## Evidence index

- [Own plan and exact module/type/lint scope](../../evidence/independent-component-worker-listener-20260921/plan.json)
- [Positive first block and preserved failure](../../evidence/independent-component-worker-listener-20260921/run2/results.json)
- [Bound corrected continuation](../../evidence/independent-component-worker-listener-20260921/run3/results.json)
- [Exact prior source delta](../../evidence/independent-component-worker-listener-20260921/run3/prior-source-delta.json)
- [Twelve semantic controls](../../evidence/independent-component-worker-listener-20260921/controls/run1/results.json)
- [Complete original-name audit](../../evidence/independent-component-worker-listener-20260921/complete-case-name-audit.json)
- [Loaded temporary-source classification](../../evidence/independent-component-worker-listener-20260921/run2/loaded-closure-audit.json)
- [Diagnostic guard controls](../../evidence/independent-component-worker-listener-20260921/guard-check.json)
- [Preserved fixture finding](../../evidence/independent-component-worker-listener-20260921/run2-findings.json)
