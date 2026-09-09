package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"strings"
	"testing"
)

func TestRotatedTokenAndLongLeaseCleanup(t *testing.T) {
	for _, length := range []int{63, 64, 253} {
		t.Run(fmt.Sprint(length), func(t *testing.T) {
			ctrl := testController(t)
			item := &lease{Metadata: metadata{Name: strings.Repeat("x", length), UID: "canonical-uid", CreationTimestamp: "2020-01-01T00:00:00Z"}, Spec: map[string]interface{}{"access": []interface{}{map[string]interface{}{"subject": "agent-buster", "mode": "tester"}}}}
			namespace := map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(item, "test-owned")}}
			if err := verifyNamespaceLabels(item, "test-owned", namespace); err != nil {
				t.Fatal(err)
			}
			accepted := "test-token"
			deleted := false
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer "+accepted {
					w.WriteHeader(401)
					return
				}
				if r.URL.Path == "/api/v1/namespaces/test-owned" {
					if r.Method == http.MethodDelete {
						deleted = true
					}
					if deleted {
						w.WriteHeader(404)
						return
					}
					_ = json.NewEncoder(w).Encode(namespace)
					return
				}
				_, _ = w.Write([]byte(`{}`))
			}))
			defer server.Close()
			ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
			if err := ctrl.verifyNamespaceOwnership(context.Background(), item, "test-owned"); err != nil {
				t.Fatal(err)
			}
			next := ctrl.tokenPath + ".next"
			if err := os.WriteFile(next, []byte("rotated-test-token"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.Rename(next, ctrl.tokenPath); err != nil {
				t.Fatal(err)
			}
			accepted = "rotated-test-token"
			other := *item
			other.Metadata.UID = "different-uid"
			if err := ctrl.deleteOwnedNamespace(context.Background(), &other, "test-owned"); err == nil || deleted {
				t.Fatal("foreign UID must prevent deletion")
			}
			if _, err := ctrl.expireLease(context.Background(), item, "test-owned"); err != nil {
				t.Fatal(err)
			}
			if !deleted {
				t.Fatal("expiry did not delete owned namespace after rotation")
			}
			if err := os.Remove(ctrl.tokenPath); err != nil {
				t.Fatal(err)
			}
			if err := ctrl.kube(context.Background(), http.MethodGet, "/", nil, "application/json", nil); err == nil {
				t.Fatal("missing token must fail closed")
			}
		})
	}
}

func TestProvisionedConfiguredRBACIsExactAuthority(t *testing.T) {
	for _, mode := range []string{"generate", "existing"} {
		t.Run(mode, func(t *testing.T) {
			ctrl := testController(t)
			ctrl.secretRoleName, ctrl.deployerRoleName, ctrl.testerRoleName = "custom-controller-secrets", "custom-deployer", "custom-tester"
			item := &lease{Metadata: metadata{Name: "lease", UID: "uid"}, Spec: map[string]interface{}{
				"access":          []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}, map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"}},
				"testCredentials": map[string]interface{}{"mode": mode, "secretName": "demo-login", "keys": []interface{}{"username", "password"}, "readers": []interface{}{"kubeclaw/agent-nova", "kubeclaw/agent-buster"}},
			}}
			state := map[string]map[string]interface{}{"roles": {"items": []interface{}{}}, "rolebindings": {"items": []interface{}{}}}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					if r.URL.Path == "/api/v1/namespaces/test-owned" {
						_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(item, "test-owned")}})
					} else {
						_ = json.NewEncoder(w).Encode(state[path.Base(r.URL.Path)])
					}
					return
				}
				if r.Method == http.MethodPost {
					var resource map[string]interface{}
					if err := json.NewDecoder(r.Body).Decode(&resource); err != nil {
						t.Error(err)
					}
					kind := "rolebindings"
					if resource["kind"] == "Role" {
						kind = "roles"
					}
					state[kind]["items"] = append(interfaceSlice(state[kind]["items"]), resource)
				}
				_, _ = w.Write([]byte(`{}`))
			}))
			defer server.Close()
			ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
			if err := ctrl.ensureControllerSecretAccess(context.Background(), "test-owned"); err != nil {
				t.Fatal(err)
			}
			if err := ctrl.ensureNamespaceAccess(context.Background(), item, "test-owned"); err != nil {
				t.Fatal(err)
			}
			request, err := ctrl.credentialRequest(item)
			if err != nil {
				t.Fatal(err)
			}
			if err := ctrl.ensureCredentialAccess(context.Background(), "test-owned", request); err != nil {
				t.Fatal(err)
			}
			expected, err := ctrl.expectedNamespaceRBAC(item, "test-owned")
			if err != nil {
				t.Fatal(err)
			}
			if findings := inspectNamespaceRBAC(state, expected); len(findings) != 0 {
				t.Fatalf("own provisioned RBAC rejected: %v", findings)
			}
			item.Spec["verifiedImage"], item.Spec["manifestDigest"] = "registry.local/app@sha256:"+strings.Repeat("a", 64), "sha256:"+strings.Repeat("b", 64)
			snapshot, err := ctrl.runtimeSecurityStatus(context.Background(), item, "test-owned")
			if err != nil || snapshot["phase"] != "Observed" || len(interfaceSlice(snapshot["findings"])) != 0 {
				t.Fatalf("wire inventory rejected actual provisioned RBAC: %v %v", snapshot, err)
			}
			for _, field := range []string{"subjects", "roleRef", "rules"} {
				changed := map[string]map[string]interface{}{}
				bytes, _ := json.Marshal(state)
				_ = json.Unmarshal(bytes, &changed)
				kind := "rolebindings"
				if field == "rules" {
					kind = "roles"
				}
				objectValue(securityItems(changed[kind])[0])[field] = []interface{}{"tampered"}
				if len(inspectNamespaceRBAC(changed, expected)) != 1 {
					t.Fatalf("changed %s authority was accepted", field)
				}
			}
		})
	}
}
