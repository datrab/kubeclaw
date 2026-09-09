package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func productFixture(t *testing.T, credentials map[string]interface{}) (*readyHTTPFixture, ed25519.PrivateKey) {
	t.Helper()
	f := newReadyHTTPFixture(t, credentials)
	if code, result := f.call("/v1/demo-ready", "producer-token", f.request); code != 200 {
		t.Fatalf("ready %d %v", code, result)
	}
	f.username = "system:serviceaccount:prism:prism-control"
	pub, key, e := ed25519.GenerateKey(rand.Reader)
	if e != nil {
		t.Fatal(e)
	}
	f.controller.product = &productConfig{Audience: f.audience, Producer: f.username, Issuer: "human-product-issuer", PublicKey: pub, Actors: map[string]bool{"human:alice": true}}
	return f, key
}
func productInput(t *testing.T, f *readyHTTPFixture) productDecision {
	t.Helper()
	item := f.snapshot()
	s, e := f.controller.productSubject(context.Background(), item)
	if e != nil {
		t.Fatal(e)
	}
	now := time.Now().UTC().Truncate(time.Second)
	return productDecision{SchemaVersion: "demo-product-decision.v1", Issuer: "human-product-issuer", ActorID: "human:alice", DecisionID: "00000000-0000-4000-8000-000000000001", Action: "accept", LeaseName: item.Metadata.Name, LeaseUID: item.Metadata.UID, SourceRevision: s["sourceRevision"].(string), CandidateDigest: s["candidateDigest"].(string), ResultDigest: s["resultDigest"].(string), ReadyDigest: s["readyDigest"].(string), Generation: item.Metadata.Generation, ExpectedExpiry: s["expectedExpiry"].(string), ExpectedRevision: item.Metadata.ResourceVersion, IssuedAt: now.Format(time.RFC3339), ExpiresAt: now.Add(5 * time.Minute).Format(time.RFC3339), Reason: "Explicit human acceptance of the displayed tested version"}
}
func productSignBytes(raw []byte, key ed25519.PrivateKey) productEnvelope {
	return productEnvelope{SchemaVersion: "demo-product-decision-envelope.v1", Payload: base64.StdEncoding.EncodeToString(raw), Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(key, append([]byte(productDomain), raw...)))}
}
func productSign(t *testing.T, d productDecision, key ed25519.PrivateKey) productEnvelope {
	t.Helper()
	raw, e := json.Marshal(d)
	if e != nil {
		t.Fatal(e)
	}
	return productSignBytes(raw, key)
}

