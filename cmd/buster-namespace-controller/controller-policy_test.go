package main

import (
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func testControllerPolicy(t *testing.T) controllerPolicy {
	t.Helper()
	p, err := loadControllerPolicy("testdata/controller-policy.json")
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestControllerPolicyClosedSelection(t *testing.T) {
	raw, err := os.ReadFile("testdata/controller-policy.json")
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]interface{}
	if json.Unmarshal(raw, &fields) != nil {
		t.Fatal("fixture")
	}
	for key := range fields {
		for _, bad := range []interface{}{nil, 0, -1, 1.5, "5", true, 9223372037.0} {
			if bad == 9223372037.0 && !strings.HasSuffix(key, "Seconds") {
				continue
			}
			changed := map[string]interface{}{}
			for k, v := range fields {
				changed[k] = v
			}
			changed[key] = bad
			bytes, _ := json.Marshal(changed)
			if _, err := decodeControllerPolicy(bytes); err == nil {
				t.Fatalf("accepted %s=%v", key, bad)
			}
		}
		changed := map[string]interface{}{}
		for k, v := range fields {
			if k != key {
				changed[k] = v
			}
		}
		bytes, _ := json.Marshal(changed)
		if _, err := decodeControllerPolicy(bytes); err == nil {
			t.Fatalf("accepted missing %s", key)
		}
	}
	for _, bad := range []string{"null", "[]", string(raw) + "{}", strings.Replace(string(raw), "{", `{"readyReadTimeoutSeconds":20,`, 1), strings.Replace(string(raw), "readyReadTimeoutSeconds", "ReadyReadTimeoutSeconds", 1), strings.Replace(string(raw), "{", `{"extra":1,`, 1)} {
		if _, err := decodeControllerPolicy([]byte(bad)); err == nil {
			t.Fatalf("accepted ambiguous policy: %s", bad)
		}
	}
	if _, err := loadControllerPolicy(""); err == nil {
		t.Fatal("missing locator accepted")
	}
}

func TestControllerPolicyOriginalHTTPAndCapture(t *testing.T) {
	credentials := readyCredentials(t)
	f := newReadyHTTPFixture(t, credentials)
	p := testControllerPolicy(t)
	p.DefaultDemoRetentionSeconds = 60
	raw, _ := json.Marshal(p)
	file := filepath.Join(t.TempDir(), "policy.json")
	if err := os.WriteFile(file, raw, 0600); err != nil {
		t.Fatal(err)
	}
	var err error
	f.controller.policy, err = loadControllerPolicy(file)
	if err != nil {
		t.Fatal(err)
	}
	p.DefaultDemoRetentionSeconds = 120
	raw, _ = json.Marshal(p)
	if err := os.WriteFile(file, raw, 0600); err != nil {
		t.Fatal(err)
	}
	status, result := f.call("/v1/demo-ready", "producer-token", f.request)
	if status != 200 || result["retentionSeconds"] != float64(60) {
		t.Fatal(status, result)
	}
	// New process selects B. Existing v2 status and exact replay remain A.
	f.controller.policy, err = loadControllerPolicy(file)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	status, replay := f.call("/v1/demo-ready", "producer-token", f.request)
	if status != 200 || replay["expiresAt"] != result["expiresAt"] || replay["retentionSeconds"] != float64(60) || f.patches != 1 {
		t.Fatal(status, replay)
	}
	if _, err := loadControllerPolicy(file); err == nil {
		t.Fatal("missing owner accepted")
	}
	g := newReadyHTTPFixture(t, credentials)
	g.controller.policy = p
	status, selected := g.call("/v1/demo-ready", "producer-token", g.request)
	if status != 200 || selected["retentionSeconds"] != float64(120) {
		t.Fatal(status, selected)
	}
	g = newReadyHTTPFixture(t, credentials)
	g.controller.policy.ReadyMaximumBodyBytes = 1
	if status, _ := g.call("/v1/demo-ready", "producer-token", g.request); status != 400 || g.patches != 0 {
		t.Fatal("selected body ceiling not applied", status)
	}
	g = newReadyHTTPFixture(t, credentials)
	g.controller.policy.AuthorizationMaximumBytes = 1
	if status, _ := g.call("/v1/demo-ready", "producer-token", g.request); status != 401 || g.patches != 0 {
		t.Fatal("selected authorization ceiling not applied", status)
	}
	g = newReadyHTTPFixture(t, credentials)
	g.controller.policy.ReadyObservationMaximumAgeSeconds = 1
	g.request.ObservedAt = time.Now().Add(-2 * time.Second).UTC().Format(time.RFC3339Nano)
	if status, _ := g.call("/v1/demo-ready", "producer-token", g.request); status != 409 || g.patches != 0 {
		t.Fatal("selected observation age not applied", status)
	}
}

func TestControllerSelectedListenerLimits(t *testing.T) {
	c := testController(t)
	c.policy.ReadyReadHeaderTimeoutSeconds = 1
	c.policy.ReadyReadTimeoutSeconds = 2
	c.policy.ReadyWriteTimeoutSeconds = 3
	c.policy.ReadyIdleTimeoutSeconds = 4
	c.policy.ReadyMaxHeaderBytes = 1234
	server := c.readinessHTTPServer()
	if server.ReadHeaderTimeout != time.Second || server.ReadTimeout != 2*time.Second || server.WriteTimeout != 3*time.Second || server.IdleTimeout != 4*time.Second || server.MaxHeaderBytes != 1234 {
		t.Fatal("listener ignored selected policy", server)
	}
}

// Invoked by the real full-chart delivery regression for both A and B. Ordinary
// unit runs use the explicit local fixture, not a runtime default authority.
func TestControllerActualDeliveredPolicy(t *testing.T) {
	file := os.Getenv("CONTROLLER_TEST_DELIVERED_POLICY")
	expected := int64(604800)
	if file == "" {
		file = "testdata/controller-policy.json"
	} else {
		var err error
		expected, err = strconv.ParseInt(os.Getenv("CONTROLLER_TEST_RETENTION_SECONDS"), 10, 64)
		if err != nil {
			t.Fatal(err)
		}
	}
	policy, err := loadControllerPolicy(file)
	if err != nil {
		t.Fatal(err)
	}
	if selected := os.Getenv("CONTROLLER_TEST_API_TIMEOUT_SECONDS"); selected != "" {
		expected, err := strconv.ParseInt(selected, 10, 64)
		if err != nil || policy.HTTPClientTimeoutSeconds != expected {
			t.Fatal("delivered API timeout mismatch", policy.HTTPClientTimeoutSeconds, selected)
		}
	}
	f := newReadyHTTPFixture(t, readyCredentials(t))
	f.controller.policy = policy
	status, result := f.call("/v1/demo-ready", "producer-token", f.request)
	if status != 200 || result["retentionSeconds"] != float64(expected) {
		t.Fatal(status, result)
	}
}

func TestControllerProductPolicyAdmissionAndOriginalReplay(t *testing.T) {
	credentials := readyCredentials(t)
	f, key := productFixture(t, credentials)
	input := productInput(t, f)
	envelope := productSign(t, input, key)
	f.controller.policy.ProductDecisionMaximumValiditySeconds = 60
	before := f.patches
	if status, _ := f.call("/v1/demo-product/decisions", "producer-token", envelope); status != 409 || f.patches != before {
		t.Fatal("selected validity ceiling not applied", status)
	}
	f.controller.policy.ProductDecisionMaximumValiditySeconds = 300
	if status, result := f.call("/v1/demo-product/decisions", "producer-token", envelope); status != 200 {
		t.Fatal(status, result)
	}
	before = f.patches
	f.controller.policy.ProductDecisionMaximumValiditySeconds = 60
	if status, result := f.call("/v1/demo-product/decisions", "producer-token", envelope); status != 200 || f.patches != before {
		t.Fatal("current B invalidated exact original receipt", status, result)
	}
	g, key := productFixture(t, credentials)
	g.controller.policy.ProductMaximumBodyBytes = 1
	if status, _ := g.call("/v1/demo-product/decisions", "producer-token", productSign(t, productInput(t, g), key)); status != 400 {
		t.Fatal("selected product body ceiling not applied", status)
	}
}

// Exercise the actual trusted TLS transport, not just projected policy bytes.
func TestControllerSelectedAPITimeout(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(1200 * time.Millisecond):
			w.WriteHeader(http.StatusNoContent)
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	ca := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	policyFile := filepath.Join(t.TempDir(), "policy.json")
	p := testControllerPolicy(t)
	p.HTTPClientTimeoutSeconds = 1
	raw, _ := json.Marshal(p)
	if err := os.WriteFile(policyFile, raw, 0600); err != nil {
		t.Fatal(err)
	}
	captured, err := loadControllerPolicy(policyFile)
	if err != nil {
		t.Fatal(err)
	}
	a, err := kubernetesHTTPClientFromCA(ca, captured)
	if err != nil {
		t.Fatal(err)
	}
	defer a.CloseIdleConnections()
	p.HTTPClientTimeoutSeconds = 2
	raw, _ = json.Marshal(p)
	if err := os.WriteFile(policyFile, raw, 0600); err != nil {
		t.Fatal(err)
	}
	selected, err := loadControllerPolicy(policyFile)
	if err != nil {
		t.Fatal(err)
	}
	b, err := kubernetesHTTPClientFromCA(ca, selected)
	if err != nil {
		t.Fatal(err)
	}
	defer b.CloseIdleConnections()
	if err := os.Remove(policyFile); err != nil {
		t.Fatal(err)
	}
	if a.Timeout != time.Second || b.Timeout != 2*time.Second {
		t.Fatal("selection not captured")
	}
	if response, err := a.Get(server.URL); err == nil {
		response.Body.Close()
		t.Fatal("A timeout ignored")
	}
	response, err := b.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatal(response.Status)
	}
	if _, err := loadControllerPolicy(policyFile); err == nil {
		t.Fatal("missing owner accepted")
	}
	if _, err := kubernetesHTTPClientFromCA(ca, controllerPolicy{}); err == nil {
		t.Fatal("zero policy accepted as unlimited")
	}
}
