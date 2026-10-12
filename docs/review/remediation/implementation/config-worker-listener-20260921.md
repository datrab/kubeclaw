# Prism Worker listener: D17 preimplementation contract

Status: implemented and locally author-checked after explicit component-author freeze; [Fresh combined review](independent-component-worker-listener-20260921.md) accepts WL1/WL2, local WL4, WL6 and WL-DOC. WL3 has partial evidence only; native positive entrypoint and built-image gates remain open. Historical staging and failed runs are retained.

## Acceptance criteria

- WL1: `prism-worker.config.json` `settings.ingress.port` is the sole editable listener author, explicitly 8080 in the canonical profile. Loader/schema require an integer from 1 through 65535 without defaults or coercion. Worker activation captures this value once.
- WL2: Worker `PORT` is rejected whenever present, including empty and equal-to-config values. Helm rejects legacy `worker.port`, including empty/equal values. Remove Docker/Chart PORT authors. Other roles' unrelated PORT contracts are unchanged.
- WL3: Actual worker HTTP entrypoint listens on each of two distinct authored ports; original routes/auth/readiness assertions and deadlines remain. Missing/invalid config fails before native initialization/listening. No port-zero production shortcut or fixture helper supplies omitted settings.
- WL4: Rendered Worker readiness/liveness, Service target, Envoy worker-local target and plaintext NetworkPolicy use the authored port. Preserve public in-cluster worker Service port 8080 and authenticated Service/sidecar port 8443. Preserve control outbound discovery and local proxy ports. Test both trust profiles and two authored ports, not only string presence.
- WL5: Role-specific built-image gate asserts worker listener config and rejects inherited PORT without sanitizing it. Docker has no listener ENV default. Image acceptance remains open until an actual image build/gate passes; EXPOSE metadata is not a runtime configuration author.
- WL6: Original suites and meaningful negative controls detect restored PORT fallback and stale target/probe/policy/Envoy port. Types/lint and source before/after binding pass in a coordinated test slot. Historical failures and snapshots remain.
- WL-DOC: Operator/config inventory and migration instructions identify the one new author, stable discovery ports, rejected legacy inputs and limits of local/image evidence. No whole CONFIG/D17 or live acceptance claim.

## Initial concrete source scope

Runtime: `skills/prism/server/worker-config.ts`, unchanged actual `worker.ts` caller; `skills/common/plugin-runtime/foundation/config/swarm.ts`; `charts/kubeclaw/files/config/swarm-components.schema.json`; canonical `prism-worker.config.json`.

Deployment: `docker/Dockerfile.prism-worker`; `charts/prism/templates/_swarm-bundle.tpl`, `_swarm-config.tpl`, `workloads.yaml`, `services.yaml`, `configmap-worker-trust.yaml`, `networkpolicy.yaml`; inspect `values.schema.json` rejection coverage. Workloads currently have no main application containerPort declaration; probes address the actual numeric listener. Adding a redundant container port is not required.

Tests and packaging: `skills/prism/tests/swarm-worker-config.test.mts`, actual worker bootstrap child fixtures, original ingress/readiness/shutdown suites, `tests/verification/deployment/prism-swarm-image.mjs` via real `scripts/check-built-runtime-image.sh`, maintained Prism Helm suites and component fixture writers. New tests must author ingress.port explicitly where replacing the whole ingress object. Do not globally add PORT rejection to the shared loader, which serves other runtime roles too.

Initial finding: `worker-config.ts` uses `Number(environment.PORT ?? 8080)`; Docker and workload supply PORT=8080. Service target, probes, worker-local Envoy and two worker-policy edges use fixed 8080. Public Service 8080 and sidecar 8443 are separate discovery/authentication contracts and remain stable.

## Historical staging coordination

This author owns only private staging copies and this new evidence/report until integration. Component author owns all live shared loader/schema/Chart files and will announce freeze. Reconcile each touched file against that final source, retaining both earlier staging baseline and integration baseline. TTL and component evidence are not retroactively rebound to this change. Runtime checks wait for the root-assigned exclusive slot.

## Historical staging checkpoint and preservation boundaries

The staged production patch covers 12 paths; two are aliases, not separate authors. `charts/prism/templates/_swarm-bundle.tpl` links to `charts/kubeclaw/templates/_swarm-config.tpl`; the component schema's canonical physical author is `skills/common/plugin-runtime/foundation/config/swarm-components.schema.json`. Integration must modify their existing targets and preserve all links. The separate physical-author manifest records this explicitly.