// Original controller executes all lifecycle checks and resourceVersion PATCHes.
// Existing HTTP Kubernetes contract vectors are not a native API-server/storage proof.
func TestProductDecisionCASRecoveryAndLifecycle(t *testing.T) {
	credentials := readyCredentials(t)
	t.Run("accept leaves TTL; exact replay and changed replay", func(t *testing.T) {
		f, key := productFixture(t, credentials)
		d := productInput(t, f)
		before := f.snapshot()
		envelope := productSign(t, d, key)
		code, receipt := f.call("/v1/demo-product/decisions", "producer-token", envelope)
		if code != 200 || receipt["state"] != "accepted" {
			t.Fatalf("%d %v", code, receipt)
		}
		if !f.controller.expiresAt(before).Equal(f.controller.expiresAt(f.snapshot())) {
			t.Fatal("accept changed TTL")
		}
		patches := f.patches
		if code, _ = f.call("/v1/demo-product/decisions", "producer-token", envelope); code != 200 || f.patches != patches {
			t.Fatal("replay mutated")
		}
		d.Reason = "Changed same ID"
		if code, r := f.call("/v1/demo-product/decisions", "producer-token", productSign(t, d, key)); code != 409 || r["error"] != "DEMO_PRODUCT_REPLAY_CHANGED" {
			t.Fatalf("changed replay %d %v", code, r)
		}
		f.mu.Lock()
		f.item.Status["phase"] = "Expired"
		f.mu.Unlock()
		status := map[string]interface{}{"schemaVersion": "demo-product-status-request.v1", "decisionId": d.DecisionID, "leaseName": d.LeaseName, "leaseUID": d.LeaseUID, "payloadDigest": receipt["payloadDigest"]}
		if code, r := f.call("/v1/demo-product/status", "producer-token", status); code != 200 || r["state"] != "accepted" {
			t.Fatalf("historical acceptance lost %d %v", code, r)
		}
	})
	t.Run("extend preserves fractional expiry and rejects stale cleanup", func(t *testing.T) {
		f, key := productFixture(t, credentials)
		d := productInput(t, f)
		d.Action = "extend"
		seconds := int64(3600)
		d.ExtensionSeconds = &seconds
		before := f.snapshot()
		readyBytes, _ := json.Marshal(before.Status["demoReadiness"])
		if code, r := f.call("/v1/demo-product/decisions", "producer-token", productSign(t, d, key)); code != 200 || r["state"] != "extended" {
			t.Fatalf("%d %v", code, r)
		}
		after := f.snapshot()
		if got := f.controller.expiresAt(after).Sub(f.controller.expiresAt(before)); got != time.Hour {
			t.Fatalf("extension %v", got)
		}
		afterReady, _ := json.Marshal(after.Status["demoReadiness"])
		if string(readyBytes) != string(afterReady) {
			t.Fatal("immutable Ready changed")
		}
		if e := f.controller.patchLeaseStatus(context.Background(), before, map[string]interface{}{"phase": "Expired"}); e == nil {
			t.Fatal("stale cleanup accepted")
		}
	})
	t.Run("uncertain response recovers atomically without second apply", func(t *testing.T) {
		f, key := productFixture(t, credentials)
		d := productInput(t, f)
		d.Action = "extend"
		seconds := int64(60)
		d.ExtensionSeconds = &seconds
		envelope := productSign(t, d, key)
		f.drop = true
		if code, r := f.call("/v1/demo-product/decisions", "producer-token", envelope); code != 409 || r["error"] != "DEMO_PRODUCT_COMMIT_UNCERTAIN" {
			t.Fatalf("%d %v", code, r)
		}
		patches := f.patches
		// Recreate the controller object to discard process-local state; the API fixture retains CAS state.
		reopened := *f.controller
		f.controller = &reopened
		if receipt, e := f.controller.commitProduct(context.Background(), envelope); e != nil || receipt["state"] != "extended" || f.patches != patches {
			t.Fatalf("recovery %v %v", receipt, e)
		}
	})
	for _, which := range []string{"generation", "source", "candidate", "result", "ready", "expiry", "revision", "expired", "deleting", "signature", "actor", "issuer", "token", "conflict", "non-uuid-decision"} {
		t.Run(which, func(t *testing.T) {
			f, key := productFixture(t, credentials)
			d := productInput(t, f)
			token := "producer-token"
			switch which {
			case "generation":
				d.Generation++
			case "source":
				d.SourceRevision = "git:" + strings.Repeat("c", 40)
			case "candidate":
				d.CandidateDigest = "sha256:" + strings.Repeat("c", 64)
			case "result":
				d.ResultDigest = "sha256:" + strings.Repeat("c", 64)
			case "ready":
				d.ReadyDigest = "sha256:" + strings.Repeat("c", 64)
			case "expiry":
				d.ExpectedExpiry = time.Now().UTC().Format(time.RFC3339)
			case "revision":
				d.ExpectedRevision = "stale"
			case "expired":
				d.IssuedAt = time.Now().UTC().Add(-10 * time.Minute).Format(time.RFC3339)
				d.ExpiresAt = time.Now().UTC().Add(-9 * time.Minute).Format(time.RFC3339)
			case "deleting":
				f.item.Metadata.DeletionTimestamp = time.Now().UTC().Format(time.RFC3339)
			case "signature":
				_, key, _ = ed25519.GenerateKey(rand.Reader)
			case "actor":
				d.ActorID = "agent:nova"
			case "issuer":
				d.Issuer = "automation"
			case "token":
				token = "wrong"
			case "conflict":
				f.conflict = true
			case "non-uuid-decision":
				d.DecisionID = "arbitrary-text"
			}
			patches := f.patches
			if code, r := f.call("/v1/demo-product/decisions", token, productSign(t, d, key)); code < 400 || f.patches != patches {
				t.Fatalf("negative accepted %d %v", code, r)
			}
		})
	}
}
func TestProductClosedSignedWire(t *testing.T) {
	pub, key, _ := ed25519.GenerateKey(rand.Reader)
	c := &controller{product: &productConfig{PublicKey: pub, Issuer: "issuer", Actors: map[string]bool{"alice": true}}}
	now := time.Now().UTC().Truncate(time.Second)
	d := productDecision{SchemaVersion: "demo-product-decision.v1", Issuer: "issuer", ActorID: "alice", DecisionID: "00000000-0000-4000-8000-000000000001", Action: "accept", LeaseName: "demo", LeaseUID: "uid", SourceRevision: "git:" + strings.Repeat("a", 40), CandidateDigest: "sha256:" + strings.Repeat("a", 64), ResultDigest: "sha256:" + strings.Repeat("a", 64), ReadyDigest: "sha256:" + strings.Repeat("a", 64), Generation: 1, ExpectedExpiry: now.Add(time.Hour).Format(time.RFC3339), ExpectedRevision: "1", IssuedAt: now.Format(time.RFC3339), ExpiresAt: now.Add(time.Minute).Format(time.RFC3339), Reason: "accept"}
	raw, _ := json.Marshal(d)
	if _, _, e := c.verifyProduct(productSignBytes(raw, key)); e != nil {
		t.Fatal(e)
	}
	for _, prefix := range []string{`"actorId":"bob",`, `"ActorID":"bob",`, `"ACTORID":"bob",`, `"unknown":true,`, `"extensionSeconds":null,`} {
		changed := append([]byte("{"+prefix), raw[1:]...)
		if _, _, e := c.verifyProduct(productSignBytes(changed, key)); e == nil {
			t.Fatalf("accepted %s", prefix)
		}
	}
	for _, changed := range [][]byte{append(append([]byte{}, raw...), []byte(" {}")...), append([]byte{0xff}, raw...), []byte("null")} {
		if _, _, e := c.verifyProduct(productSignBytes(changed, key)); e == nil {
			t.Fatal("invalid signed JSON accepted")
		}
	}
	envelope := productSignBytes(raw, key)
	envelope.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key, raw))
	if _, _, e := c.verifyProduct(envelope); e == nil {
		t.Fatal("domainless signature accepted")
	}
}

