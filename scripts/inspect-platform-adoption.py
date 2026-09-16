#!/usr/bin/env python3
"""Read installed platform settings for an Argo handover; never read Secrets."""
import hashlib
import json
import os
import re
import subprocess

context = os.environ.get("KUBE_CONTEXT")
if not context:
    raise SystemExit("Set KUBE_CONTEXT before running this inspection")


def run(*args):
    return json.loads(subprocess.check_output(args, text=True))


def scrub(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            sensitive = re.search(r"password|token|secret|private.?key|api.?key|credential|dsn|connectionstring", key, re.I)
            # Arbitrary environment variable values can contain credentials.
            sensitive = sensitive or (key == "value" and "name" in value)
            result[key] = "<redacted>" if sensitive else scrub(item)
        return result
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, str):
        if "\n" in value or "-----BEGIN" in value:
            return "<multiline content omitted>"
        return re.sub(r"(\w+://)[^/\s]*@", r"\1<redacted>@", value)
    return value


def kube(namespace, *args):
    return run("kubectl", "--context", context, "-n", namespace, *args, "-o", "json")


report = {"helm": {}, "litellm": {}, "storage": {}, "csiDrivers": []}
for release, namespace in [("spire", "spire-server"), ("spire-crds", "spire-server"), ("csi-driver-smb", "kube-system")]:
    values = run("helm", "--kube-context", context, "-n", namespace, "get", "values", release, "-o", "json")
    report["helm"][release] = {"namespace": namespace, "values": scrub(values or {})}

deployment = kube("kubeclaw", "get", "deployment", "litellm")
pod = deployment["spec"]["template"]["spec"]
report["litellm"]["replicas"] = deployment["spec"].get("replicas")
report["litellm"]["strategy"] = deployment["spec"].get("strategy")
report["litellm"]["selector"] = deployment["spec"]["selector"]
report["litellm"]["containers"] = []
for container in pod["containers"]:
    selected = {key: container[key] for key in ["name", "image", "imagePullPolicy", "ports", "resources", "volumeMounts", "securityContext", "envFrom"] if key in container}
    selected["env"] = [{"name": entry["name"], **({"valueFrom": entry["valueFrom"]} if "valueFrom" in entry else {"value": "<omitted>"})} for entry in container.get("env", [])]
    selected["probes"] = {key: {field: ({k: v for k, v in value.items() if k != "httpHeaders"} if field == "httpGet" else "<command omitted>" if field == "exec" else value) for field, value in container[key].items()} for key in ["startupProbe", "readinessProbe", "livenessProbe"] if key in container}
    report["litellm"]["containers"].append(selected)
report["litellm"]["volumes"] = [{"name": volume["name"], **{key: volume[key] for key in ["configMap", "secret", "persistentVolumeClaim"] if key in volume}} for volume in pod.get("volumes", [])]
report["litellm"]["service"] = kube("kubeclaw", "get", "service", "litellm")["spec"]
config = kube("kubeclaw", "get", "configmap", "litellm-config")
report["litellm"]["configHashes"] = {key: hashlib.sha256(value.encode()).hexdigest() for key, value in config.get("data", {}).items()}
pods = kube("kubeclaw", "get", "pods", "-l", "app=litellm")
report["litellm"]["images"] = [{"pod": p["metadata"]["name"], "containers": [{key: c.get(key) for key in ["name", "image", "imageID", "ready"]} for c in p.get("status", {}).get("containerStatuses", [])]} for p in pods["items"]]
for namespace in ["spire-server", "spire-system"]:
    claims = kube(namespace, "get", "pvc")
    report["storage"][namespace] = [{"name": c["metadata"]["name"], "spec": c["spec"], "phase": c.get("status", {}).get("phase")} for c in claims["items"]]
report["csiDrivers"] = [item["metadata"]["name"] for item in run("kubectl", "--context", context, "get", "csidrivers", "-o", "json")["items"]]
print(json.dumps(report, indent=2))
