package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratedCredentialHTTPProvenanceAndRestart(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Metadata: metadata{Name: "lease-one", UID: "lease-uid-one"}, Spec: map[string]interface{}{
		"access":          []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}},
		"testCredentials": map[string]interface{}{"mode": "generate", "secretName": "demo-login", "readers": []interface{}{"kubeclaw/agent-nova"}},
	}}
	file := filepath.Join(t.TempDir(), "secret.json")
	leaseFile := filepath.Join(filepath.Dir(file), "lease.json")
	persistLease := func(status map[string]interface{}) {
		t.Helper()
		data, _ := json.Marshal(map[string]interface{}{"metadata": map[string]interface{}{"uid": item.Metadata.UID, "resourceVersion": "1"}, "status": status})
		if err := os.WriteFile(leaseFile, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	persistLease(map[string]interface{}{})
	creates := 0
	dropCreateResponse := true
	rejectIntent := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/status") {
			data, _ := os.ReadFile(leaseFile)
			if r.Method == http.MethodPatch {
				if rejectIntent {
					http.Error(w, "conflict", 409)
					return
				}
				var body map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if stringValue(objectValue(body["metadata"])["resourceVersion"]) != "1" {
					http.Error(w, "conflict", 409)
					return
				}
				persistLease(objectValue(body["status"]))
				data, _ = os.ReadFile(leaseFile)
			}
			_, _ = w.Write(data)
			return
		}
		if strings.Contains(r.URL.Path, "/secrets") {
			if r.Method == http.MethodGet {
				bytes, err := os.ReadFile(file)
				if err != nil {
					http.Error(w, "missing", 404)
					return
				}
				_, _ = w.Write(bytes)
				return
			}
			if r.Method != http.MethodPost {
				t.Error("unexpected Secret mutation")
				http.Error(w, "denied", 403)
				return
			}
			creates++
			persisted, _ := os.ReadFile(leaseFile)
			var durable map[string]interface{}
			_ = json.Unmarshal(persisted, &durable)
			if stringValue(objectValue(objectValue(durable["status"])["generatedCredentialIntent"])["credentialDigest"]) == "" {
				t.Error("Secret POST before durable intent")
			}
			var secret map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&secret); err != nil {
				t.Error(err)
				return
			}
			metadata := objectValue(secret["metadata"])
			metadata["uid"] = "secret-uid-one"
			metadata["resourceVersion"] = "1"
			data := map[string]interface{}{}
			for key, value := range objectValue(secret["stringData"]) {
				data[key] = base64.StdEncoding.EncodeToString([]byte(stringValue(value)))
			}
			secret["data"] = data
			delete(secret, "stringData")
			bytes, _ := json.Marshal(secret)
			if err := os.WriteFile(file, bytes, 0600); err != nil {
				t.Error(err)
			}
			if dropCreateResponse {
				dropCreateResponse = false
				connection, _, err := w.(http.Hijacker).Hijack()
				if err != nil {
					t.Error(err)
					return
				}
				_ = connection.Close()
				return
			}
			_, _ = w.Write(bytes)
			return
		}
		if r.Method == http.MethodGet {
			http.Error(w, "missing", 404)
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("lost create response must remain uncertain")
	}
	first, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned")
	if err != nil {
		t.Fatal(err)
	}
	proof := objectValue(first["generatedCredentials"])
	if stringValue(proof["leaseUID"]) != "lease-uid-one" || stringValue(proof["secretUID"]) != "secret-uid-one" {
		t.Fatalf("missing source identity: %#v", proof)
	}
	item.Status["generatedCredentials"] = proof
	persistLease(item.Status)
	recovered := *ctrl
	second, err := recovered.ensureTestCredentials(context.Background(), item, "test-owned")
	if err != nil {
		t.Fatal(err)
	}
	if creates != 1 || stringValue(objectValue(second["generatedCredentials"])["credentialDigest"]) != stringValue(proof["credentialDigest"]) {
		t.Fatal("restart regenerated credentials")
	}
	bytes, _ := os.ReadFile(file)
	var secret map[string]interface{}
	_ = json.Unmarshal(bytes, &secret)
	objectValue(secret["metadata"])["uid"] = "replacement-secret"
	bytes, _ = json.Marshal(secret)
	_ = os.WriteFile(file, bytes, 0600)
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("replacement Secret must reject")
	}
	// Copied tags and private credential values are not controller creation authority.
	persistLease(map[string]interface{}{})
	item.Status = nil
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("prepopulated immutable Secret with copied metadata must reject")
	}
	if creates != 1 {
		t.Fatal("prepopulation must not trigger creation")
	}
	// A committed intent without its Secret is unknown, not permission to regenerate.
	persistLease(map[string]interface{}{"generatedCredentialIntent": map[string]interface{}{"leaseUID": item.Metadata.UID, "namespace": "test-owned", "secretName": "demo-login", "credentialDigest": proof["credentialDigest"]}})
	_ = os.Remove(file)
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("missing committed Secret must remain unresolved")
	}
	if creates != 1 {
		t.Fatal("unknown creation regenerated a password")
	}
	persistLease(map[string]interface{}{})
	rejectIntent = true
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("conflicting intent CAS must reject")
	}
	if creates != 1 {
		t.Fatal("Secret POST followed failed intent CAS")
	}
	rejectIntent = false
	delete(objectValue(secret["metadata"]), "annotations")
	bytes, _ = json.Marshal(secret)
	_ = os.WriteFile(file, bytes, 0600)
	item.Status = nil
	if _, err := ctrl.ensureTestCredentials(context.Background(), item, "test-owned"); err == nil {
		t.Fatal("key-only Secret must not become generated provenance")
	}
}
