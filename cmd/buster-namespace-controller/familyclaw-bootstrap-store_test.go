package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

type bootstrapAPIFixture struct {
	ctrl           *controller
	item           *lease
	status         map[string]interface{}
	secrets        map[string]map[string]interface{}
	posts          int
	revision       int
	dropFirst      bool
	dropName       string
	failName       string
	rejectIntent   bool
	conflictIntent bool
	leaseUID       string
}

func newBootstrapAPIFixture(t *testing.T) *bootstrapAPIFixture {
	t.Helper()
	f := &bootstrapAPIFixture{ctrl: testController(t), item: &lease{Metadata: metadata{Name: "fixture", UID: "lease-uid"}},
		status: map[string]interface{}{}, secrets: map[string]map[string]interface{}{}, revision: 1, leaseUID: "lease-uid"}
	server := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(server.Close)
	f.ctrl.apiURL = server.URL
	f.ctrl.httpClient = server.Client()
	return f
}

func (f *bootstrapAPIFixture) serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if strings.HasSuffix(r.URL.Path, "/status") {
		if r.Method == http.MethodPatch {
			var body map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&body)
			patch := objectValue(body["status"])
			if f.rejectIntent && patch["familyclawBootstrapIntent"] != nil {
				http.Error(w, "conflict", 409)
				return
			}
			if objectValue(body["metadata"])["resourceVersion"] != fmt.Sprint(f.revision) {
				http.Error(w, "conflict", 409)
				return
			}
			for k, v := range patch {
				f.status[k] = v
			}
			f.revision++
		}
		status := f.status
		if f.conflictIntent && r.Method == http.MethodGet {
			status = cloneObject(f.status)
			status["familyclawBootstrapIntent"] = map[string]interface{}{"digest": "other"}
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"name": "fixture", "uid": f.leaseUID, "resourceVersion": fmt.Sprint(f.revision)},
			"spec": map[string]interface{}{"namespaceName": "test-familyclaw"}, "status": status})
		return
	}
	if r.URL.Path == "/api/v1/namespaces/test-familyclaw" {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(f.item, "test-familyclaw")}})
		return
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/namespaces/test-familyclaw/secrets" {
		f.posts++
		var doc map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&doc)
		name := stringValue(objectValue(doc["metadata"])["name"])
		if name == f.failName || (f.failName == familyclawBootstrapJournal && strings.HasPrefix(name, familyclawBootstrapJournal+"-")) {
			http.Error(w, "unavailable", 503)
			return
		}
		if f.secrets[name] != nil {
			http.Error(w, "exists", 409)
			return
		}
		data := map[string]interface{}{}
		for k, v := range stringMap(doc["stringData"]) {
			data[k] = base64.StdEncoding.EncodeToString([]byte(v))
		}
		delete(doc, "stringData")
		doc["data"] = data
		meta := objectValue(doc["metadata"])
		meta["uid"] = fmt.Sprintf("secret-%d", f.posts)
		meta["resourceVersion"] = "1"
		f.secrets[name] = doc
		if f.dropFirst || f.dropName == name {
			f.dropFirst = false
			f.dropName = ""
			conn, _, _ := w.(http.Hijacker).Hijack()
			_ = conn.Close()
			return
		}
		_ = json.NewEncoder(w).Encode(doc)
		return
	}
	if r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/secrets/") {
		name := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		if f.secrets[name] == nil {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(f.secrets[name])
		return
	}
	http.NotFound(w, r)
}

func (f *bootstrapAPIFixture) ensure() error {
	_, err := f.ctrl.ensureFamilyclawBootstrap(context.Background(), f.item, "test-familyclaw", "familyclaw")
	return err
}

func TestFamilyclawBootstrapJournalLostResponseAndRestart(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.dropFirst = true
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || len(f.secrets) != 7 {
		t.Fatal("expected one journal and six role Secrets")
	}
	before := bootstrapDigest(f.secrets)
	// Simulate a new controller process with no local status/memory.
	f.item = &lease{Metadata: metadata{Name: "fixture", UID: "lease-uid"}}
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || bootstrapDigest(f.secrets) != before {
		t.Fatal("restart changed or regenerated credentials")
	}
	encoded, _ := json.Marshal(f.status)
	for _, doc := range f.secrets {
		values, err := bootstrapSecretData(doc)
		if err != nil {
			t.Fatal(err)
		}
		for _, value := range values {
			if strings.Contains(string(encoded), value) {
				t.Fatal("private material entered status")
			}
		}
	}
}

func TestFamilyclawBootstrapPartialCreationResumesSameJournal(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.failName = "familyclaw-runtime"
	if f.ensure() == nil {
		t.Fatal("expected partial creation failure")
	}
	stage := bootstrapDigest(f.secrets[familyclawBootstrapJournalName(objectValue(f.status["familyclawBootstrapIntent"]))])
	owner := bootstrapDigest(f.secrets["familyclaw-database-owner"])
	f.failName = ""
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if len(f.secrets) != 7 || bootstrapDigest(f.secrets[familyclawBootstrapJournalName(objectValue(f.status["familyclawBootstrapIntent"]))]) != stage ||
		bootstrapDigest(f.secrets["familyclaw-database-owner"]) != owner {
		t.Fatal("partial recovery rotated material")
	}
}

