package main

import (
	"encoding/json"
	"strings"
)

// Credential provisioning and inventory share one exact authority contract.
func (c *controller) credentialAccessObjects(namespace string, request *testCredentialRequest) []map[string]interface{} {
	out := []map[string]interface{}{}
	for _, mode := range []string{"reader", "writer"} {
		if mode == "writer" && request.Mode != "existing" {
			continue
		}
		name := "buster-preview-credentials-" + mode
		verb := "get"
		subjects := request.Readers
		if mode == "writer" {
			verb = "patch"
			subjects = request.Writers
		}
		out = append(out, map[string]interface{}{
			"apiVersion": "rbac.authorization.k8s.io/v1", "kind": "Role",
			"metadata": map[string]interface{}{"name": name, "namespace": namespace},
			"rules":    []interface{}{map[string]interface{}{"apiGroups": []string{""}, "resources": []string{"secrets"}, "resourceNames": []string{request.SecretName}, "verbs": []string{verb}}},
		}, c.namespaceRoleBinding(namespace, name, subjects, "Role"))
	}
	return out
}

func (c *controller) expectedNamespaceRBAC(item *lease, namespace string) ([]map[string]interface{}, error) {
	requests, err := c.accessRequests(item)
	if err != nil {
		return nil, err
	}
	out := []map[string]interface{}{c.controllerSecretRoleBinding(namespace, c.secretRoleName)}
	for _, mode := range []string{"deployer", "tester"} {
		subjects := []serviceAccountRef{}
		for _, request := range requests {
			if request.Mode == mode {
				subjects = append(subjects, request.Subject)
			}
		}
		if len(subjects) == 0 {
			continue
		}
		name := c.testerRoleName
		if mode == "deployer" {
			name = c.deployerRoleName
		}
		out = append(out, c.namespaceRoleBinding(namespace, name, subjects))
	}
	// The Ops reconciler adds these two exact platform bindings to all test*
	// namespaces. Recognize their authority without creating or managing them.
	// Pod labels and binding labels are not an authority exemption.
	if c.opsMCPNamespace != "" && c.opsMCPRelease != "" && strings.HasPrefix(strings.ToLower(namespace), "test") {
		for _, suffix := range []string{"reader", "test-exec"} {
			role := c.opsMCPNamespace + "-" + c.opsMCPRelease + "-" + suffix
			out = append(out, c.namespaceRoleBinding(namespace, role, []serviceAccountRef{{Namespace: c.opsMCPNamespace, Name: c.opsMCPRelease + "-mcp"}}))
		}
	}

	credentials, err := c.credentialRequest(item)
	if err != nil {
		return nil, err
	}
	if credentials != nil {
		out = append(out, c.credentialAccessObjects(namespace, credentials)...)
	}
	return out, nil
}

func rbacAuthority(resource map[string]interface{}) string {
	// Ignore API-managed metadata; compare namespace identity and every authority field.
	metadata := objectValue(resource["metadata"])
	value := map[string]interface{}{"kind": resource["kind"], "namespace": metadata["namespace"], "name": metadata["name"]}
	for _, key := range []string{"roleRef", "subjects", "rules", "aggregationRule"} {
		if field, exists := resource[key]; exists {
			value[key] = field
		}
	}
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func inspectNamespaceRBAC(state map[string]map[string]interface{}, expected []map[string]interface{}) []interface{} {
	allowed := map[string]bool{}
	for _, resource := range expected {
		allowed[rbacAuthority(resource)] = true
	}
	findings := []interface{}{}
	for _, kind := range []string{"roles", "rolebindings"} {
		for _, raw := range securityItems(state[kind]) {
			resource := objectValue(raw)
			if allowed[rbacAuthority(resource)] {
				continue
			}
			name := stringValueDefault(objectValue(resource["metadata"])["name"], "unknown")
			findings = append(findings, securityFinding("runtime:"+kind+":"+name, "high", "Namespace RBAC differs from authorized lease authority.", kind+"/"+name))
		}
	}
	return findings
}
