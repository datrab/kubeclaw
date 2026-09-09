package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// The original credential producer runs unchanged in a native test subprocess.
// Kubernetes/TokenReview/Discord facts below are explicitly HTTP contract vectors,
// not claims of a deployed cluster, authenticated Nova producer or Discord send.
func readyCredentials(t *testing.T) map[string]interface{} {
	t.Helper()
	output := filepath.Join(t.TempDir(), "credentials.json")
	command := exec.Command(os.Args[0], "-test.run=^TestDemoAuthenticationCredentialProducer$")
	command.Env = append(os.Environ(), "KUBECLAW_DEMO_AUTH_TEST_OUTPUT="+output)
	if b, err := command.CombinedOutput(); err != nil {
		t.Fatalf("original credential producer: %v %s", err, b)
	}
	b, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]interface{}
	if err = json.Unmarshal(b, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

type readyHTTPFixture struct {
	ingress                                             map[string]interface{}
	namespaceTerminating, secretMissing, ingressMissing bool
	pruneReadiness, pruneClaim, pruneRetention          bool
	delaySecretUntil                                    time.Time
	delayedSecretReads                                  int
	t                                                   *testing.T
	mu                                                  sync.Mutex
	item                                                lease
	secret                                              map[string]interface{}
	version                                             int
	controller                                          *controller
	api, endpoint                                       *httptest.Server
	request                                             demoReadyRequest
	patches, deletes                                    int
	conflict, drop, deleted                             bool
	username, audience                                  string
}

func newReadyHTTPFixture(t *testing.T, credentials map[string]interface{}) *readyHTTPFixture {
	t.Helper()
	encoded, _ := json.Marshal(credentials)
	var copy map[string]interface{}
	_ = json.Unmarshal(encoded, &copy)
	proof := objectValue(copy["source"])
	secret := objectValue(copy["secret"])
	digest := "sha256:" + strings.Repeat("a", 64)
	owner := "pending-owner"
	namespace := stringValue(proof["namespace"])
	f := &readyHTTPFixture{t: t, secret: secret, version: 1, username: "system:serviceaccount:kubeclaw:agent-nova", audience: "kubeclaw-demo-ready"}
	f.item = lease{Metadata: metadata{Name: "demo-auth-lease", UID: stringValue(proof["leaseUID"]), ResourceVersion: "1", Generation: 1, CreationTimestamp: time.Now().UTC().Add(-time.Hour).Format(time.RFC3339), Annotations: map[string]string{exposureOwnerAnnotation: owner}}, Spec: map[string]interface{}{"purpose": "final-preview", "namespaceName": namespace, "cleanupPolicy": "retain", "ttlSeconds": 7200, "verifiedImage": "registry.example/app@" + digest, "manifestDigest": digest, "exposure": map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "app", "servicePort": 80, "hostname": "demo", "path": "/"}}, Status: map[string]interface{}{"phase": "Ready", "namespaceName": namespace, "previewUrl": "https://demo.example/", "exposurePhase": "Ready", "exposureOwner": owner, "exposureGeneration": 1, "generatedCredentials": proof, "generatedCredentialIntent": map[string]interface{}{"leaseUID": proof["leaseUID"], "namespace": namespace, "secretName": proof["secretName"], "credentialDigest": proof["credentialDigest"]}}}
	pending, _ := json.Marshal(map[string]interface{}{"phase": "awaiting-readiness", "owner": owner, "leaseUID": proof["leaseUID"], "immutableImage": f.item.Spec["verifiedImage"], "manifestDigest": digest})
	f.item.Metadata.Annotations["kubeclaw.forgestack.ai/readiness-handoff"] = string(pending)
	f.request = demoReadyRequest{SchemaVersion: "demo-ready-request.v1", RequestID: "candidate-1", RunID: "actual-run-contract-vector", SourceRevision: "git:" + strings.Repeat("b", 40), CandidateDigest: digest, DecisionDigest: digest, ResultDigest: digest, LeaseName: f.item.Metadata.Name, LeaseUID: f.item.Metadata.UID, Namespace: namespace, ImmutableImage: stringValue(f.item.Spec["verifiedImage"]), ManifestDigest: digest, CredentialDigest: stringValue(proof["credentialDigest"]), SecretUID: stringValue(proof["secretUID"]), ExposureOwner: owner, ExposureGeneration: 1, URL: "https://demo.example/", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Receipt: demoReceipt{SchemaVersion: "discord-delivery-receipt.v1", Accepted: true, Target: "operator-contract-vector", Status: 200, MessageID: "123456789", DeliveryID: "delivery-1", PayloadDigest: digest}}
	exposure, _ := previewExposureSpec(&f.item, namespace)
	f.ingress = previewIngress(&f.item, namespace, exposure)
	objectValue(f.ingress["metadata"])["uid"] = "ingress-uid"
	objectValue(f.ingress["metadata"])["resourceVersion"] = "1"
	f.ingress["status"] = map[string]interface{}{"loadBalancer": map[string]interface{}{"ingress": []interface{}{map[string]interface{}{"hostname": "demo.example"}}}}
	f.controller = testController(t)
	f.controller.readiness = &readinessConfig{Audience: f.audience, Producer: f.username}
	f.api = httptest.NewServer(http.HandlerFunc(f.kubernetes))
	f.controller.apiURL = f.api.URL
	f.controller.httpClient = f.api.Client()
	f.endpoint = httptest.NewTLSServer(f.controller.readinessHandler())
	t.Cleanup(func() { f.endpoint.Close(); f.api.Close() })
	return f
}
func (f *readyHTTPFixture) kubernetes(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if r.URL.Path == "/apis/authentication.k8s.io/v1/tokenreviews" {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		spec := objectValue(body["spec"])
		if encoded, _ := json.Marshal(spec["audiences"]); string(encoded) != `["kubeclaw-demo-ready"]` {
			f.t.Error("wrong TokenReview audience")
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": map[string]interface{}{"authenticated": spec["token"] == "producer-token", "audiences": []string{f.audience}, "user": map[string]interface{}{"username": f.username}}})
		return
	}
	if r.URL.Path == f.controller.leasePath(f.item.Metadata.Name) || r.URL.Path == f.controller.statusPath(f.item.Metadata.Name) {
		if r.Method == http.MethodPatch {
			var patch map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&patch)
			if f.conflict {
				f.version++
				f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
				f.conflict = false
			}
			if objectValue(patch["metadata"])["resourceVersion"] != f.item.Metadata.ResourceVersion {
				http.Error(w, "conflict", 409)
				return
			}
			for k, v := range objectValue(patch["status"]) {
				if (k == "demoReadiness" && f.pruneReadiness) || (k == "exposureMutation" && f.pruneClaim) {
					continue
				}
				if k == "demoReadiness" && f.pruneRetention {
					delete(objectValue(v), "retentionSeconds")
				}
				f.item.Status[k] = v
			}
			f.version++
			f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
			f.patches++
			if f.drop {
				f.drop = false
				connection, _, _ := w.(http.Hijacker).Hijack()
				_ = connection.Close()
				return
			}
		}
		_ = json.NewEncoder(w).Encode(f.item)
		return
	}
	if strings.Contains(r.URL.Path, "/ingresses/") {
		if f.ingressMissing {
			http.Error(w, "missing", 404)
			return
		}
		if r.Method == http.MethodPatch {
			var next map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&next)
			if objectValue(next["metadata"])["resourceVersion"] != objectValue(f.ingress["metadata"])["resourceVersion"] {
				http.Error(w, "conflict", 409)
				return
			}
			next["status"] = f.ingress["status"]
			objectValue(next["metadata"])["uid"] = "ingress-uid"
			version, _ := strconv.Atoi(stringValue(objectValue(f.ingress["metadata"])["resourceVersion"]))
			objectValue(next["metadata"])["resourceVersion"] = strconv.Itoa(version + 1)
			f.ingress = next
		}
		if r.Method == http.MethodDelete {
			f.ingressMissing = true
			_, _ = w.Write([]byte(`{}`))
			return
		}
		_ = json.NewEncoder(w).Encode(f.ingress)
		return
	}
	if strings.Contains(r.URL.Path, "/services/") {
		_, _ = w.Write([]byte(`{"spec":{"ports":[{"port":80,"targetPort":80}]}}`))
		return
	}
	if strings.Contains(r.URL.Path, "/endpoints/") {
		_, _ = w.Write([]byte(`{"subsets":[{"addresses":[{"ip":"10.0.0.1"}],"ports":[{"port":80}]}]}`))
		return
	}
	if strings.Contains(r.URL.Path, "/secrets/") {
		if !f.delaySecretUntil.IsZero() {
			f.delayedSecretReads++
			if delay := time.Until(f.delaySecretUntil); delay > 0 {
				time.Sleep(delay)
			}
		}
		if f.secretMissing {
			http.Error(w, "missing", 404)
			return
		}
		_ = json.NewEncoder(w).Encode(f.secret)
		return
	}
	if r.URL.Path == "/api/v1/namespaces/"+f.request.Namespace {
		if r.Method == http.MethodDelete {
			var body map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if p := objectValue(body["preconditions"]); p["uid"] != "namespace-uid" || p["resourceVersion"] != "1" {
				http.Error(w, "conflict", 409)
				return
			}
			f.deletes++
			f.deleted = true
			_, _ = w.Write([]byte(`{}`))
			return
		}
		if f.deleted {
			http.Error(w, "missing", 404)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"name": f.request.Namespace, "uid": "namespace-uid", "resourceVersion": "1", "deletionTimestamp": func() string {
			if f.namespaceTerminating {
				return time.Now().Format(time.RFC3339)
			}
			return ""
		}(), "labels": ownerLabels(&f.item, f.request.Namespace)}})
		return
	}
	if r.Method == http.MethodGet {
		http.Error(w, "missing", 404)
		return
	}
	_, _ = w.Write([]byte(`{}`))
}
func (f *readyHTTPFixture) call(path, token string, input interface{}) (int, map[string]interface{}) {
	f.t.Helper()
	b, _ := json.Marshal(input)
	request, _ := http.NewRequest(http.MethodPost, f.endpoint.URL+path, bytes.NewReader(b))
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := f.endpoint.Client().Do(request)
	if err != nil {
		f.t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	var value map[string]interface{}
	if json.Unmarshal(body, &value) != nil {
		value = map[string]interface{}{"error": strings.TrimSpace(string(body))}
	}
	return response.StatusCode, value
}
func (f *readyHTTPFixture) snapshot() *lease {
	f.mu.Lock()
	defer f.mu.Unlock()
	b, _ := json.Marshal(f.item)
	var item lease
	_ = json.Unmarshal(b, &item)
	return &item
}

func TestDemoReadyAuthenticatedCASAndRecovery(t *testing.T) {
	credentials := readyCredentials(t)
	t.Run("exact audience and producer required", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		for _, which := range []string{"token", "subject", "audience"} {
			token := "producer-token"
			f.mu.Lock()
			f.username = f.controller.readiness.Producer
			f.audience = f.controller.readiness.Audience
			if which == "token" {
				token = "foreign"
			}
			if which == "subject" {
				f.username = "system:serviceaccount:kubeclaw:agent-buster"
			}
			if which == "audience" {
				f.audience = "kubernetes"
			}
			f.mu.Unlock()
			if status, _ := f.call("/v1/demo-ready", token, f.request); status != 401 {
				t.Fatal(which, status)
			}
		}
		if f.patches != 0 {
			t.Fatal("unauthorized mutation")
		}
	})
	t.Run("commit replay and shared seven-day expiry", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		prior := f.snapshot()
		status, result := f.call("/v1/demo-ready", "producer-token", f.request)
		if status != 200 {
			t.Fatal(status)
		}
		wire, _ := json.Marshal(f.request)
		if result["requestDigest"] != fmt.Sprintf("sha256:%x", sha256.Sum256(wire)) {
			t.Fatal("response not bound to transmitted bytes")
		}
		ready, _ := time.Parse(time.RFC3339, stringValue(result["readyAt"]))
		expiry, _ := time.Parse(time.RFC3339, stringValue(result["expiresAt"]))
		if expiry.Sub(ready) != demoRetention || !f.controller.expiresAt(f.snapshot()).Equal(expiry) {
			t.Fatal("retention mismatch")
		}
		status, replay := f.call("/v1/demo-ready", "producer-token", f.request)
		if status != 200 || fmt.Sprint(replay) != fmt.Sprint(result) || f.patches != 1 {
			t.Fatal("replay extended or changed")
		}
		f.request.Receipt.MessageID = "987654321"
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 {
			t.Fatal("changed delivery accepted")
		}
		prior.Metadata.CreationTimestamp = time.Now().Add(-3 * time.Hour).Format(time.RFC3339)
		if _, err := f.controller.expireLease(context.Background(), prior, f.request.Namespace); err == nil {
			t.Fatal("stale expiry overwrote readiness")
		}
		if f.deletes != 0 {
			t.Fatal("stale cleanup deleted namespace")
		}
		f.mu.Lock()
		f.item.Spec["purpose"] = "gate"
		f.item.Spec["exposure"] = map[string]interface{}{"provider": "off"}
		f.item.Metadata.Annotations[exposureOwnerAnnotation] = "late-attempt"
		f.item.Metadata.Generation++
		f.mu.Unlock()
		exposure, err := previewExposureSpec(f.snapshot(), f.request.Namespace)
		if err != nil || exposure == nil {
			t.Fatal("old cleanup disabled committed exposure")
		}
		if effectiveExposureOwner(f.snapshot()) == "late-attempt" {
			t.Fatal("annotation superseded Ready owner")
		}
		current := f.snapshot()
		observed, err := f.controller.ensurePreviewExposure(context.Background(), current, f.request.Namespace)
		if err != nil || observed["exposurePhase"] != "Ready" || f.ingressMissing {
			t.Fatalf("late original purpose cleanup revoked retained ingress: %v", err)
		}
	})
	t.Run("lost status POST response recovers without renewal", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		f.drop = true
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 {
			t.Fatal(status)
		}
		status, result := f.call("/v1/demo-ready/status", "producer-token", demoReadyStatusRequest{SchemaVersion: "demo-ready-status-request.v1", LeaseName: f.request.LeaseName, LeaseUID: f.request.LeaseUID, RequestID: f.request.RequestID})
		if status != 200 || result["state"] != "ready-for-acceptance" || f.patches != 1 {
			t.Fatal("durable recovery failed")
		}
	})
	t.Run("CAS conflict no mutation and deleting lease rejects", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		f.conflict = true
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || f.patches != 0 {
			t.Fatal("CAS bypass")
		}
		f.mu.Lock()
		f.item.Metadata.DeletionTimestamp = time.Now().Format(time.RFC3339)
		f.mu.Unlock()
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 {
			t.Fatal("deleting lease accepted")
		}
	})
	t.Run("manual cleanup remains immediate", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
			t.Fatal(status)
		}
		f.mu.Lock()
		f.item.Metadata.DeletionTimestamp = time.Now().Format(time.RFC3339)
		f.mu.Unlock()
		if err := f.controller.reconcileDeletedLease(context.Background(), f.snapshot(), f.request.Namespace); err != nil {
			t.Fatal(err)
		}
		if f.deletes != 1 {
			t.Fatal("manual cleanup blocked")
		}
	})
	t.Run("changed source stale observation and foreign Secret reject", func(t *testing.T) {
		for _, kind := range []string{"image", "observation", "secret", "owner"} {
			f := newReadyHTTPFixture(t, credentials)
			switch kind {
			case "image":
				f.request.ImmutableImage = "foreign@sha256:" + strings.Repeat("b", 64)
			case "observation":
				f.request.ObservedAt = time.Now().Add(-6 * time.Minute).Format(time.RFC3339)
			case "secret":
				f.request.SecretUID = "foreign"
			case "owner":
				f.request.ExposureOwner = "foreign"
			}
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || f.patches != 0 {
				t.Fatal(kind, status)
			}
		}
	})
	t.Run("committed status and replay recheck actual live objects", func(t *testing.T) {
		for _, kind := range []string{"namespace", "secret", "ingress", "image"} {
			f := newReadyHTTPFixture(t, credentials)
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
				t.Fatal(status)
			}
			f.mu.Lock()
			switch kind {
			case "namespace":
				f.namespaceTerminating = true
			case "secret":
				f.secretMissing = true
			case "ingress":
				f.ingressMissing = true
			case "image":
				f.item.Spec["verifiedImage"] = "changed"
				f.version++
				f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
			}
			f.mu.Unlock()
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 {
				t.Fatal(kind, "replay", status)
			}
			if status, _ := f.call("/v1/demo-ready/status", "producer-token", demoReadyStatusRequest{SchemaVersion: "demo-ready-status-request.v1", LeaseName: f.request.LeaseName, LeaseUID: f.request.LeaseUID, RequestID: f.request.RequestID}); status != 409 {
				t.Fatal(kind, "status", status)
			}
			if f.patches != 1 {
				t.Fatal("invalid replay changed state")
			}
		}
	})
	t.Run("exclusive operation claim prevents second reconciler and restart adoption", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		owner := f.snapshot()
		if err := f.controller.fenceExposureMutation(context.Background(), owner); err != nil {
			t.Fatal(err)
		}
		other := f.snapshot()
		if err := f.controller.fenceExposureMutation(context.Background(), other); err == nil {
			t.Fatal("second reconciler acquired unresolved operation")
		}
		if err := f.controller.patchLeaseStatus(context.Background(), f.snapshot(), map[string]interface{}{"exposurePhase": "Ready"}); err == nil {
			t.Fatal("restart adopted unknown external action")
		}
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 {
			t.Fatal("active operation granted Ready")
		}
		if err := f.controller.patchLeaseStatus(context.Background(), owner, map[string]interface{}{"exposurePhase": "Ready"}); err != nil {
			t.Fatal(err)
		}
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
			t.Fatal(status)
		}
		if err := f.controller.fenceExposureMutation(context.Background(), owner); err == nil {
			t.Fatal("old operation survived Ready CAS")
		}
	})
	t.Run("terminating namespace or Secret and missing ingress cannot first admit", func(t *testing.T) {
		for _, kind := range []string{"namespace", "secret", "ingress"} {
			f := newReadyHTTPFixture(t, credentials)
			f.mu.Lock()
			switch kind {
			case "namespace":
				f.namespaceTerminating = true
			case "secret":
				objectValue(f.secret["metadata"])["deletionTimestamp"] = time.Now().Format(time.RFC3339)
			case "ingress":
				f.ingressMissing = true
			}
			f.mu.Unlock()
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || f.patches != 0 {
				t.Fatal(kind, status)
			}
		}
	})
	t.Run("server pruning cannot fake a persisted Ready or operation claim", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		f.pruneReadiness = true
		if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_COMMIT_UNCERTAIN" {
			t.Fatal(status, result)
		}
		g := newReadyHTTPFixture(t, credentials)
		g.pruneClaim = true
		if err := g.controller.fenceExposureMutation(context.Background(), g.snapshot()); err == nil {
			t.Fatal("unpersisted operation claim accepted")
		}
	})
	t.Run("fixed reason codes expose conflicts without private payloads", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		f.conflict = true
		if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_VERSION_CONFLICT" {
			t.Fatal(status, result)
		}
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
			t.Fatal(status)
		}
		f.request.Receipt.MessageID = "987654321"
		if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_RECEIPT_CONFLICT" {
			t.Fatal(status, result)
		}
		encoded, _ := json.Marshal(f.request)
		var bad map[string]interface{}
		_ = json.Unmarshal(encoded, &bad)
		bad["password"] = "private-marker-never-reflect"
		if status, result := f.call("/v1/demo-ready", "producer-token", bad); status != 400 || result["error"] != "DEMO_READY_REQUEST_INVALID" {
			t.Fatal(status, result)
		}
	})
	t.Run("final live response fence rejects expiry crossed during actual HTTP read", func(t *testing.T) {
		for _, endpoint := range []string{"/v1/demo-ready", "/v1/demo-ready/status"} {
			f := newReadyHTTPFixture(t, credentials)
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
				t.Fatal(status)
			}
			// Restore a valid aged seven-day status record in the Kubernetes wire
			// fixture. The actual wall clock and HTTP request are not substituted.
			deadline := time.Now().UTC().Add(750 * time.Millisecond)
			f.mu.Lock()
			state := objectValue(f.item.Status["demoReadiness"])
			state["readyAt"] = deadline.Add(-demoRetention).Format(time.RFC3339Nano)
			state["expiresAt"] = deadline.Format(time.RFC3339Nano)
			f.item.Status["expiresAt"] = state["expiresAt"]
			f.version++
			f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
			f.delaySecretUntil = deadline.Add(20 * time.Millisecond)
			f.mu.Unlock()
			var input interface{} = f.request
			if endpoint == "/v1/demo-ready/status" {
				input = demoReadyStatusRequest{SchemaVersion: "demo-ready-status-request.v1", LeaseName: f.request.LeaseName, LeaseUID: f.request.LeaseUID, RequestID: f.request.RequestID}
			}
			status, result := f.call(endpoint, "producer-token", input)
			if status != 409 || result["error"] != "DEMO_READY_EXPIRED" || f.delayedSecretReads != 1 || time.Now().Before(deadline) {
				t.Fatal(endpoint, status, result, f.delayedSecretReads)
			}
			if f.patches != 1 {
				t.Fatal("expired read changed retention")
			}
		}
	})
	t.Run("successful replay and status cannot cross an unresolved exposure claim", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
			t.Fatal(status)
		}
		if err := f.controller.fenceExposureMutation(context.Background(), f.snapshot()); err != nil {
			t.Fatal(err)
		}
		for _, endpoint := range []string{"/v1/demo-ready", "/v1/demo-ready/status"} {
			var input interface{} = f.request
			if endpoint == "/v1/demo-ready/status" {
				input = demoReadyStatusRequest{SchemaVersion: "demo-ready-status-request.v1", LeaseName: f.request.LeaseName, LeaseUID: f.request.LeaseUID, RequestID: f.request.RequestID}
			}
			if status, result := f.call(endpoint, "producer-token", input); status != 409 || result["error"] != "DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED" {
				t.Fatal(endpoint, status, result)
			}
		}
		if f.patches != 2 {
			t.Fatal("read took over unresolved operation")
		}
	})
}
