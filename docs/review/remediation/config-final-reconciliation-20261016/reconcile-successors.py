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
if len(platform_open)!=62 or len(platform_joins['rows'])!=62:
    raise ValueError('Platform boundary roster drift')
for identity,row in platform_open.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds']):
        raise ValueError('Platform boundary original drift: '+identity)
    if row['centralPhysicalAuthor'] is not None or row['runtimeAcceptance']!='OPEN; no original result changed':
        raise ValueError('Platform boundary falsely closed: '+identity)
notification_path = str((OUT / 'notification-successors.json').relative_to(ROOT))
notification_joins = read(notification_path)
notification_rows = {r['id']:r for r in notification_joins['rows']}
if len(notification_rows)!=26 or len(notification_joins['rows'])!=26:
    raise ValueError('Notification roster drift')
for identity,row in notification_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds']):
        raise ValueError('Notification original drift: '+identity)
notification_exact = {i:r for i,r in notification_rows.items() if r['status']=='EXACT_CORE_NOTIFICATION_SOURCE_JOIN'}
if len(notification_exact)!=2: raise ValueError('Notification Core source join drift')
plugin_policy_path = str((OUT/'plugin-policy-successors.json').relative_to(ROOT))
plugin_policy_joins = read(plugin_policy_path)
plugin_policy_rows = {r['id']:r for r in plugin_policy_joins['rows']}
if len(plugin_policy_rows)!=17 or len(plugin_policy_joins['rows'])!=17: raise ValueError('Plugin policy roster drift')
for identity,row in plugin_policy_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['centralPhysicalAuthor'] is not None or row['runtimeAcceptance']!='OPEN; original results unchanged': raise ValueError('Plugin policy original/acceptance drift: '+identity)
dispatch_path = str((OUT/'dispatch-successors.json').relative_to(ROOT))
dispatch_joins = read(dispatch_path)
dispatch_rows = {r['id']:r for r in dispatch_joins['rows']}
dispatch_exact = {i:r for i,r in dispatch_rows.items() if r['status']=='ORIGINAL_TARGET_SELECTED_DISPATCH_PROFILE_SOURCE_JOIN'}
if len(dispatch_rows)!=42 or len(dispatch_joins['rows'])!=42 or len(dispatch_exact)!=7:raise ValueError('Dispatch source roster drift')
for identity,row in dispatch_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['runtimeAcceptance']!='OPEN; original results unchanged':raise ValueError('Dispatch original/acceptance drift: '+identity)
    if identity not in dispatch_exact and row['centralPhysicalAuthor'] is not None:raise ValueError('Dispatch invented central author')
core_platform_path=str((OUT/'core-platform-successors.json').relative_to(ROOT))
core_platform_joins=read(core_platform_path)
core_platform_rows={r['id']:r for r in core_platform_joins['rows']}
core_platform_exact={i:r for i,r in core_platform_rows.items() if r['status']=='EXACT_EXISTING_CENTRAL_LEASE_MEMORY_SOURCE_JOIN'}
core_platform_protocol={i:r for i,r in core_platform_rows.items() if r['status']=='PROTOCOL_SCHEMA_VERSION_NOT_OPERATOR_GAP'}
if len(core_platform_rows)!=54 or len(core_platform_joins['rows'])!=54 or len(core_platform_exact)!=2 or len(core_platform_protocol)!=1:raise ValueError('Core54 source partition drift')
for identity,row in core_platform_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['runtimeAcceptance']!='OPEN; original results unchanged':raise ValueError('Core54 original/acceptance drift: '+identity)
    if identity not in core_platform_exact and row['centralPhysicalAuthor'] is not None:raise ValueError('Core54 invented central author')
    if identity in core_platform_protocol and row['class']!='protocol-invariant':raise ValueError('Core54 protocol classification drift')
