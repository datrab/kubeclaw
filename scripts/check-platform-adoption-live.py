#!/usr/bin/env python3
"""Read-only prerequisite check before the first SPIRE/LiteLLM Argo sync."""
import hashlib
import json
import os
import subprocess

context = os.environ.get("KUBE_CONTEXT")
if not context:
    raise SystemExit("Set KUBE_CONTEXT first")


def get(*args):
    return json.loads(subprocess.check_output(["kubectl", "--context", context, "get", *args, "-o", "json"], text=True))


webhook = get("validatingwebhookconfiguration", "spire-server-spire-controller-manager-webhook")
hooks = webhook.get("webhooks", [])
if len(hooks) != 2 or any(h.get("failurePolicy") != "Fail" or not h.get("clientConfig", {}).get("caBundle") for h in hooks):
    raise SystemExit("STOP: SPIRE must have two active Fail webhooks with populated CA bundles before adoption")
claim = get("pvc", "spire-data-spire-server-0", "-n", "spire-server")
if claim.get("status", {}).get("phase") != "Bound" or claim["spec"]["resources"]["requests"]["storage"] != "1Gi":
    raise SystemExit("STOP: SPIRE storage differs from the reviewed 1Gi bound claim")
config = get("configmap", "litellm-config", "-n", "kubeclaw")
digest = hashlib.sha256(config.get("data", {}).get("config.yaml", "").encode()).hexdigest()
if digest != "06dd47c62732ce4d154336805ab16b861a8182c5081e297b5b84b7b6db5995b6":
    raise SystemExit("STOP: LiteLLM config changed since inventory; review the new configuration before sync")
print("PASS: existing SPIRE admission enforcement, bound storage and LiteLLM config match the adoption prerequisites.")
