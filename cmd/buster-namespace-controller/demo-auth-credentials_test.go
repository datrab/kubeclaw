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

// Optional test artifact connects the original random credential producer to a
// real local application test. The HTTP API is a wire fixture, not a cluster.
func TestDemoAuthenticationCredentialProducer(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Metadata: metadata{Name: "demo-auth-lease", UID: "native-http-lease-uid"}, Spec: map[string]interface{}{
		"access":          []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}},
		"testCredentials": map[string]interface{}{"mode": "generate", "secretName": "demo-login", "readers": []interface{}{"kubeclaw/agent-nova"}},
	}}
	state := map[string]interface{}{}
	var secret map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/status") {
			if r.Method == http.MethodPatch {
				var body map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if stringValue(objectValue(body["metadata"])["resourceVersion"]) != "1" {
					http.Error(w, "conflict", 409)
					return
				}
				state = objectValue(body["status"])
			}
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"uid": item.Metadata.UID, "resourceVersion": "1"}, "status": state})
			return
		}
		if strings.Contains(r.URL.Path, "/secrets") {
			if r.Method == http.MethodPost {
				if len(objectValue(state["generatedCredentialIntent"])) == 0 {
					t.Error("creation without intent")
				}
				_ = json.NewDecoder(r.Body).Decode(&secret)
				metadata := objectValue(secret["metadata"])
				metadata["uid"] = "native-http-secret-uid"
				metadata["resourceVersion"] = "1"
				data := map[string]interface{}{}
				for key, value := range objectValue(secret["stringData"]) {
					data[key] = base64.StdEncoding.EncodeToString([]byte(stringValue(value)))
				}
				secret["data"] = data
				delete(secret, "stringData")
			}
			if secret == nil {
				http.Error(w, "missing", 404)
				return
			}
			_ = json.NewEncoder(w).Encode(secret)
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
	result, err := ctrl.ensureTestCredentials(context.Background(), item, "test-demo-auth")
	if err != nil {
		t.Fatal(err)
	}
	if stringValue(objectValue(result["generatedCredentials"])["credentialDigest"]) == "" {
		t.Fatal("missing actual proof")
	}
	output := os.Getenv("KUBECLAW_DEMO_AUTH_TEST_OUTPUT")
	if output == "" {
		output = filepath.Join(t.TempDir(), "credentials.json")
	}
	bytes, _ := json.Marshal(map[string]interface{}{"source": result["generatedCredentials"], "secret": secret})
	if err := os.WriteFile(output, bytes, 0600); err != nil {
		t.Fatal(err)
	}
}