func TestFamilyclawBootstrapFailsClosedOnMissingOrReplacedCommittedSources(t *testing.T) {
	for _, target := range []string{familyclawBootstrapJournal, "familyclaw-runtime"} {
		for _, action := range []string{"delete", "replace", "tamper"} {
			t.Run(target+"/"+action, func(t *testing.T) {
				f := newBootstrapAPIFixture(t)
				if err := f.ensure(); err != nil {
					t.Fatal(err)
				}
				posts := f.posts
				actualTarget := target
				if target == familyclawBootstrapJournal {
					actualTarget = familyclawBootstrapJournalName(objectValue(f.status["familyclawBootstrapIntent"]))
				}
				switch action {
				case "delete":
					delete(f.secrets, actualTarget)
				case "replace":
					objectValue(f.secrets[actualTarget]["metadata"])["uid"] = "foreign-uid"
				case "tamper":
					objectValue(f.secrets[actualTarget]["data"])["injected"] = "Zm9yZWlnbg=="
				}
				if f.ensure() == nil {
					t.Fatal("changed committed source accepted")
				}
				if f.posts != posts {
					t.Fatal("recovery recreated or overwrote a committed source")
				}
			})
		}
	}
}

func TestFamilyclawBootstrapIntentConflictAndForeignLeaseNeverCreate(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.rejectIntent = true
	if f.ensure() == nil || f.posts != 0 {
		t.Fatal("created without committed intent")
	}
	f.rejectIntent = false
	f.leaseUID = "foreign-lease"
	if f.ensure() == nil || f.posts != 0 {
		t.Fatal("created for foreign lease")
	}
}

func TestFamilyclawBootstrapStatusComparePreventsConcurrentIntentOverwrite(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	live, err := f.ctrl.familyclawBootstrapLease(context.Background(), f.item, "test-familyclaw")
	if err != nil {
		t.Fatal(err)
	}
	f.status["familyclawBootstrapIntent"] = map[string]interface{}{"digest": "other-controller"}
	before := cloneObject(f.status)
	err = f.ctrl.familyclawBootstrapStatus(context.Background(), live, "test-familyclaw", "familyclawBootstrapIntent", map[string]interface{}{"digest": "ours"})
	if err == nil || !reflect.DeepEqual(before, f.status) || f.posts != 0 {
		t.Fatal("concurrent intent overwritten")
	}
}

func TestFamilyclawBootstrapLostChildResponseIsRecoveredWithoutReplay(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.dropName = "familyclaw-runtime"
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || len(f.secrets) != 7 {
		t.Fatal("child response loss replayed Secret creation")
	}
}

func TestFamilyclawBootstrapJournal503BeforeCreateRecoversWithoutDeliveredRotation(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.failName = familyclawBootstrapJournal
	if f.ensure() == nil {
		t.Fatal("expected journal create failure")
	}
	if len(f.secrets) != 0 || len(objectValue(f.status["familyclawBootstrapIntent"])) == 0 {
		t.Fatal("invalid pre-delivery failure state")
	}
	f.failName = ""
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if len(f.secrets) != 7 {
		t.Fatal("journal creation did not recover")
	}
}
func TestFamilyclawBootstrapOrphanedIntentCannotRotateExistingMaterial(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	delete(f.status, "familyclawBootstrapSource")
	delete(f.status, "familyclawBootstrapSecrets")
	delete(f.secrets, familyclawBootstrapJournalName(objectValue(f.status["familyclawBootstrapIntent"])))
	before := bootstrapDigest(f.secrets)
	posts := f.posts
	if f.ensure() == nil || f.posts != posts || bootstrapDigest(f.secrets) != before {
		t.Fatal("orphaned intent rotated existing material")
	}
}

func TestFamilyclawBootstrapOldIntentCannotCommitSourceAfterReplacement(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	old := map[string]interface{}{"digest": "sha256:" + strings.Repeat("a", 64)}
	newer := map[string]interface{}{"digest": "sha256:" + strings.Repeat("b", 64)}
	f.status["familyclawBootstrapIntent"] = old
	live, err := f.ctrl.familyclawBootstrapLease(context.Background(), f.item, "test-familyclaw")
	if err != nil {
		t.Fatal(err)
	}
	f.status["familyclawBootstrapIntent"] = newer
	if familyclawBootstrapJournalName(old) == familyclawBootstrapJournalName(newer) {
		t.Fatal("different intents share immutable journal name")
	}
	err = f.ctrl.familyclawBootstrapStatus(context.Background(), live, "test-familyclaw", "familyclawBootstrapSource", map[string]interface{}{"uid": "old-stage"})
	if err == nil || f.status["familyclawBootstrapSource"] != nil {
		t.Fatal("stale intent committed source")
	}
}
