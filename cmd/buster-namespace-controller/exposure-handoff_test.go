package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadyLeasePersistsOwnershipOnlyTakeover(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Metadata: metadata{Name: "lease", UID: "uid", Generation: 7, Annotations: map[string]string{
		exposureOwnerAnnotation: "B", exposurePredecessorsAnnotation: `["A"]`,
	}}, Spec: map[string]interface{}{"purpose": "final-preview", "namespaceName": "test-one", "serviceName": "web", "servicePort": 80,
		"exposure": map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "web", "servicePort": 80, "hostname": "preview", "path": "/"}},
		Status: map[string]interface{}{"phase": "Ready", "exposurePhase": "Ready", "previewUrl": "https://preview.ts.net/", "exposureHostname": "preview.ts.net",
			"message": "Tailscale preview URL ready", "exposureOwner": "A", "exposureGeneration": float64(7), "credentialsRef": nil, "credentialsAvailable": false,
			"runtimeSecurity": map[string]interface{}{"phase": "Unavailable"}},
	}
	item.Status["specDigest"] = leaseSpecDigest(item.Spec)
	previous := *item
	previous.Metadata.Annotations = map[string]string{exposureOwnerAnnotation: "A"}
	ingress := previewIngress(&previous, "test-one", &previewExposure{IngressName: "buster-final-preview", Hostname: "preview", ServiceName: "web", ServicePort: 80, Path: "/"})
	objectValue(ingress["metadata"])["uid"] = "ingress-uid"
	objectValue(ingress["metadata"])["resourceVersion"] = "1"
	patches := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == ctrl.statusPath("lease") && r.Method == http.MethodPatch {
			patches++
		}
		if serveVersionedLease(t, ctrl, item, w, r) {
			return
		}
		switch {
		case r.URL.Path == "/api/v1/namespaces/test-one":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(item, "test-one")}})
		case strings.Contains(r.URL.Path, "/networkpolicies"):
			_, _ = w.Write([]byte(`{}`))
		case strings.HasSuffix(r.URL.Path, "/services/web"):
			_, _ = w.Write([]byte(`{"spec":{"ports":[{"port":80}]}}`))
		case strings.HasSuffix(r.URL.Path, "/endpoints/web"):
			_, _ = w.Write([]byte(`{"subsets":[{"addresses":[{"ip":"10.0.0.1"}],"ports":[{"port":80}]}]}`))
		case strings.Contains(r.URL.Path, "/ingresses/"):
			if r.Method == http.MethodPatch {
				var updated map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&updated)
				if objectValue(updated["metadata"])["resourceVersion"] != "1" {
					w.WriteHeader(409)
					return
				}
				ingress = updated
				objectValue(ingress["metadata"])["uid"] = "ingress-uid"
			}
			ingress["status"] = map[string]interface{}{"loadBalancer": map[string]interface{}{"ingress": []interface{}{map[string]interface{}{"hostname": "preview.ts.net"}}}}
			_ = json.NewEncoder(w).Encode(ingress)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
	if err := ctrl.reconcileReadyLease(context.Background(), item, "test-one"); err != nil {
		t.Fatal(err)
	}
	if patches != 2 || item.Status["exposureOwner"] != "B" {
		t.Fatalf("same-spec owner acknowledgment was not persisted: %v", item.Status)
	}
	item.Metadata.Generation = 8
	if err := ctrl.reconcileReadyLease(context.Background(), item, "test-one"); err != nil {
		t.Fatal(err)
	}
	if patches != 4 || intValue(item.Status["exposureGeneration"], 0) != 8 {
		t.Fatalf("generation-only acknowledgment was not persisted: %v", item.Status)
	}
	if err := ctrl.reconcileReadyLease(context.Background(), item, "test-one"); err != nil {
		t.Fatal(err)
	}
	if patches != 6 {
		t.Fatal("each actual ingress mutation must reserve and release its status fence")
	}
}

func TestAbortedTakeoverRetiresOnlyAuthorizedPredecessor(t *testing.T) {
	cases := []struct {
		name, lineage, owner, uid string
		allowed                   bool
	}{
		{"A-to-B-abort", `["A"]`, "A", "uid", true},
		{"A-to-B-to-C-abort", `["A","B"]`, "A", "uid", true},
		{"unknown-owner", `["A"]`, "unrelated", "uid", false},
		{"different-lease", `["A"]`, "A", "other-uid", false},
		{"corrupt-lineage", `null`, "A", "uid", false},
	}
	for _, example := range cases {
		t.Run(example.name, func(t *testing.T) {
			ctrl := testController(t)
			item := &lease{Metadata: metadata{Name: "lease", UID: "uid", Generation: 9, Annotations: map[string]string{exposureOwnerAnnotation: "C", exposurePredecessorsAnnotation: example.lineage}},
				Spec: map[string]interface{}{"purpose": "gate", "exposure": map[string]interface{}{"provider": "off"}}}
			previous := *item
			previous.Metadata.UID = example.uid
			previous.Metadata.Annotations = map[string]string{exposureOwnerAnnotation: example.owner}
			ingress := previewIngress(&previous, "test-one", &previewExposure{IngressName: "buster-final-preview"})
			objectValue(ingress["metadata"])["uid"] = "ingress-uid"
			objectValue(ingress["metadata"])["resourceVersion"] = "4"
			deleted := false
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if serveVersionedLease(t, ctrl, item, w, r) {
					return
				}
				if r.Method == http.MethodGet {
					_ = json.NewEncoder(w).Encode(ingress)
					return
				}
				if r.Method == http.MethodDelete {
					var body map[string]interface{}
					_ = json.NewDecoder(r.Body).Decode(&body)
					preconditions := objectValue(body["preconditions"])
					if preconditions["uid"] != "ingress-uid" || preconditions["resourceVersion"] != "4" {
						w.WriteHeader(409)
						return
					}
					deleted = true
					_, _ = w.Write([]byte(`{}`))
					return
				}
				w.WriteHeader(500)
			}))
			defer server.Close()
			ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
			status, err := ctrl.ensurePreviewExposure(context.Background(), item, "test-one")
			if example.allowed {
				if err != nil || !deleted || status["exposurePhase"] != "Off" || status["exposureOwner"] != "C" {
					t.Fatalf("authorized predecessor leaked: %v %v", status, err)
				}
			} else if err == nil || deleted {
				t.Fatalf("unrelated predecessor deleted: %v %v", status, err)
			}
		})
	}
}
