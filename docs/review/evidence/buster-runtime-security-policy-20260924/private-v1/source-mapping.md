# RuntimeSecurity candidate source / evidence map

This is a frozen private proposal for independent source review. `manifest.json` binds 23 proposed files and their exact live baselines. No runtime, build, type, lint, Helm or test command was executed by this author. The current live sources remain unchanged. `build-private.py` is an initial drafting script, not the final snapshot generator: do not rerun it over `files/`. Only the frozen `files/` bytes form the proposed integration set. `freeze.py` records identities and proposed hook controls; running it is not execution evidence.

## Authority and wiring

| Obligation | Production source | Proposed behavior proof |
|---|---|---|
| Eight explicit settings; no constructor/schema/ENV fallback | Two full `charts/kubeclaw/files/config` Buster profiles; `swarm-components.schema.json` cluster runtimeSecurity object; `buster-cluster-invokers.ts` validator | New required-field direct negatives and complete-bundle negatives; full recursive both-chart rejection matrix |
| Same schema for typed/direct entry | `swarm-bundle.ts` compiles the nested schema pointer as `buster-runtime-security`; cluster validator also checks age/poll coherence | Standalone invalid-domain cases and full-loader/chart parity; zero future skew explicitly positive |
| Shared endpoint and namespace remain single-author | `production-cluster-options.ts`, `production.ts` | Actual child argument equality includes shared group, lease, namespace; full original route binding cases |
| Grant is independent of policy presence | `production-capability-sources.ts` enabled boolean plus unchanged capability factory | Disabled options have no binding requirement; original runtime starts/stops with disabled routes, and each enabled route requires binding |
| Old runtime object removed and rejected before registry/store | Entrypoint writer; `validateRuntimeRoot`; source decoder | Original full remote-runtime test adds equal/null/empty/malformed object negatives and confirms store absent; new direct root-validation cases |
| Early complete bundle check | Existing preflight loads expanded component schema | Actual entrypoint original test adds missing/invalid RuntimeSecurity scenarios; no subsequent command observed |
| Whole selected file, packaged bytes, ConfigMap and checksum | Existing both-chart complete profile selector; shared template reads expanded schema and runtime coherence | Full existing deployment parity test preserved and expanded, including changed RuntimeSecurity fields and inactive/active profile changes |
| Real factory consumer | `kubernetesRuntimeSecurityOptions` → unchanged `createBusterCapabilityRuntime` → `KubernetesRuntimeSecurityCapabilityInvoker` | New consumer suite loads a real private component generation and invokes the actual factory with its selected options |

The Prism chart consumes the shared Kubeclaw schema/config/template aliases; there is no additional Prism policy author. Baseline identities cover each edited canonical file. No alias target is privately mutated by test setup; the existing chart test's copy-detach/inode assertions are preserved.

## Effective fields and real consumer cases

All rows use `tests/verification/contracts/buster-runtime-security-policy.test.mjs`. The fixture executable is a real Node child replacing external kubectl/controller responses; it computes otherwise bound observation input and actual result/manifest digests. This is a host-policy test, explicitly not a running Kubernetes controller or native-worker proof.

| Field | Consumer | Positive / negative or paired profiles |
|---|---|---|
| allowedNamespacePrefixes | invoke namespace admission | `[test]` admits actual `test-one` inspection; `[other]` rejects before child; caller array mutation cannot alter captured policy |
| maximumExecutionMs | operation deadline, command remaining timeout and poll remainder | real 700 ms child admitted with 4000 ms cap; 250 ms cap yields exact TIMEOUT, actual child was started |
| maximumOutputBytes | combined per-child stdout/stderr collector | real separate streams each below 1500, sum above 1500; 4096 admits valid lease, 1500 rejects exact OUTPUT_LIMIT; observers count actual bytes |
| pollIntervalMs | pause after Pending observation | actual first Pending and second Observed command; 50/1200 ms profiles measured using child command log timestamps; caller scalar mutation cannot alter selected cadence |
| maximumObservationAgeMs | host freshness predicate | otherwise valid observation 5000 ms old admitted under 10000, refused under 1000 until fixed inspection timeout |
| maximumFutureSkewMs | host freshness predicate | otherwise valid observation 7500 ms ahead admitted under 10000, refused under 1000 until fixed inspection timeout |
| diagnosticCodeUnits | nonzero exit diagnostic rendering | real nonzero child stderr; exact 7/40 JavaScript code-unit messages |
| executableSearchPath | actual child environment/helper lookup | actual helper only in private selected directory succeeds; absent directory fails exact diagnostic; caller PATH array mutation does not change actual child PATH |

