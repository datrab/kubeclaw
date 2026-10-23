package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFullStackReplacementUsesUIDPreconditionAndRejectsForeignRequests(t *testing.T) {
	for _, scenario := range []string{"valid", "foreign-namespace", "foreign-lease", "stale-pod", "expired", "standalone", "expired-during-read"} {
		t.Run(scenario, func(t *testing.T) {
			ctrl := testController(t)
			item := lease{Metadata: metadata{Name: "test-stack", UID: "lease-uid", ResourceVersion: "1", CreationTimestamp: time.Now().UTC().Format(time.RFC3339), Annotations: map[string]string{}}, Spec: map[string]interface{}{"fullStack": true, "purpose": "gate", "namespaceName": "test-stack", "ttlSeconds": 3600}, Status: map[string]interface{}{"phase": "Ready", "namespaceName": "test-stack"}}
			request := podReplacementRequest{RequestID: "replacement-1", LeaseUID: "lease-uid", Namespace: "test-stack", PodName: "database-0", PodUID: "pod-uid"}
			switch scenario {
			case "foreign-namespace":
				request.Namespace = "test-other"
			case "foreign-lease":
				request.LeaseUID = "other"
			case "expired":
				item.Metadata.CreationTimestamp = time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)
			}
			raw, _ := json.Marshal(request)
			item.Metadata.Annotations[replacementAnnotation] = string(raw)
			deletes := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if serveVersionedLease(t, ctrl, &item, w, r) {
					return
				}
				if r.URL.Path == "/api/v1/namespaces/test-stack" {
					json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(&item, "test-stack")}})
					return
				}
				if r.URL.Path == "/api/v1/namespaces/test-stack/pods/database-0" {
					if r.Method == http.MethodGet {
						if scenario == "expired-during-read" {
							item.Metadata.CreationTimestamp = time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)
						}
						uid := "pod-uid"
						if scenario == "stale-pod" {
							uid = "new-pod-uid"
						}
						owners := []interface{}{map[string]interface{}{"kind": "StatefulSet", "uid": "sts-uid", "controller": true}}
						if scenario == "standalone" {
							owners = nil
						}
						json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"uid": uid, "ownerReferences": owners}})
						return
					}
					if r.Method == http.MethodDelete {
						var options map[string]interface{}
						if err := json.NewDecoder(r.Body).Decode(&options); err != nil {
							t.Fatal(err)
						}
						if securityObject(options["preconditions"])["uid"] != "pod-uid" {
							t.Fatal("missing atomic UID precondition")
						}
						deletes++
						w.WriteHeader(200)
						w.Write([]byte(`{}`))
						return
					}
				}
				t.Errorf("unexpected API %s %s", r.Method, r.URL.Path)
				http.NotFound(w, r)
			}))
			defer server.Close()
			ctrl.apiURL = server.URL
			ctrl.httpClient = server.Client()
			handled, err := ctrl.reconcilePodReplacement(context.Background(), &item, "test-stack")
			if scenario == "valid" {
				if err != nil || !handled || deletes != 1 {
					t.Fatalf("replacement failed handled=%v deletes=%d err=%v", handled, deletes, err)
				}
				if _, err = ctrl.reconcilePodReplacement(context.Background(), &item, "test-stack"); err != nil || deletes != 1 {
					t.Fatalf("replay deleted again: %v", err)
				}
			} else if err == nil || deletes != 0 {
				t.Fatalf("unsafe request accepted deletes=%d err=%v", deletes, err)
			}
		})
	}
}