author_residual_path=str((OUT/'author-residual-successors.json').relative_to(ROOT))
author_residual_joins=read(author_residual_path)
author_residual_rows={r['id']:r for r in author_residual_joins['rows']}
author_residual_exact={i:r for i,r in author_residual_rows.items() if r['status']=='EXACT_EXISTING_CONTROL_LIFETIME_SOURCE_JOIN'}
if len(author_residual_rows)!=4 or len(author_residual_joins['rows'])!=4 or len(author_residual_exact)!=1:raise ValueError('Four author source lanes drift')
for identity,row in author_residual_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['runtimeAcceptance']!='OPEN; original results unchanged':raise ValueError('Author original/acceptance drift')
    if identity not in author_residual_exact and row['centralPhysicalAuthor'] is not None:raise ValueError('Invented author source')
native_host_path=str((OUT/'native-host-successors.json').relative_to(ROOT))
native_host_joins=read(native_host_path)
native_host_rows={r['id']:r for r in native_host_joins['rows']}
if len(native_host_rows)!=20 or len(native_host_joins['rows'])!=20:raise ValueError('Native host20 source roster drift')
for identity,row in native_host_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['runtimeAcceptance']!='OPEN; original results unchanged' or row['centralPhysicalAuthor'] is not None:raise ValueError('Native host original/acceptance drift')
gitops_path=str((OUT/'gitops-successors.json').relative_to(ROOT))
gitops_joins=read(gitops_path)
gitops_rows={r['id']:r for r in gitops_joins['rows']}
if len(gitops_rows)!=8 or len(gitops_joins['rows'])!=8:raise ValueError('GitOps8 roster drift')
for identity,row in gitops_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['class']!='generated-binding' or row['runtimeAcceptance']!='OPEN; original results unchanged' or row['centralPhysicalAuthor'] is not None:raise ValueError('GitOps identity/class/acceptance drift')
operator_binding_path=str((OUT/'operator-binding-successors.json').relative_to(ROOT))
operator_binding_joins=read(operator_binding_path)
operator_binding_rows={r['id']:r for r in operator_binding_joins['rows']}
if len(operator_binding_rows)!=11 or len(operator_binding_joins['rows'])!=11:raise ValueError('Operator11 roster drift')
for identity,row in operator_binding_rows.items():
    original=originals.get(identity)
    if original is None or any(row[k]!=original[k] for k in ['original','originalObjectSha256','class','caseIds','owner']) or row['runtimeAcceptance']!='OPEN; original results unchanged' or row['centralPhysicalAuthor'] is not None:raise ValueError('Operator11 original/acceptance drift')