Each genuine top-level fixture child has a close observer, and cases wait a bounded 2000 ms for actual close independently of teardown. The PATH child uses synchronous helper execution. Failure cleanup targets only that test's exact child and waits for close before deleting its root. This does not implement production abort/close ownership. The 10000/15000 ms test deadlines bound local fixtures only; no old test deadline was increased or removed. The profiles use deliberately separated local child timing/byte inputs to exercise configurable limits, not to calibrate production hardware capacity.

## Controls and full regression

`mutation-specs.json` binds nine unique source anchors and exact candidate file hashes. These are prepared controls only. Root's existing isolated import-hook mechanism must prove application and run an unchanged passing baseline followed by each control, preserving raw failures. Expected causal failures are written per control. Legacy object input negatives are distinct from source mutations. No control pass is claimed from an expected exit alone.

Original freshness, digest, accounting, containment, CRD and RBAC assertions remain. Security implementation's Helm setup now uses existing real `nativePoolPolicy` plus explicit immutable render-only image/registry prerequisites. These are prerequisites for the original renderer assertions, not live native evidence.

The new maintained command includes added host consumers, the full cluster command, complete remote runtime configuration and the existing complete security cutover chain (which includes implementation, parity, provider tests, remote vertical and controller Go tests). Root must additionally retain the already required full component/deployment, worker-local, readiness and affected canonical types/lint checks. Type scope explicitly adds the original security implementation caller. Documentation checks in the security chain remain unchanged. Source patches, generated-output exceptions, actual tool versions and relevant before/after digests must be bound by the coordinated executor, not inferred from this private manifest.

## DOC and remaining obligations

The new RuntimeSecurity guide covers all eight field domains, ownership, profile selection, direct API changes, namespace/shared binding, credential boundaries, the removed runtime object, request cap, observation matching, exact output cause, and verification limits. Cluster configuration and security error references point to that guide. The implementation candidate report states every execution/acceptance gate still pending.

The unbounded manifest read and abort-before-close/non-detached wrapper are unresolved production resource/lifecycle work. The OUTPUT_LIMIT-before-abort correction only preserves the real error cause; it is not a process-ownership fix. Provider request defaults and controller role settings remain separate unresolved owners. CONFIG, original findings and live acceptance remain open.

## V2 correction after Root review steering

`manifest-v2.json` / `snapshot-v2/` supersede V1 for proposed integration. V1 remains untouched historical evidence. V2 adds actual file replacement after component capture, with subsequent consumer results still bound to the old snapshot, and requires successful actual helper exit. `mutation-specs-v2.json` binds V2 production identities.

**RS2 remains incomplete:** helper/options composition plus a separate empty service start/stop is insufficient evidence for `loadProductionBusterRemotePlanRuntime → Service → Capability factory`. The existing consumer suite does not claim this full production path. A full service test with two profiles and denied route/grant with no child/effect must be supplied and independently reviewed before RS2 can pass. Root has a separate cluster-service test author working on the relevant harness; RuntimeSecurity coverage must be explicitly confirmed, never inferred from cluster-only routes. No full RuntimeSecurity acceptance is requested from this candidate.
