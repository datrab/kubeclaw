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
    "config/engines/prism-execution.config.json": ("prism-execution", ["resourcePolicy"]),
    "config/engines/prism.config.json": ("prism-execution", ["enginePolicy"]),
    "config/services/prism-agent-bridge.config.json": ("prism-control", ["agentBridge", "agentToolControlUrl"]),
    "config/services/prism-database-bootstrap.config.json": ("prism-control", ["databaseBootstrap"]),
    "config/services/prism-ingestion.config.json": ("prism-control", ["ingestionServer"]),
    "config/services/prism.config.json": ("prism-control", ["sessionLifetimeSeconds"]),
    "config/workers/prism.config.json": ("prism-worker", ["ingress", "nonceDatabase"]),
    "config/deployment/prism.config.json": ("prism-control", ["workerUrl", "controlInternalUrl", "ingestionUrl", "studioPublicUrl"]),
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
    if group["candidateSuccessors"] and not exact and not scalar_exact and not delivery:
        group["status"] = "CURRENT_SUCCESSOR_CANDIDATE_REQUIRES_FIELD_JOIN"
    group["qualification"] = "No missing-path-to-gap inference. Candidate section presence is NOT exact field closure, implementation acceptance, or permission to publish an author."
    groups.append(group)

joined = [entry["id"] for group in groups for entry in group["exactExistingMappings"]]
if set(joined) != set(mappings) or len(joined) != len(set(joined)):
    raise ValueError("Scoped mappings not conserved across historical locator groups")
delivery_joined = [r['id'] for g in groups for r in g.get('exactDeliverySourceMappings', [])]
if set(delivery_joined) != set(delivery_exact) or len(delivery_joined) != len(set(delivery_joined)):
    raise ValueError('Delivery source mappings not conserved across historical locator groups')
result = {"scope": "Semantic navigation closeout over all45 historic missing locator observations; scoped Review, Core scalar and delivery joins reuse existing source, not new implementation or runtime replay",
          "inputs": [pin(str((OUT / name).relative_to(ROOT))) for name in ["fields.json", "cases.json", "requirements.json", "RESULT.json"]],
          "counts": {"historicalLocatorGroups": len(groups), "exactExistingReviewFieldMappings": len(joined), "exactCurrentCoreScalarSourceJoins": len(adapter_exact), "exactDeliveryStoreSourceJoins": sum(r["status"] == "EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN" for r in delivery_exact.values()), "originalTargetSelectedProfileSourceJoins": sum(r["status"] == "ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN" for r in delivery_exact.values()),
              "staticReviewOwnerPointers": sum(m["status"] == "EXACT_EXISTING_REVIEW_OWNER_MAPPING" for m in mappings.values()),
              "originalTargetDerivedFields": sum(m["status"] == "ORIGINAL_ACTIVATION_TARGET_DERIVED" for m in mappings.values()),
              "groupsByStatus": dict(collections.Counter(g["status"] for g in groups))},
          "groups": groups, "fullAcceptance": "OPEN", "independentReviewOfThisJoin": "OPEN",
          "requiredGates": "All2409 fields/6845 cases/50 requirements/fullC0-C6, applicable original effects/history/mutants, native/archive and fresh integrated independent review remain mandatory"}
if len(groups) != 45:
    raise ValueError("Historical locator inventory drift; reconcile explicitly")
(OUT / "semantic-successors.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result["counts"]))
