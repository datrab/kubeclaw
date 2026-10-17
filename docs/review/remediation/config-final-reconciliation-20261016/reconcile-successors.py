#!/usr/bin/env python3
"""Join historical locators to scoped current evidence; never change original outcomes."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
REMEDIATION = "docs/review/remediation/"
CORE = "config/nova/core.config.json"
REVIEW = "config/plugins/kubeclaw.review/profiles/standard.config.json"
RUNTIME = "skills/nova/core/execution/engine-runtime.ts"
SNAPSHOTS = "skills/nova/core/execution/engine-snapshots.ts"

def read(path):
    return json.loads((ROOT / path).read_text())

def pin(path):
    return {"path": path, "sha256": hashlib.sha256((ROOT / path).read_bytes()).hexdigest()}

def resolve(path, pointer):
    value = read(path)
    for item in pointer.lstrip("/").split("/") if pointer else []:
        item = item.replace("~1", "/").replace("~0", "~")
        value = value[int(item)] if isinstance(value, list) else value[item]
    return value

def anchor(path, text):
    lines = (ROOT / path).read_text().splitlines()
    hits = [i + 1 for i, line in enumerate(lines) if text in line]
    if not hits:
        raise ValueError(f"Missing source anchor: {path}:{text}")
    return {**pin(path), "anchor": text, "lines": hits}

# Group-level navigation candidates are deliberately NOT field-level closure.
core_sections = {
    "artifact-store": ["artifactStore"], "command-runner": ["commandCatalog", "commandProcessCleanup", "commandRunnerMonitoring"],
    "git-workspace": ["gitWorkspaceFailure"], "network-http": ["networkHttp"],
    "notification-observer": ["notificationPresentation"], "openclaw-agent-events": ["agentEventSource"],
    "operator-messaging": ["operatorMessagingPayload", "operatorMessagingFailure", "operatorMessagingStore"],
    "redis-transport": ["redisTransport"], "runtime-dispatch": ["openClawDispatch", "httpDispatch"],
    "state-store": ["stateStore"], "telemetry-store": ["telemetryStore"],
    "transport-publisher": ["transportPublisherPayload", "transportPublisherStructure", "transportPublisherFailure", "transportPublisherStore"],
    "wait-store": ["waitStore"],
}
prism_candidates = {
    "config/engines/prism-agent.config.json": ("prism-control", ["agentLauncher"]),
    "config/engines/prism-execution.config.json": ("prism-control", ["nativeAttemptLifetimeMs", "nativeAttemptTimeoutMs", "nativeAttemptCleanupTimeoutMs", "nativeAttemptLogBytes", "nativeAttemptResultBytes", "nativeAttemptEvidenceBytes", "nativeAttemptEvidenceFiles"]),
    "config/engines/prism.config.json": ("prism-execution", ["enginePolicy"]),
    "config/services/prism-agent-bridge.config.json": ("prism-control", ["agentBridge", "agentToolControlUrl"]),
    "config/services/prism-database-bootstrap.config.json": ("prism-control", ["databaseBootstrap"]),
    "config/services/prism-ingestion.config.json": ("prism-control", ["ingestionServer"]),
    "config/services/prism.config.json": ("prism-control", ["sessionLifetimeSeconds"]),
    "config/workers/prism.config.json": ("prism-worker", ["ingress", "nonceDatabase"]),
    "config/deployment/prism.config.json": ("prism-control", ["workerUrl", "controlInternalUrl", "ingestionUrl"]),
}

fields = read(str((OUT / "fields.json").relative_to(ROOT)))
originals = {row["id"]: row for row in fields}
summary = read(str((OUT / "RESULT.json").relative_to(ROOT)))
mapping_paths = [REMEDIATION + "config-review-owned-20261016/field-mapping.json",
                 REMEDIATION + "config-review-grades-20261016/field-mapping.json"]
mappings = {}
for path in mapping_paths:
    document = read(path)
    assert document["count"] == len(document["rows"])
    for index, row in enumerate(document["rows"]):
        identity = row["id"]
        if identity in mappings or identity not in originals:
            raise ValueError(f"Duplicate/foreign successor ID: {identity}")
        if row["class"] != originals[identity]["class"]:
            raise ValueError(f"Original classification changed: {identity}")
        owner = row.get("currentOwner", row.get("owner"))
        pointer = row.get("currentPointer", row.get("pointer"))
        common = {"id": identity, "original": originals[identity]["original"],
                  "originalObjectSha256": originals[identity]["originalObjectSha256"],
                  "mapping": {**pin(path), "pointer": f"/rows/{index}"},
                  "originalReader": pin(row["originalReader"]),
                  "caseIds": originals[identity]["caseIds"],
                  "runtimeAcceptance": "NOT_INFERRED; original case results unchanged"}
        if owner == REVIEW:
            value = resolve(owner, pointer)
            common.update({"status": "EXACT_EXISTING_REVIEW_OWNER_MAPPING", "owner": pin(owner), "pointer": pointer,
                           "valueSha256": hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()})
        elif owner == "actual activation-captured OpenClaw target":
            if not identity.endswith(("TOKENIZERENCODING", "MAXOUTPUTTOKENSPERJOB")):
                raise ValueError("Unexpected runtime-derived Review field")
            common.update({"status": "ORIGINAL_ACTIVATION_TARGET_DERIVED", "targetPointerTemplate": pointer,
                           "staticOwner": None, "qualification": "Dynamic original selected target, NOT a new Review author or current target lookup"})
        else:
            raise ValueError(f"Unsupported successor owner: {owner}")
        mappings[identity] = common
if len(mappings) != 228:
    raise ValueError("Incomplete original scoped Review mapping")

runtime_anchors = [anchor(RUNTIME, "reviewRuntimeBinding"), anchor(SNAPSHOTS, "reviewRuntimeBinding"),
                   anchor("skills/nova/core/execution/engine-run.ts", "reviewPolicyCapture")]
adapter_path = str((OUT / 'adapter-successors.json').relative_to(ROOT))
adapter_joins = read(adapter_path)
adapter_exact = {r['id']: r for g in adapter_joins['groups'] for r in g['rows']
                 if r['status'] == 'EXACT_CURRENT_CORE_SCALAR_SOURCE_JOIN'}
if len(adapter_exact) != 19 or set(adapter_exact) & set(mappings):
    raise ValueError('Adapter successor roster overlap/drift')
delivery_path = str((OUT / 'delivery-successors.json').relative_to(ROOT))
delivery_joins = read(delivery_path)
delivery_exact = {r['id']: r for g in delivery_joins['groups'] for r in g['rows'] if r['status'] in {'EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN', 'ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN'}}
if len(delivery_exact) != 6 or set(delivery_exact) & (set(adapter_exact) | set(mappings)):
    raise ValueError('Delivery successor roster overlap/drift')
prism_path = str((OUT / 'prism-service-successors.json').relative_to(ROOT))
prism_joins = read(prism_path)
prism_exact = {r['id']: r for g in prism_joins['groups'] for r in g['rows']}
if len(prism_exact) != 16 or set(prism_exact) & (set(delivery_exact) | set(adapter_exact) | set(mappings)):
    raise ValueError('Prism service successor roster overlap/drift')
boundary_path = str((OUT / 'prism-boundary-successors.json').relative_to(ROOT))
boundary_joins = read(boundary_path)
boundary_exact = {r['id']: r for r in boundary_joins['rows'] if r['status'] == 'EXACT_PRISM_BOUNDARY_SOURCE_JOIN'}
boundary_open = {r['id']: r for r in boundary_joins['rows'] if r['status'] == 'LIVE_RUNNER_ROUTE_OWNER_JOIN_OPEN'}
if len(boundary_exact) != 5 or len(boundary_open) != 1 or set(boundary_exact) & (set(prism_exact) | set(delivery_exact) | set(adapter_exact) | set(mappings)):
    raise ValueError('Prism boundary roster overlap/drift')
engine_path = str((OUT / 'prism-engine-successors.json').relative_to(ROOT))
engine_joins = read(engine_path)
engine_exact = {r['id']: r for r in engine_joins['rows'] if r['status'] == 'EXACT_PRISM_ENGINE_SOURCE_JOIN'}
engine_open = {r['id']: r for r in engine_joins['rows'] if r['status'] == 'PRISM_ENGINE_RECEIVING_IMPLEMENTATION_OPEN'}
if len(engine_exact) != 12 or len(engine_open) != 1 or set(engine_exact) & (set(boundary_exact) | set(prism_exact) | set(delivery_exact) | set(adapter_exact) | set(mappings)):
    raise ValueError('Prism engine roster overlap/drift')
attempt_path = str((OUT / 'prism-attempt-successors.json').relative_to(ROOT))
attempt_joins = read(attempt_path)
attempt_exact = {r['id']: r for r in attempt_joins['rows'] if r['status'] == 'EXACT_PRISM_ATTEMPT_SOURCE_JOIN'}
attempt_open = {r['id']: r for r in attempt_joins['rows'] if r['status'] == 'PRISM_ATTEMPT_RECEIVING_IMPLEMENTATION_OPEN'}
if len(attempt_exact) != 17 or len(attempt_open) != 2 or set(attempt_exact) & (set(engine_exact) | set(boundary_exact) | set(prism_exact) | set(delivery_exact) | set(adapter_exact) | set(mappings)):
    raise ValueError('Prism attempt roster overlap/drift')
control_path = str((OUT / 'prism-control-successors.json').relative_to(ROOT))
control_joins = read(control_path)
control_exact = {r['id']: r for r in control_joins['rows'] if r['status'] == 'EXACT_PRISM_CONTROL_SOURCE_JOIN'}
control_open = {r['id']: r for r in control_joins['rows'] if r['status'] == 'PRISM_CONTROL_RECEIVING_IMPLEMENTATION_OPEN'}
if len(control_exact) != 14 or len(control_open) != 0 or set(control_exact) & (set(attempt_exact) | set(engine_exact) | set(boundary_exact) | set(prism_exact) | set(delivery_exact) | set(adapter_exact) | set(mappings)):
    raise ValueError('Prism control roster overlap/drift')
platform_path = str((OUT / 'platform-boundary-successors.json').relative_to(ROOT))
platform_joins = read(platform_path)
platform_open = {r['id']:r for r in platform_joins['rows']}
if len(platform_open)!=50 or len(platform_joins['rows'])!=50:
    raise ValueError('Platform boundary roster drift')
for identity,row in platform_open.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds']):
        raise ValueError('Platform boundary original drift: '+identity)
    if row['centralPhysicalAuthor'] is not None or row['runtimeAcceptance']!='OPEN; no original result changed':
        raise ValueError('Platform boundary falsely closed: '+identity)
groups = []
for observation in summary["missingExplicitTargetConfigLocators"]:
    old = observation["path"]
    ids = observation["originalFieldIds"]
    exact = [mappings[i] for i in ids if i in mappings]
    remaining = [i for i in ids if i not in mappings]
    group = {"historicalLocator": old, "originalFieldIds": ids, "fieldCount": len(ids),
             "exactExistingMappings": exact, "remainingFieldIds": remaining, "candidateSuccessors": [],
             "status": "UNRESOLVED_SEMANTIC_OWNER_JOIN", "runtimeAcceptance": "OPEN; no original case result rewritten"}
    if exact:
        group["sourceAndOriginalRecoveryAnchors"] = runtime_anchors
        group["status"] = "EXACT_EXISTING_SCOPED_MAPPING" if not remaining else "PARTIAL_EXACT_EXISTING_SCOPED_MAPPING"
    scalar_exact = [adapter_exact[i] for i in ids if i in adapter_exact]
    if scalar_exact:
        group['exactCoreScalarMappings'] = scalar_exact
        group['remainingFieldIds'] = [i for i in remaining if i not in adapter_exact]
        group['supplementalJoin'] = pin(adapter_path)
        group['status'] = 'PARTIAL_EXACT_CORE_SCALAR_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_CORE_SCALAR_SOURCE_JOIN'
    delivery = [delivery_exact[i] for i in ids if i in delivery_exact]
    if delivery:
        group['exactDeliverySourceMappings'] = delivery
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in delivery_exact]
        group['deliverySupplementalJoin'] = pin(delivery_path)
        group['status'] = 'PARTIAL_EXACT_DELIVERY_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_DELIVERY_SOURCE_JOIN'
    prism = [prism_exact[i] for i in ids if i in prism_exact]
    if prism:
        group['exactPrismServiceSourceMappings'] = prism
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in prism_exact]
        group['prismServiceSupplementalJoin'] = pin(prism_path)
        group['status'] = 'PARTIAL_EXACT_PRISM_SERVICE_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_PRISM_SERVICE_SOURCE_JOIN'
    boundary = [boundary_exact[i] for i in ids if i in boundary_exact]
    if boundary:
        group['exactPrismBoundaryMappings'] = boundary
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in boundary_exact]
        group['prismBoundarySupplementalJoin'] = pin(boundary_path)
        group['status'] = 'PARTIAL_EXACT_PRISM_BOUNDARY_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_PRISM_BOUNDARY_SOURCE_JOIN'
    open_boundary = [boundary_open[i] for i in ids if i in boundary_open]
    if open_boundary:
        group['explicitBoundaryResiduals'] = open_boundary
    engine = [engine_exact[i] for i in ids if i in engine_exact]
    if engine:
        group['exactPrismEngineMappings'] = engine
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in engine_exact]
        group['prismEngineSupplementalJoin'] = pin(engine_path)
        group['status'] = 'PARTIAL_EXACT_PRISM_ENGINE_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_PRISM_ENGINE_SOURCE_JOIN'
    residual_engine = [engine_open[i] for i in ids if i in engine_open]
    if residual_engine:
        group['explicitEngineResiduals'] = residual_engine
    attempt = [attempt_exact[i] for i in ids if i in attempt_exact]
    if attempt:
        group['exactPrismAttemptMappings'] = attempt
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in attempt_exact]
        group['prismAttemptSupplementalJoin'] = pin(attempt_path)
        group['status'] = 'PARTIAL_EXACT_PRISM_ATTEMPT_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_PRISM_ATTEMPT_SOURCE_JOIN'
    residual_attempt = [attempt_open[i] for i in ids if i in attempt_open]
    if residual_attempt:
        group['explicitAttemptResiduals'] = residual_attempt
    control = [control_exact[i] for i in ids if i in control_exact]
    if control:
        group['exactPrismControlMappings'] = control
        group['remainingFieldIds'] = [i for i in group['remainingFieldIds'] if i not in control_exact]
        group['prismControlSupplementalJoin'] = pin(control_path)
        group['status'] = 'PARTIAL_EXACT_PRISM_CONTROL_SOURCE_JOIN' if group['remainingFieldIds'] else 'EXACT_PRISM_CONTROL_SOURCE_JOIN'
    residual_control = [control_open[i] for i in ids if i in control_open]
    if residual_control:
        group['explicitControlResiduals'] = residual_control
    parts = old.split("/")
    if len(parts) > 2 and parts[1] == "plugins":
        plugin = parts[2].removeprefix("kubeclaw.")
        if plugin in core_sections:
            for section in core_sections[plugin]:
                pointer = "/profiles/standard/settings/" + section
                resolve(CORE, pointer)
                group["candidateSuccessors"].append({"owner": pin(CORE), "pointer": pointer,
                    "consumer": anchor(RUNTIME, "policy." + section)})
    if old in prism_candidates:
        component, sections = prism_candidates[old]
        owner = f"config/components/{component}.config.json"
        for section in sections:
            pointer = "/profiles/standard/settings/" + section
            resolve(owner, pointer)
            group["candidateSuccessors"].append({"owner": pin(owner), "pointer": pointer,
                "qualification": "Current component section; exact per-field source/recovery joins still required"})
    if old == "config/core/nova/standard.json":
        group["candidateSuccessors"].append({"owner": pin(CORE), "pointer": "/profiles/standard/settings",
            "qualification": "Mixed platform/Core history; do not assume all54 fields moved here"})
    if "coverage-budget" in old or "size-budget" in old:
        group["status"] = "DEFINED_RECEIVING_IMPLEMENTATION_OPEN"
        group["sourceAnchors"] = [anchor("skills/common/plugin-runtime/foundation/registry/configuration.ts", "provider-configuration.v1"),
            anchor("skills/common/plugin-runtime/foundation/config/pipeline-generation.ts", "pipeline-entry.v3")]
        group["constraint"] = "Defined v2 task-only/selectedPolicy plus original inputStore/package/delivery closure must be implemented together. Current root/provider remain v3/v1. No denied v10 promotion/private root/current-value fill. Completed finite byte guards do not externalize these24 fields or accept168 cases."
        group["definition"] = pin("docs/review/evidence/config-acceptance/c0-completion-20261013/quality-budget-contracts-01/RECEIVING-AND-ORACLES.md")
    if group["candidateSuccessors"] and not exact and not scalar_exact and not delivery and not prism and not boundary and not engine and not attempt and not control:
        group["status"] = "CURRENT_SUCCESSOR_CANDIDATE_REQUIRES_FIELD_JOIN"
    platform = [platform_open[i] for i in ids if i in platform_open]
    if platform:
        group['explicitPlatformResiduals'] = platform
        group['platformSupplementalJoin'] = pin(platform_path)
        if old in ['config/plugins/kubeclaw.command-runner/default/standard.json', 'config/plugins/kubeclaw.git-workspace/default/standard.json']:
            if {row['id'] for row in platform}!=set(ids): raise ValueError('Incomplete command/workspace group')
            group['candidateSuccessors'] = []
            group['status'] = 'EXACT_PLATFORM_SOURCE_JOIN_CENTRAL_RECEIVING_OPEN'
            group['constraint'] = 'Adjacent Core catalog/cleanup/monitoring/error-excerpt sections author none of these18 original fields. Supplied Platform adapters remain actual author; coordinated central selected receiving/history/delivery remains OPEN. No setting or original case accepted.'
    group["qualification"] = "No missing-path-to-gap inference. Candidate section presence is NOT exact field closure, implementation acceptance, or permission to publish an author."
    groups.append(group)

joined = [entry["id"] for group in groups for entry in group["exactExistingMappings"]]
if set(joined) != set(mappings) or len(joined) != len(set(joined)):
    raise ValueError("Scoped mappings not conserved across historical locator groups")
delivery_joined = [r['id'] for g in groups for r in g.get('exactDeliverySourceMappings', [])]
if set(delivery_joined) != set(delivery_exact) or len(delivery_joined) != len(set(delivery_joined)):
    raise ValueError('Delivery source mappings not conserved across historical locator groups')
prism_joined = [r['id'] for g in groups for r in g.get('exactPrismServiceSourceMappings', [])]
if set(prism_joined) != set(prism_exact) or len(prism_joined) != len(set(prism_joined)):
    raise ValueError('Prism service mappings not conserved across historical locator groups')
boundary_joined = [r['id'] for g in groups for r in g.get('exactPrismBoundaryMappings', [])]
if set(boundary_joined) != set(boundary_exact) or len(boundary_joined) != len(set(boundary_joined)):
    raise ValueError('Prism boundary mappings not conserved across historical groups')
engine_joined = [r['id'] for g in groups for r in g.get('exactPrismEngineMappings', [])]
engine_residuals = [r['id'] for g in groups for r in g.get('explicitEngineResiduals', [])]
if set(engine_joined) != set(engine_exact) or len(engine_joined) != len(set(engine_joined)) or set(engine_residuals) != set(engine_open) or len(engine_residuals) != len(set(engine_residuals)):
    raise ValueError('Prism engine mappings/residuals not conserved across historical groups')
attempt_joined = [r['id'] for g in groups for r in g.get('exactPrismAttemptMappings', [])]
attempt_residuals = [r['id'] for g in groups for r in g.get('explicitAttemptResiduals', [])]
if set(attempt_joined) != set(attempt_exact) or len(attempt_joined) != len(set(attempt_joined)) or set(attempt_residuals) != set(attempt_open) or len(attempt_residuals) != len(set(attempt_residuals)):
    raise ValueError('Prism attempt mappings/residuals not conserved across historical groups')
control_joined = [r['id'] for g in groups for r in g.get('exactPrismControlMappings', [])]
control_residuals = [r['id'] for g in groups for r in g.get('explicitControlResiduals', [])]
if set(control_joined) != set(control_exact) or len(control_joined) != len(set(control_joined)) or set(control_residuals) != set(control_open) or len(control_residuals) != len(set(control_residuals)):
    raise ValueError('Prism control mappings/residuals not conserved across historical groups')
result = {"scope": "Semantic navigation closeout over all45 historic missing locator observations; scoped Review, Core scalar, delivery and Prism service joins reuse existing source, not new implementation or runtime replay",
          "inputs": [pin(str((OUT / name).relative_to(ROOT))) for name in ["fields.json", "cases.json", "requirements.json", "RESULT.json"]],
          "counts": {"historicalLocatorGroups": len(groups), "exactExistingReviewFieldMappings": len(joined), "exactCurrentCoreScalarSourceJoins": len(adapter_exact), "exactDeliveryStoreSourceJoins": sum(r["status"] == "EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN" for r in delivery_exact.values()), "originalTargetSelectedProfileSourceJoins": sum(r["status"] == "ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN" for r in delivery_exact.values()),
              "exactPrismAttemptSourceJoins": len(attempt_exact), "explicitPrismAttemptReceivingResiduals": len(attempt_open), "exactPrismEngineSourceJoins": len(engine_exact), "explicitPrismEngineReceivingResiduals": len(engine_open), "exactPrismBoundarySourceJoins": len(boundary_exact), "explicitLiveRunnerResiduals": len(boundary_open), "exactPrismServiceSourceJoins": len(prism_exact), "staticReviewOwnerPointers": sum(m["status"] == "EXACT_EXISTING_REVIEW_OWNER_MAPPING" for m in mappings.values()),
              "originalTargetDerivedFields": sum(m["status"] == "ORIGINAL_ACTIVATION_TARGET_DERIVED" for m in mappings.values()),
              "groupsByStatus": dict(collections.Counter(g["status"] for g in groups))},
          "groups": groups, "fullAcceptance": "OPEN", "independentReviewOfThisJoin": "OPEN",
          "requiredGates": "All2409 fields/6845 cases/50 requirements/fullC0-C6, applicable original effects/history/mutants, native/archive and fresh integrated independent review remain mandatory"}
if len(groups) != 45:
    raise ValueError("Historical locator inventory drift; reconcile explicitly")
(OUT / "semantic-successors.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result["counts"]))