// Executes the original TypeScript signer, not a reimplementation or a fixed signature fixture.
func TestProductTypeScriptInterop(t *testing.T) {
	exporter := os.Getenv("PRODUCT_TS_EXPORTER")
	if exporter == "" {
		exporter = filepath.Join("..", "..", "skills", "prism", "tests", "export-product-vectors.mts")
	}
	command := exec.Command("node", exporter)
	raw, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("original TS signer: %v %s", err, raw)
	}
	var vectors []struct {
		PublicKey string          `json:"publicKey"`
		Envelope  productEnvelope `json:"envelope"`
		Expected  productDecision `json:"expected"`
	}
	if json.Unmarshal(raw, &vectors) != nil || len(vectors) != 2 {
		t.Fatalf("invalid vectors %s", raw)
	}
	for _, v := range vectors {
		key, e := base64.StdEncoding.Strict().DecodeString(v.PublicKey)
		if e != nil {
			t.Fatal(e)
		}
		c := &controller{product: &productConfig{PublicKey: key, Issuer: v.Expected.Issuer, Actors: map[string]bool{v.Expected.ActorID: true}}}
		got, _, e := c.verifyProduct(v.Envelope)
		if e != nil || !reflect.DeepEqual(got, v.Expected) {
			t.Fatalf("TS to Go %s: %v %+v", v.Expected.Action, e, got)
		}
		if got.Action == "extend" {
			old, _ := time.Parse(time.RFC3339Nano, got.ExpectedExpiry)
			next, e := demoRetentionDeadline(old, *got.ExtensionSeconds)
			if e != nil || next.Nanosecond() != 123456789 || next.Sub(old) != time.Duration(*got.ExtensionSeconds)*time.Second {
				t.Fatalf("fractional deadline %v %v", next, e)
			}
		}
		v.Envelope.Payload = base64.StdEncoding.EncodeToString([]byte(`{"actorId":"another"}`))
		if _, _, e = c.verifyProduct(v.Envelope); e == nil {
			t.Fatal("tampered TS payload accepted")
		}
	}
}

func TestProductConfigurationDenyByDefault(t *testing.T) {
	t.Setenv("BUSTER_PRODUCT_ENABLED", "")
	c := &controller{}
	if e := c.configureProduct(); e != nil || c.product != nil {
		t.Fatalf("default %v", e)
	}
	t.Setenv("BUSTER_PRODUCT_ENABLED", "true")
	if e := c.configureProduct(); e == nil {
		t.Fatal("enabled without listener accepted")
	}
	c.readiness = &readinessConfig{Producer: "system:serviceaccount:nova:agent-nova"}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	values := map[string]string{"BUSTER_PRODUCT_AUDIENCE": "product-audience", "BUSTER_PRODUCT_PRODUCER": "system:serviceaccount:prism:prism-control", "BUSTER_PRODUCT_ISSUER": "human-issuer", "BUSTER_PRODUCT_VERIFY_KEY": base64.StdEncoding.EncodeToString(pub), "BUSTER_PRODUCT_ACTORS_JSON": `["human:alice"]`}
	for key, value := range values {
		t.Setenv(key, value)
	}
	if e := c.configureProduct(); e != nil {
		t.Fatal(e)
	}
	for key := range values {
		t.Run(key, func(t *testing.T) {
			t.Setenv(key, "")
			if e := c.configureProduct(); e == nil {
				t.Fatal("incomplete authority accepted")
			}
		})
	}
	t.Setenv("BUSTER_PRODUCT_PRODUCER", c.readiness.Producer)
	if e := c.configureProduct(); e == nil {
		t.Fatal("automation producer reused as product issuer transport")
	}
}
func TestProductExtensionHistoryIsOrderIndependent(t *testing.T) {
	base := time.Date(2099, 9, 9, 1, 2, 3, 123456789, time.UTC)
	first := base.Add(time.Hour)
	second := first.Add(time.Hour)
	item := &lease{Metadata: metadata{UID: "uid"}, Status: map[string]interface{}{"demoReadiness": map[string]interface{}{"requestDigest": "digest"}, "demoProduct": map[string]interface{}{"leaseUID": "uid", "readyDigest": "digest", "decisions": []interface{}{
		map[string]interface{}{"action": "extend", "previousExpiry": first.Format(time.RFC3339Nano), "expiresAt": second.Format(time.RFC3339Nano)},
		map[string]interface{}{"action": "accept"},
		map[string]interface{}{"action": "extend", "previousExpiry": base.Format(time.RFC3339Nano), "expiresAt": first.Format(time.RFC3339Nano)},
	}}}}
	if got := productDeadline(item, base); !got.Equal(second) {
		t.Fatalf("reordered chain %v", got)
	}
}