Five original test modules receive targeted adaptation. The former Control/Worker role test and image role test intentionally change only the retired Worker PORT expectation; Control's original assertions and unknown/missing image-role rejection remain. The full native shutdown fixture receives explicit authored port and supervisor profiles after a source finding: its existing 1500/30-ms shutdown values conflict with the canonical 105000/10000-ms supervisor values. Root authorized profiles 1500/1000/100 and 30/20/5 (shutdown/close/drain); the latter exercises stalled database startup without an attempt. Original shutdown values, assertions and deadlines remain. This fixture correction is distinct from the port migration and has no native pass claim.

New HTTP tests use the actual production config loader and Worker HTTP server on two real distinct ports, with native execution explicitly modeled. They prove loader/server composition and routes, not native entrypoint ownership startup. The original native process test remains necessary for that stronger claim. Four render profiles assert real Service/probe/Envoy/NetworkPolicy values; explicit legacy Helm and environment negatives are included.

Staging is not yet integrated, compiled, rendered or runtime-tested. The two semantic controls will restore the prior Worker fallback and stale Worker service target in private test copies; each must break a corresponding exact assertion. Expanded static-target controls should cover the probe, Envoy and policy assertions independently. No source or test success is inferred from constructing the patch. Final comparison must retain original assertion/deadline scope, apart from the two explicitly superseded Worker-PORT expectations.

## Documentation refinement before integration

The complete migration/networking instructions live only in `operator-configuration.md`.
The Prism guide points operators there; the Foundation README describes the typed
loader boundary; the inventory records the historical row and pending acceptance.
The original WL3 requirement is unchanged. The modeled-native HTTP composition
case is only a partial WL3 proof. Full WL3 remains open until the actual `worker.ts`
entrypoint passes both authored-port cases in a suitable native environment.

## Implemented result and author evidence

After the component author explicitly confirmed final production freeze and no running jobs, all 23 staged baselines matched the current source exactly. Integration edited canonical physical targets and preserved both alias links. `integration-result.json` records those identities. One additional original readiness-chart fixture later received explicit `--namespace default`, preserving all assertions and its 30-second deadline.

| Check | Actual outcome |
| --- | --- |
| `checks1`: seven complete modules | 352/357; four stale Worker-PORT expectations and one inherited Helm namespace failure retained |
| `checks2`: same complete modules | 356/357; all Worker port behavior and Control profiles pass; namespace edit had not matched double-quoted source and therefore still failed |
| `checks3`: corrected original readiness module | 1/1; explicit CI namespace, no guard changes |
| Prism types and touched lint | Exit 0 in checks1 and checks2 |
| Foundation types and final changed-test lint | Exit 0 in checks3 |
| Private old fallback, Service target, probe, Envoy target and NetworkPolicy mutants | All five detected by actual assertion failures |
| Named-source before/after comparison | No drift in all three rounds; this is the explicitly listed source scope, not a claim about every transitive file |

The complete test scope is seven modules: worker-listener-config, swarm-worker-config, control-image-environment, control-listener, swarm-worker-behavior, worker-readiness-chart and deployment/prism-swarm-config. Counts describe a 357-case union, with the one corrected original fixture independently rerun. No failed combined run is relabeled green. The new six-case listener module includes one actual HTTP-server test of two ports with modeled native execution and five actual `worker.ts` child-process negatives for missing/invalid port and empty/equal legacy PORT. Both modeled HTTP and actual invalid-entrypoint boundaries are explicit.

WL1/WL2 and the local WL4 topology checks have author evidence. WL3 retains its original full criterion and is only partially demonstrated: native startup on two positive ports has not run. WL5 has source/role-loader evidence, not an actual image build. WL6 has author types/lint and five semantic controls, supplemented by the linked independent combined review. WL-DOC is updated for the new author and explicitly open evidence boundaries. No whole CONFIG/D17, native pool, image or live acceptance is claimed.

The four older Control topology assertions that expected Worker ENV PORT are intentionally migrated to no PORT plus the authored Worker probe. The original Control destinations, service ports and trust assertions remain. The image role negative now rejects Worker PORT and preserves the original missing/unknown-role rejection. The standalone readiness fixture's namespace correction is independent of listener behavior. Earlier logs, snapshots and all staging checkpoints remain available.
