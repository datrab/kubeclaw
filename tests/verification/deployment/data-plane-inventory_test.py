import importlib.util
import json
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[3] / "scripts/inspect-data-plane-mtls.py"
spec = importlib.util.spec_from_file_location("inventory", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InventoryTest(unittest.TestCase):
    def test_omits_credentials_even_in_transport_urls_annotations_and_arguments(self):
        secret = "must-not-appear-in-output"
        container = {"name": "consumer", "args": [secret], "env": [
            {"name": "REDIS_URL", "value": f"redis://user:{secret}@redis:6379"},
            {"name": "REGISTRY_PASSWORD", "value": secret},
            {"name": "REDIS_PASSWORD", "valueFrom": {"secretKeyRef": {"name": "redis-secrets", "key": "password"}}}],
            "envFrom": [{"secretRef": {"name": "extra"}}], "volumeMounts": [{"name": "config"}]}
        pod = {"kind": "Pod", "metadata": {"name": "client", "annotations": {"old-config": secret}},
               "spec": {"serviceAccountName": "agent-nova", "containers": [container],
                        "volumes": [{"name": "config", "configMap": {"name": "runtime"}}]}}
        result = module.inventory([pod], [], [], [], [])
        encoded = json.dumps(result)
        self.assertNotIn(secret, encoded)
        self.assertIn("redis-secrets", encoded)
        self.assertEqual(result["workloads"][0]["serviceAccount"], "agent-nova")
        self.assertFalse(result["clientsComplete"])

    def test_captures_scaled_down_workloads_and_cronjobs_without_dumping_service_metadata(self):
        template = {"spec": {"serviceAccountName": "batch", "containers": [{"name": "job"}]}}
        objects = [{"kind": "Deployment", "spec": {"replicas": 0, "template": template}},
                   {"kind": "CronJob", "spec": {"jobTemplate": {"spec": {"template": template}}}}]
        service = {"metadata": {"name": "registry-local", "annotations": {"private": "omit-me"}},
                   "spec": {"type": "NodePort", "ports": [{"port": 5001, "targetPort": 5000, "nodePort": 30051}]}}
        result = module.inventory([], objects, [service], [], [])
        self.assertEqual([w["serviceAccount"] for w in result["workloads"]], ["batch", "batch"])
        self.assertEqual(result["services"][0]["ports"][0]["nodePort"], 30051)
        self.assertNotIn("omit-me", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
