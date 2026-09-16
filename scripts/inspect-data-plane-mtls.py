#!/usr/bin/env python3
"""Read-only transport inventory. Never fetch Secret objects or print env literals."""
import json
import os
import re
import subprocess


def identity(obj):
    meta = obj.get("metadata", {})
    return {"namespace": meta.get("namespace"), "name": meta.get("name")}


def reference(source):
    return {kind: {key: value for key, value in ref.items() if key in ("name", "key", "optional")}
            for kind, ref in source.items() if kind in ("secretKeyRef", "configMapKeyRef")}


def inventory(pods, workloads, services, policies, registrations):
    clients = []
    for obj in [*pods, *workloads]:
        spec = obj.get("spec", {})
        if obj.get("kind") == "CronJob":
            spec = spec.get("jobTemplate", {}).get("spec", {})
        spec = spec.get("template", {}).get("spec", spec)
        containers = []
        for container in [*spec.get("initContainers", []), *spec.get("containers", [])]:
            matches = []
            for env in container.get("env", []):
                if re.search(r"redis|registry", env.get("name", ""), re.I):
                    matches.append({"name": env["name"], "literalOmitted": "value" in env,
                                    "reference": reference(env.get("valueFrom", {}))})
            sources = []
            for source in container.get("envFrom", []):
                for kind in ("secretRef", "configMapRef"):
                    if kind in source:
                        sources.append({kind: {"name": source[kind].get("name")}})
            # Config-file-only consumers cannot be inferred from environment names.
            containers.append({"name": container.get("name"), "transportEnvironment": matches,
                               "environmentSources": sources,
                               "mountedVolumes": [v.get("name") for v in container.get("volumeMounts", [])]})
        volumes = []
        for volume in spec.get("volumes", []):
            item = {"name": volume.get("name")}
            if "configMap" in volume:
                item["configMap"] = volume["configMap"].get("name")
            if "secret" in volume:
                item["secret"] = volume["secret"].get("secretName")
            if "csi" in volume:
                item["csiDriver"] = volume["csi"].get("driver")
            if "projected" in volume:
                item["projectedSources"] = [{kind: {"name": ref.get("name")}}
                    for src in volume["projected"].get("sources", [])
                    for kind, ref in src.items() if kind in ("secret", "configMap")]
            volumes.append(item)
        clients.append({**identity(obj), "kind": obj.get("kind"),
                        "node": spec.get("nodeName"), "serviceAccount": spec.get("serviceAccountName", "default"),
                        "hostNetwork": spec.get("hostNetwork", False),
                        "containers": containers, "volumes": volumes})
    selected_services = [{**identity(s), "type": s.get("spec", {}).get("type"),
                          "selector": s.get("spec", {}).get("selector", {}),
                          "ports": [{k: p[k] for k in ("name", "port", "targetPort", "nodePort", "protocol") if k in p}
                                    for p in s.get("spec", {}).get("ports", [])]}
                         for s in services if re.search(r"redis|registry", s.get("metadata", {}).get("name", ""), re.I)]
    return {"scope": "metadata-and-reference-inventory-only", "clientsComplete": False,
            "limitations": ["Host/containerd clients and dynamically loaded configuration require separate inspection.",
                            "Presence of a client is not authorization to access Redis or the registry.",
                            "No reachability, TLS enforcement or certificate rotation proof is established."],
            "workloads": clients, "services": selected_services,
            "networkPolicies": [{**identity(p), "kind": p.get("kind")} for p in policies],
            "spiffeRegistrations": [{**identity(r), "spec": {k: v for k, v in r.get("spec", {}).items()
                if k in ("spiffeIDTemplate", "namespaceSelector", "podSelector", "workloadSelectorTemplates")}}
                for r in registrations]}


def main():
    context = os.environ.get("KUBE_CONTEXT")
    if not context:
        raise SystemExit("Set KUBE_CONTEXT first")

    def get(resource):
        result = subprocess.run(["kubectl", "--context", context, "get", resource, "-A", "-o", "json"],
                                capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise SystemExit(f"Inventory failed reading {resource}; check API access before proceeding")
        return json.loads(result.stdout)["items"]

    result = inventory(get("pods"), get("deployments,statefulsets,daemonsets,cronjobs"), get("services"),
                       get("networkpolicies"), get("clusterspiffeids.spire.spiffe.io"))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
