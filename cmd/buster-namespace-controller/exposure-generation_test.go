package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExposureAcknowledgesOwnerAndGenerationThroughActualHTTP(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Metadata: metadata{Name: "lease", UID: "lease-uid", Generation: 7,
		Annotations: map[string]string{exposureOwnerAnnotation: "attempt-owner"}}, Spec: map[string]interface{}{
		"purpose": "final-preview", "namespaceName": "test-one", "serviceName": "web", "servicePort": 80,
		"exposure": map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "web", "servicePort": 80, "hostname": "preview", "path": "/new"},
	}}
	var ingress map[string]interface{}
	observedPatch := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serveVersionedLease(t, ctrl, item, w, r) {
			return
		}
		switch {
		case r.URL.Path == ctrl.leasePath(item.Metadata.Name):
			_ = json.NewEncoder(w).Encode(item)
		case strings.HasSuffix(r.URL.Path, "/services/web"):
			_, _ = w.Write([]byte(`{"spec":{"ports":[{"port":80,"targetPort":80}]}}`))
		case strings.HasSuffix(r.URL.Path, "/endpoints/web"):
			_, _ = w.Write([]byte(`{"subsets":[{"addresses":[{"ip":"10.0.0.1"}],"ports":[{"port":80}]}]}`))
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/ingresses/"):
			if ingress == nil {
				w.WriteHeader(404)
				return
			}
			_ = json.NewEncoder(w).Encode(ingress)
		case r.Method == http.MethodPost || r.Method == http.MethodPatch:
			var value map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&value)
			if r.Method == http.MethodPatch {
				observedPatch = true
				if objectValue(value["metadata"])["resourceVersion"] != objectValue(ingress["metadata"])["resourceVersion"] {
					w.WriteHeader(409)
					return
				}
			}
			ingress = value
			objectValue(ingress["metadata"])["uid"] = "ingress-uid"
			objectValue(ingress["metadata"])["resourceVersion"] = "4"
			ingress["status"] = map[string]interface{}{"loadBalancer": map[string]interface{}{"ingress": []interface{}{map[string]interface{}{"hostname": "preview.ts.net"}}}}
			_ = json.NewEncoder(w).Encode(ingress)
		case r.Method == http.MethodDelete:
			var value map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&value)
			preconditions := objectValue(value["preconditions"])
			if preconditions["uid"] != "ingress-uid" || preconditions["resourceVersion"] != "4" {
				w.WriteHeader(409)
				return
			}
			ingress = nil
			_, _ = w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
	for _, phase := range []string{"Ready", "Ready", "Off"} {
		if phase == "Off" {
			item.Spec["purpose"] = "gate"
			item.Spec["exposure"] = map[string]interface{}{"provider": "off"}
			item.Metadata.Generation++
		}
		status, err := ctrl.ensurePreviewExposure(context.Background(), item, "test-one")
		if err != nil {
			t.Fatal(err)
		}
		if status["exposureOwner"] != "attempt-owner" || status["exposureGeneration"] != item.Metadata.Generation || status["exposurePhase"] != phase {
			t.Fatalf("wrong acknowledgment: %v", status)
		}
		if phase == "Ready" && status["previewUrl"] != "https://preview.ts.net/new" {
			t.Fatalf("wrong current URL: %v", status)
		}
	}
	if !observedPatch || ingress != nil {
		t.Fatal("expected CAS update followed by owned deletion")
	}
}

func TestStaleExposureReconcileCannotOverwriteOrDeleteReplacement(t *testing.T) {
	for _, deleting := range []bool{false, true} {
		for _, race := range []bool{false, true} {
			ctrl := testController(t)
			item := &lease{Metadata: metadata{Name: "lease", UID: "uid", Generation: 1, Annotations: map[string]string{exposureOwnerAnnotation: "old"}}}
			version := "1"
			mutations := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == ctrl.leasePath("lease") {
					if !race {
						current := *item
						current.Metadata.Generation = 2
						_ = json.NewEncoder(w).Encode(current)
						return
					}
					_ = json.NewEncoder(w).Encode(item)
					version = "2"
					return
				}
				if r.Method == http.MethodGet {
					_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"uid": "ingress-uid", "namespace": "test-one", "labels": ownerLabels(item, "test-one"), "resourceVersion": version, "annotations": map[string]string{exposureOwnerAnnotation: "old"}}})
					return
				}
				var body map[string]interface{}
				_ = json.NewDecoder(r.Body).Decode(&body)
				supplied := objectValue(body["metadata"])["resourceVersion"]
				if r.Method == http.MethodDelete {
					supplied = objectValue(body["preconditions"])["resourceVersion"]
				}
				if supplied != version {
					w.WriteHeader(409)
					return
				}
				mutations++
				_, _ = w.Write([]byte(`{}`))
			}))
			ctrl.apiURL, ctrl.httpClient = server.URL, server.Client()
			var err error
			if deleting {
				err = ctrl.deleteOwnedExposure(context.Background(), item, "test-one", "buster-final-preview")
			} else {
				err = ctrl.ensureOwnedExposure(context.Background(), item, "test-one", &previewExposure{IngressName: "buster-final-preview"}, nil)
			}
			server.Close()
			if err == nil || mutations != 0 {
				t.Fatalf("stale reconcile mutated replacement: delete=%v race=%v error=%v mutations=%d", deleting, race, err, mutations)
			}
		}
	}
}

func TestPreviousIngressHostnameDoesNotAcknowledgeNewHostname(t *testing.T) {
	ingress := map[string]interface{}{"status": map[string]interface{}{"loadBalancer": map[string]interface{}{
		"ingress": []interface{}{map[string]interface{}{"hostname": "old.ts.net"}},
	}}}
	if result := ingressPreviewURL(ingress, &previewExposure{Hostname: "new", Path: "/new"}); result != "" {
		t.Fatalf("old hostname acknowledged new exposure: %s", result)
	}
}
