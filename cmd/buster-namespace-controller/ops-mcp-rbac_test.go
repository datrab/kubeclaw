package main

import (
	"encoding/json"
	"testing"
)

func TestOpsMCPBindingsAreExactPlatformAuthority(t *testing.T) {
	ctrl := testController(t)
	ctrl.opsMCPNamespace, ctrl.opsMCPRelease = "kubeclaw-ops", "codex-ops"
	item := &lease{Spec: map[string]interface{}{"access": []interface{}{map[string]interface{}{"subject": "agent-buster", "mode": "tester"}}}}
	expected, err := ctrl.expectedNamespaceRBAC(item, "test-owned")
	if err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"reader", "test-exec"} {
		role := "kubeclaw-ops-codex-ops-" + suffix
		valid := ctrl.namespaceRoleBinding("test-owned", role, []serviceAccountRef{{Namespace: "kubeclaw-ops", Name: "codex-ops-mcp"}})
		state := func(binding map[string]interface{}) map[string]map[string]interface{} {
			return map[string]map[string]interface{}{"rolebindings": {"items": []interface{}{binding}}}
		}
		if found := inspectNamespaceRBAC(state(valid), expected); len(found) != 0 {
			t.Fatalf("valid MCP %s binding rejected: %v", suffix, found)
		}
		for _, change := range []string{"subject", "namespace", "role", "name", "extra-subject"} {
			raw, _ := json.Marshal(valid)
			var altered map[string]interface{}
			_ = json.Unmarshal(raw, &altered)
			switch change {
			case "subject":
				objectValue(interfaceSlice(altered["subjects"])[0])["name"] = "agent-nova"
			case "namespace":
				objectValue(interfaceSlice(altered["subjects"])[0])["namespace"] = "kubeclaw"
			case "role":
				objectValue(altered["roleRef"])["name"] = "cluster-admin"
			case "name":
				objectValue(altered["metadata"])["name"] = "other-platform-binding"
			case "extra-subject":
				altered["subjects"] = append(interfaceSlice(altered["subjects"]), map[string]interface{}{"kind": "ServiceAccount", "namespace": "kubeclaw", "name": "agent-buster"})
			}
			if len(inspectNamespaceRBAC(state(altered), expected)) != 1 {
				t.Fatalf("tampered %s %s accepted", suffix, change)
			}
		}
		ctrl.opsMCPNamespace = ""
		disabled, _ := ctrl.expectedNamespaceRBAC(item, "test-owned")
		if len(inspectNamespaceRBAC(state(valid), disabled)) != 1 {
			t.Fatal("unconfigured MCP binding accepted")
		}
		ctrl.opsMCPNamespace = "kubeclaw-ops"
		outside, _ := ctrl.expectedNamespaceRBAC(item, "prod-test")
		invalid := ctrl.namespaceRoleBinding("prod-test", role, []serviceAccountRef{{Namespace: "kubeclaw-ops", Name: "codex-ops-mcp"}})
		if len(inspectNamespaceRBAC(state(invalid), outside)) != 1 {
			t.Fatal("MCP binding outside test prefix accepted")
		}
	}
}
