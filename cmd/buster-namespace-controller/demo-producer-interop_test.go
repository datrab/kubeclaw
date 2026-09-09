package main

import (
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// This uses the original controller handler and HTTP Kubernetes/TokenReview
// contract fixture. It is not a deployed-cluster or native workload claim.
func TestNovaDemoHandoffProducerInterop(t *testing.T) {
	input := os.Getenv("KUBECLAW_DEMO_HANDOFF_INTEROP_INPUT")
	if input == "" {
		f := newReadyHTTPFixture(t, readyCredentials(t))
		status, _ := f.call("/v1/demo-ready", "producer-token", f.request)
		if status != http.StatusOK {
			t.Fatalf("original handler: %d", status)
		}
		return
	}
	bytes, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var bundle map[string]interface{}
	if err = json.Unmarshal(bytes, &bundle); err != nil {
		t.Fatal(err)
	}
	f := newReadyHTTPFixture(t, objectValue(bundle["produced"]))
	result := objectValue(bundle["result"])
	outputs := result["outputs"].([]interface{})
	auth := objectValue(objectValue(outputs[0])["value"])
	f.mu.Lock()
	f.item.Metadata.Generation = int64(intValue(auth["exposureGeneration"], 0))
	f.item.Spec["verifiedImage"] = auth["immutableImage"]
	f.item.Spec["manifestDigest"] = auth["manifestDigest"]
	f.item.Status["previewUrl"] = auth["url"]
	f.item.Status["exposureOwner"] = auth["exposureOwner"]
	f.item.Status["exposureGeneration"] = auth["exposureGeneration"]
	f.item.Metadata.Annotations[exposureOwnerAnnotation] = stringValue(auth["exposureOwner"])
	parsed, err := url.Parse(stringValue(auth["url"]))
	if err != nil {
		t.Fatal(err)
	}
	exposure := objectValue(f.item.Spec["exposure"])
	exposure["hostname"] = "127"
	exposure["path"] = parsed.Path
	pending, _ := json.Marshal(map[string]interface{}{"phase": "awaiting-readiness", "owner": auth["exposureOwner"], "leaseUID": auth["leaseUID"], "immutableImage": auth["immutableImage"], "manifestDigest": auth["manifestDigest"]})
	f.item.Metadata.Annotations["kubeclaw.forgestack.ai/readiness-handoff"] = string(pending)
	desired, err := previewExposureSpec(&f.item, f.request.Namespace)
	if err != nil {
		t.Fatal(err)
	}
	f.ingress = previewIngress(&f.item, f.request.Namespace, desired)
	objectValue(f.ingress["metadata"])["uid"] = "interop-ingress"
	objectValue(f.ingress["metadata"])["resourceVersion"] = "1"
	f.ingress["status"] = map[string]interface{}{"loadBalancer": map[string]interface{}{"ingress": []interface{}{map[string]interface{}{"hostname": parsed.Host}}}}
	f.mu.Unlock()
	// Drop the first success only after the ORIGINAL handler has completed its
	// durable CAS/readback, then allow the original readonly status endpoint.
	f.endpoint.Close()
	handler := f.controller.readinessHandler()
	var dropped atomic.Bool
	f.endpoint = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/demo-ready" && !dropped.Load() {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, r)
			if recorder.Code == http.StatusOK {
				dropped.Store(true)
				connection, _, _ := w.(http.Hijacker).Hijack()
				_ = connection.Close()
				return
			}
			for key, values := range recorder.Header() {
				w.Header()[key] = values
			}
			w.WriteHeader(recorder.Code)
			_, _ = w.Write(recorder.Body.Bytes())
			return
		}
		handler.ServeHTTP(w, r)
	}))
	output := os.Getenv("KUBECLAW_DEMO_HANDOFF_INTEROP_OUTPUT")
	if output == "" {
		t.Fatal("output required")
	}
	ca := filepath.Join(filepath.Dir(output), "controller-ca.pem")
	token := filepath.Join(filepath.Dir(output), "producer-token")
	if err = os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: f.endpoint.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(token, []byte("producer-token"), 0600); err != nil {
		t.Fatal(err)
	}
	descriptor, _ := json.Marshal(map[string]interface{}{"endpoint": f.endpoint.URL + "/v1/demo-ready", "caPath": ca, "tokenPath": token})
	if err = os.WriteFile(output, descriptor, 0600); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		if _, err = os.Stat(output + ".done"); err == nil {
			if !dropped.Load() {
				t.Fatal("original commit not observed")
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("interop client did not finish")
}
