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

type testSecretAPIFixture struct {
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

func newTestSecretAPIFixture(t *testing.T) *testSecretAPIFixture {
	t.Helper()
	f := &testSecretAPIFixture{ctrl: testController(t), item: &lease{Metadata: metadata{Name: "fixture", UID: "lease-uid"}, Spec: genericTestSecretSpec()},
		status: map[string]interface{}{}, secrets: map[string]map[string]interface{}{}, revision: 1, leaseUID: "lease-uid"}
	server := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(server.Close)
	f.ctrl.apiURL = server.URL
	f.ctrl.httpClient = server.Client()
	return f
}

func (f *testSecretAPIFixture) serve(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if strings.HasSuffix(r.URL.Path, "/status") {
		if r.Method == http.MethodPatch {
			var body map[string]interface{}
			_ = json.NewDecoder(r.Body).Decode(&body)
			patch := objectValue(body["status"])
			if f.rejectIntent && patch["fixtureSecretIntent"] != nil {
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
			status["fixtureSecretIntent"] = map[string]interface{}{"digest": "other"}
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"name": "fixture", "uid": f.leaseUID, "resourceVersion": fmt.Sprint(f.revision)},
			"spec": mergeTestSecretSpec(f.item.Spec), "status": status})
		return
	}
	if r.URL.Path == "/api/v1/namespaces/test-generic" {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"metadata": map[string]interface{}{"labels": ownerLabels(f.item, "test-generic")}})
		return
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/namespaces/test-generic/secrets" {
		f.posts++
		var doc map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&doc)
		name := stringValue(objectValue(doc["metadata"])["name"])
		if name == f.failName || (f.failName == fixtureSecretJournal && strings.HasPrefix(name, fixtureSecretJournal+"-")) {
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

func (f *testSecretAPIFixture) ensure() error {
	request, err := parseFixtureSecrets(f.item)
	if err != nil {
		return err
	}
	_, err = f.ctrl.ensureFixtureSecret(context.Background(), f.item, "test-generic", request)
	return err
}

func TestFixtureSecretJournalLostResponseAndRestart(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	f.dropFirst = true
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || len(f.secrets) != 7 {
		t.Fatal("expected one journal and six role Secrets")
	}
	before := fixtureSecretDigest(f.secrets)
	// Simulate a new controller process with no local status/memory.
	f.item = &lease{Metadata: metadata{Name: "fixture", UID: "lease-uid"}, Spec: genericTestSecretSpec()}
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || fixtureSecretDigest(f.secrets) != before {
		t.Fatal("restart changed or regenerated credentials")
	}
	encoded, _ := json.Marshal(f.status)
	for _, doc := range f.secrets {
		values, err := fixtureSecretData(doc)
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

func TestFixtureSecretPartialCreationResumesSameJournal(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	f.failName = "service-runtime"
	if f.ensure() == nil {
		t.Fatal("expected partial creation failure")
	}
	stage := fixtureSecretDigest(f.secrets[fixtureSecretJournalName(objectValue(f.status["fixtureSecretIntent"]))])
	owner := fixtureSecretDigest(f.secrets["database-owner"])
	f.failName = ""
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if len(f.secrets) != 7 || fixtureSecretDigest(f.secrets[fixtureSecretJournalName(objectValue(f.status["fixtureSecretIntent"]))]) != stage ||
		fixtureSecretDigest(f.secrets["database-owner"]) != owner {
		t.Fatal("partial recovery rotated material")
	}
}

func TestFixtureSecretFailsClosedOnMissingOrReplacedCommittedSources(t *testing.T) {
	for _, target := range []string{fixtureSecretJournal, "service-runtime"} {
		for _, action := range []string{"delete", "replace", "tamper"} {
			t.Run(target+"/"+action, func(t *testing.T) {
				f := newTestSecretAPIFixture(t)
				if err := f.ensure(); err != nil {
					t.Fatal(err)
				}
				posts := f.posts
				actualTarget := target
				if target == fixtureSecretJournal {
					actualTarget = fixtureSecretJournalName(objectValue(f.status["fixtureSecretIntent"]))
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

func TestFixtureSecretIntentConflictAndForeignLeaseNeverCreate(t *testing.T) {
	f := newTestSecretAPIFixture(t)
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

func TestFixtureSecretStatusComparePreventsConcurrentIntentOverwrite(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	live, err := f.ctrl.fixtureSecretLease(context.Background(), f.item, "test-generic")
	if err != nil {
		t.Fatal(err)
	}
	f.status["fixtureSecretIntent"] = map[string]interface{}{"digest": "other-controller"}
	before := cloneObject(f.status)
	err = f.ctrl.fixtureSecretStatus(context.Background(), live, "test-generic", "fixtureSecretIntent", map[string]interface{}{"digest": "ours"})
	if err == nil || !reflect.DeepEqual(before, f.status) || f.posts != 0 {
		t.Fatal("concurrent intent overwritten")
	}
}

func TestFixtureSecretLostChildResponseIsRecoveredWithoutReplay(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	f.dropName = "service-runtime"
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	if f.posts != 7 || len(f.secrets) != 7 {
		t.Fatal("child response loss replayed Secret creation")
	}
}

func TestFixtureSecretJournal503BeforeCreateRecoversWithoutDeliveredRotation(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	f.failName = fixtureSecretJournal
	if f.ensure() == nil {
		t.Fatal("expected journal create failure")
	}
	if len(f.secrets) != 0 || len(objectValue(f.status["fixtureSecretIntent"])) == 0 {
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
func TestFixtureSecretOrphanedIntentCannotRotateExistingMaterial(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	if err := f.ensure(); err != nil {
		t.Fatal(err)
	}
	delete(f.status, "fixtureSecretSource")
	delete(f.status, "fixtureSecretSecrets")
	delete(f.secrets, fixtureSecretJournalName(objectValue(f.status["fixtureSecretIntent"])))
	before := fixtureSecretDigest(f.secrets)
	posts := f.posts
	if f.ensure() == nil || f.posts != posts || fixtureSecretDigest(f.secrets) != before {
		t.Fatal("orphaned intent rotated existing material")
	}
}

func TestFixtureSecretOldIntentCannotCommitSourceAfterReplacement(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	old := map[string]interface{}{"digest": "sha256:" + strings.Repeat("a", 64)}
	newer := map[string]interface{}{"digest": "sha256:" + strings.Repeat("b", 64)}
	f.status["fixtureSecretIntent"] = old
	live, err := f.ctrl.fixtureSecretLease(context.Background(), f.item, "test-generic")
	if err != nil {
		t.Fatal(err)
	}
	f.status["fixtureSecretIntent"] = newer
	if fixtureSecretJournalName(old) == fixtureSecretJournalName(newer) {
		t.Fatal("different intents share immutable journal name")
	}
	err = f.ctrl.fixtureSecretStatus(context.Background(), live, "test-generic", "fixtureSecretSource", map[string]interface{}{"uid": "old-stage"})
	if err == nil || f.status["fixtureSecretSource"] != nil {
		t.Fatal("stale intent committed source")
	}
}

func mergeTestSecretSpec(spec map[string]interface{}) map[string]interface{} {
	result := cloneObject(spec)
	if result == nil {
		result = map[string]interface{}{}
	}
	result["namespaceName"] = "test-generic"
	return result
}

func genericTestSecretSpec() map[string]interface{} {
	return map[string]interface{}{"namespaceName": "test-generic", "purpose": "gate", "fullStack": true, "ttlSeconds": 600, "exposure": map[string]interface{}{"provider": "off"}, "testSecrets": map[string]interface{}{
		"values":  map[string]interface{}{"password": map[string]interface{}{"kind": "random", "bytes": 32, "encoding": "hex"}},
		"secrets": map[string]interface{}{"service-runtime": map[string]interface{}{"password": "${password}"}, "database-owner": map[string]interface{}{"password": "${password}"}, "one": map[string]interface{}{"value": "${password}"}, "two": map[string]interface{}{"value": "${password}"}, "three": map[string]interface{}{"value": "${password}"}, "four": map[string]interface{}{"value": "${password}"}}}}
}