security_path=str((OUT/'security-provider-successors.json').relative_to(ROOT))
security_joins=read(security_path)
security_rows={r['id']:r for r in security_joins['rows']}
if len(security_rows)!=86:raise ValueError('Security86 roster drift')
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
        if old in ['config/plugins/kubeclaw.command-runner/default/standard.json', 'config/plugins/kubeclaw.git-workspace/default/standard.json', 'config/plugins/kubeclaw.redis-transport/default/standard.json']:
            if {row['id'] for row in platform}!=set(ids): raise ValueError('Incomplete command/workspace/Redis group')
            group['candidateSuccessors'] = []
            group['status'] = 'EXACT_PLATFORM_SOURCE_JOIN_CENTRAL_RECEIVING_OPEN'
            group['constraint'] = 'Adjacent Core catalog/cleanup/monitoring/error-excerpt or Redis payload/reply-buffer sections author none of these original platform fields. Supplied Platform adapters remain actual author; coordinated central selected receiving/history/delivery remains OPEN. No setting or original case accepted.'
    notification = [notification_rows[i] for i in ids if i in notification_rows]
    if notification:
        if {r['id'] for r in notification}!=set(ids): raise ValueError('Incomplete original notification group')
        group['exactNotificationCoreMappings'] = [r for r in notification if r['id'] in notification_exact]
        group['explicitNotificationResiduals'] = [r for r in notification if r['id'] not in notification_exact]
        group['remainingFieldIds'] = [i for i in ids if i not in notification_exact]
        group['notificationSupplementalJoin'] = pin(notification_path)
        group['candidateSuccessors'] = []
        group['status'] = 'PARTIAL_EXACT_NOTIFICATION_SOURCE_JOIN'
        group['constraint'] = notification_joins['constraint']
    plugin_policy = [plugin_policy_rows[i] for i in ids if i in plugin_policy_rows]
    if plugin_policy:
        if {r['id'] for r in plugin_policy}!=set(ids):raise ValueError('Incomplete plugin policy group')
        group['explicitPluginPolicyResiduals']=plugin_policy
        group['pluginPolicySupplementalJoin']=pin(plugin_policy_path)
        group['candidateSuccessors']=[]
        group['status']='EXACT_PLUGIN_POLICY_SOURCE_JOIN_CENTRAL_RECEIVING_OPEN'
        group['constraint']=plugin_policy_joins['constraint']
    dispatch = [dispatch_rows[i] for i in ids if i in dispatch_rows]
    if dispatch:
        if {r['id'] for r in dispatch}!=set(ids):raise ValueError('Incomplete dispatch source group')
        group['exactDispatchProfileMappings']=[r for r in dispatch if r['id'] in dispatch_exact]
        group['explicitDispatchResiduals']=[r for r in dispatch if r['id'] not in dispatch_exact]
        group['remainingFieldIds']=[i for i in ids if i not in dispatch_exact]
        group['dispatchSupplementalJoin']=pin(dispatch_path)
        group['candidateSuccessors']=[]
        group['status']='PARTIAL_EXACT_DISPATCH_PROFILE_SOURCE_JOIN'
        group['constraint']=dispatch_joins['constraint']
    core_platform=[core_platform_rows[i] for i in ids if i in core_platform_rows]
    if core_platform:
        if {r['id'] for r in core_platform}!=set(ids):raise ValueError('Incomplete Core54 source group')
        group['exactCoreLeaseMemoryMappings']=[r for r in core_platform if r['id'] in core_platform_exact]
        group['originalCoreProtocolInvariants']=[r for r in core_platform if r['id'] in core_platform_protocol]
        group['explicitCorePlatformResiduals']=[r for r in core_platform if r['id'] not in core_platform_exact and r['id'] not in core_platform_protocol]
        group['remainingFieldIds']=[i for i in ids if i not in core_platform_exact and i not in core_platform_protocol]
        group['corePlatformSupplementalJoin']=pin(core_platform_path)
        group['candidateSuccessors']=[]
        group['status']='PARTIAL_EXACT_CORE_LEASE_SOURCE_JOIN_WITH_PROTOCOL_AND_RECEIVING_RESIDUALS'
        group['constraint']=core_platform_joins['constraint']
    author_residual=[author_residual_rows[i] for i in ids if i in author_residual_rows]
    if author_residual:
        if {r['id'] for r in author_residual}!=set(ids):raise ValueError('Incomplete author residual group')
        group['exactAuthorLifetimeMappings']=[r for r in author_residual if r['id'] in author_residual_exact]
        group['explicitAuthorPolicyResiduals']=[r for r in author_residual if r['id'] not in author_residual_exact]
        group['remainingFieldIds']=[i for i in ids if i not in author_residual_exact]
        group['authorResidualSupplementalJoin']=pin(author_residual_path)
        group['status']='EXACT_AUTHOR_SOURCE_LANES_WITH_RECEIVING_RESIDUALS'
        group['constraint']=author_residual_joins['constraint']
    native_host=[native_host_rows[i] for i in ids if i in native_host_rows]
    if native_host:
        if {r['id'] for r in native_host}!=set(ids):raise ValueError('Incomplete native-host group')
        group['originalNativeHostProtocolInvariants']=[r for r in native_host if r['status']=='ORIGINAL_PROTOCOL_INVARIANT_NOT_OPERATOR_GAP']
        group['explicitNativeHostResiduals']=[r for r in native_host if r['status']!='ORIGINAL_PROTOCOL_INVARIANT_NOT_OPERATOR_GAP']
        group['remainingFieldIds']=[r['id'] for r in group['explicitNativeHostResiduals']]
        group['nativeHostSupplementalJoin']=pin(native_host_path)
        group['status']='EXACT_NATIVE_HOST_YAML_SOURCE_JOIN_WITH_PROTOCOL_AND_RECEIVING_RESIDUALS'
        group['constraint']=native_host_joins['constraint']
    gitops=[gitops_rows[i] for i in ids if i in gitops_rows]
    if gitops:
        if {r['id'] for r in gitops}!=set(ids):raise ValueError('Incomplete GitOps8 group')
        group['exactGitOpsGeneratedSourceLanes']=gitops
        group['gitopsSupplementalJoin']=pin(gitops_path)
        group['status']='EXACT_GITOPS_GENERATED_BINDING_SOURCE_LANES_CENTRAL_JOIN_OPEN'
        group['constraint']=gitops_joins['constraint']
    operator_binding=[operator_binding_rows[i] for i in ids if i in operator_binding_rows]
    if operator_binding:
        if {r['id'] for r in operator_binding}!=set(ids):raise ValueError('Incomplete operator11 group')
        group['explicitOperatorBindingResiduals']=operator_binding
        group['operatorBindingSupplementalJoin']=pin(operator_binding_path)
        group['status']='EXACT_OPERATOR_ENV_SECRET_FILE_SOURCE_LANES_CENTRAL_BINDING_OPEN'
        group['constraint']=operator_binding_joins['constraint']
    security=[security_rows[i] for i in ids if i in security_rows]
    if security:
        if {r['id'] for r in security}!=set(ids):raise ValueError('Incomplete security86 group')
        group['explicitSecurityProviderResiduals']=security
        group['securityProviderSupplementalJoin']=pin(security_path)
        group['status']='EXACT_SECURITY_PROVIDER_SOURCE_LANES_CENTRAL_RECEIVING_OPEN'
        group['constraint']=security_joins['constraint']
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
plugin_policy_joined = [r['id'] for g in groups for r in g.get('explicitPluginPolicyResiduals', [])]
if set(plugin_policy_joined)!=set(plugin_policy_rows) or len(plugin_policy_joined)!=len(set(plugin_policy_joined)):raise ValueError('Plugin policies not conserved across historical groups')
dispatch_joined=[r['id'] for g in groups for r in g.get('exactDispatchProfileMappings',[])+g.get('explicitDispatchResiduals',[])]
if set(dispatch_joined)!=set(dispatch_rows) or len(dispatch_joined)!=len(set(dispatch_joined)):raise ValueError('Dispatch identities not conserved across historical groups')
core_platform_joined=[r['id'] for g in groups for r in g.get('exactCoreLeaseMemoryMappings',[])+g.get('originalCoreProtocolInvariants',[])+g.get('explicitCorePlatformResiduals',[])]
if set(core_platform_joined)!=set(core_platform_rows) or len(core_platform_joined)!=len(set(core_platform_joined)):raise ValueError('Core54 identities not conserved across historical groups')
author_residual_joined=[r['id'] for g in groups for r in g.get('exactAuthorLifetimeMappings',[])+g.get('explicitAuthorPolicyResiduals',[])]
if set(author_residual_joined)!=set(author_residual_rows) or len(author_residual_joined)!=len(set(author_residual_joined)):raise ValueError('Author source lanes not conserved')
native_host_joined=[r['id'] for g in groups for r in g.get('originalNativeHostProtocolInvariants',[])+g.get('explicitNativeHostResiduals',[])]
if set(native_host_joined)!=set(native_host_rows) or len(native_host_joined)!=len(set(native_host_joined)):raise ValueError('Native host identities not conserved')
gitops_joined=[r['id'] for g in groups for r in g.get('exactGitOpsGeneratedSourceLanes',[])]
if set(gitops_joined)!=set(gitops_rows) or len(gitops_joined)!=8:raise ValueError('GitOps8 identities not conserved')
operator_binding_joined=[r['id'] for g in groups for r in g.get('explicitOperatorBindingResiduals',[])]
if set(operator_binding_joined)!=set(operator_binding_rows) or len(operator_binding_joined)!=11:raise ValueError('Operator11 identities not conserved')
security_joined=[r['id'] for g in groups for r in g.get('explicitSecurityProviderResiduals',[])]
if set(security_joined)!=set(security_rows) or len(security_joined)!=86:raise ValueError('Security86 not conserved')
result = {"scope": "Semantic navigation closeout over all45 historic missing locator observations; scoped Review, Core scalar, delivery and Prism service joins reuse existing source, not new implementation or runtime replay",
          "inputs": [pin(str((OUT / name).relative_to(ROOT))) for name in ["fields.json", "cases.json", "requirements.json", "RESULT.json"]],
          "counts": {"historicalLocatorGroups": len(groups), "exactExistingReviewFieldMappings": len(joined), "exactCurrentCoreScalarSourceJoins": len(adapter_exact), "exactDeliveryStoreSourceJoins": sum(r["status"] == "EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN" for r in delivery_exact.values()), "originalTargetSelectedProfileSourceJoins": sum(r["status"] == "ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN" for r in delivery_exact.values()),
              "exactPrismAttemptSourceJoins": len(attempt_exact), "explicitPrismAttemptReceivingResiduals": len(attempt_open), "exactPrismEngineSourceJoins": len(engine_exact), "explicitPrismEngineReceivingResiduals": len(engine_open), "exactPrismBoundarySourceJoins": len(boundary_exact), "explicitLiveRunnerResiduals": len(boundary_open), "exactPrismServiceSourceJoins": len(prism_exact), "staticReviewOwnerPointers": sum(m["status"] == "EXACT_EXISTING_REVIEW_OWNER_MAPPING" for m in mappings.values()),
              "originalTargetDerivedFields": sum(m["status"] == "ORIGINAL_ACTIVATION_TARGET_DERIVED" for m in mappings.values()),
              "explicitSecurityProviderReceivingResiduals":len(security_rows), "explicitOperatorBindingReceivingResiduals":len(operator_binding_rows), "exactGitOpsGeneratedBindingSourceLanes":len(gitops_rows), "originalNativeHostProtocolInvariants":1, "explicitNativeHostReceivingResiduals":19, "exactCoreLeaseMemorySourceJoins":len(core_platform_exact), "originalCoreProtocolInvariants":len(core_platform_protocol), "explicitCorePlatformReceivingResiduals":len(core_platform_rows)-len(core_platform_exact)-len(core_platform_protocol), "exactDispatchSelectedProfileSourceJoins":len(dispatch_exact), "explicitDispatchReceivingResiduals":len(dispatch_rows)-len(dispatch_exact), "explicitPluginPolicyReceivingResiduals": len(plugin_policy_rows), "exactNotificationCoreSourceJoins": len(notification_exact), "explicitNotificationReceivingResiduals": len(notification_rows)-len(notification_exact), "groupsByStatus": dict(collections.Counter(g["status"] for g in groups))},
          "groups": groups, "fullAcceptance": "OPEN", "independentReviewOfThisJoin": "OPEN",
          "requiredGates": "All2409 fields/6845 cases/50 requirements/fullC0-C6, applicable original effects/history/mutants, native/archive and fresh integrated independent review remain mandatory"}
if len(groups) != 45:
    raise ValueError("Historical locator inventory drift; reconcile explicitly")
(OUT / "semantic-successors.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result["counts"]))
