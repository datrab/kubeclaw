//go:build native_product

package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// The Kubernetes API, storage, schema/CEL, credentials, TokenReview and controller
// handlers are original implementations. An Ingress status and delivery receipt
// are explicitly admission fixtures, NOT evidence of Tailnet routing or a send.
func TestNativeProductControllerTransitions(t *testing.T) {
	var config struct{ URL, Token, CA string }
	data, err := os.ReadFile(os.Getenv("KUBECLAW_NATIVE_TEST_CONFIG"))
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &config); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(config.URL, "https://127.0.0.1:") {
		t.Fatal("only disposable loopback API allowed")
	}
	caBytes, err := os.ReadFile(config.CA)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caBytes) {
		t.Fatal("invalid test CA")
	}
	tokenFile := filepath.Join(t.TempDir(), "api-token")
	if err = os.WriteFile(tokenFile, []byte(config.Token), 0600); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}, Timeout: 10 * time.Second}
	defer client.CloseIdleConnections()
	allowed, err := parseAllowedAccess(`[{"subject":"native-controller/nova","modes":["deployer"]}]`)
	if err != nil {
		t.Fatal(err)
	}
	c := &controller{apiURL: config.URL, tokenPath: tokenFile, httpClient: client, namespace: "native-controller", apiGroup: "kubeclaw.forgestack.ai", apiVersion: "v1alpha1", allowedPrefixes: []string{"test"}, allowedAccess: allowed, defaultTTL: time.Hour, maxTTL: 24 * time.Hour}
	ctx := context.Background()
	api := func(method, uri string, body, output interface{}) {
		t.Helper()
		if err := c.kube(ctx, method, uri, body, "application/json", output); err != nil {
			t.Fatalf("native %s %s: %v", method, uri, err)
		}
	}
	api(http.MethodPost, "/api/v1/namespaces", map[string]interface{}{"apiVersion": "v1", "kind": "Namespace", "metadata": map[string]interface{}{"name": c.namespace}}, nil)
	mint := func(name string) string {
		t.Helper()
		route := "/api/v1/namespaces/" + c.namespace + "/serviceaccounts"
		api(http.MethodPost, route, map[string]interface{}{"apiVersion": "v1", "kind": "ServiceAccount", "metadata": map[string]interface{}{"name": name}}, nil)
		var response map[string]interface{}
		api(http.MethodPost, route+"/"+name+"/token", map[string]interface{}{"apiVersion": "authentication.k8s.io/v1", "kind": "TokenRequest", "spec": map[string]interface{}{"audiences": []string{"native-product"}, "expirationSeconds": 600}}, &response)
		token := stringValue(objectValue(response["status"])["token"])
		if token == "" {
			t.Fatal("missing real SA token")
		}
		return token
	}
	novaToken, prismToken, foreignToken := mint("nova"), mint("prism"), mint("foreign")
	pub, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	c.readiness = &readinessConfig{Audience: "native-product", Producer: "system:serviceaccount:native-controller:nova"}
	c.product = &productConfig{Audience: "native-product", Producer: "system:serviceaccount:native-controller:prism", Issuer: "native-human-issuer", PublicKey: pub, Actors: map[string]bool{"human:native-reviewer": true}}
	endpoint := httptest.NewTLSServer(c.readinessHandler())
	defer endpoint.Close()
	call := func(route, token string, body interface{}) (int, []byte) {
		t.Helper()
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req, err := http.NewRequest(http.MethodPost, endpoint.URL+route, bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		res, err := endpoint.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		return res.StatusCode, data
	}
	digest := "sha256:" + strings.Repeat("a", 64)
	owner := "native-pending-owner"
	namespace := "test-native-controller"
	spec := map[string]interface{}{"purpose": "final-preview", "namespaceName": namespace, "cleanupPolicy": "retain", "ttlSeconds": 7200, "verifiedImage": "registry.example/app@" + digest, "manifestDigest": digest, "access": []interface{}{map[string]interface{}{"subject": "native-controller/nova", "mode": "deployer"}}, "testCredentials": map[string]interface{}{"mode": "generate", "secretName": "demo-login", "readers": []interface{}{"native-controller/nova"}}, "exposure": map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "app", "servicePort": 80, "hostname": "native-demo", "path": "/"}}
	var item lease
	api(http.MethodPost, c.leasePath(""), map[string]interface{}{"apiVersion": c.apiGroup + "/" + c.apiVersion, "kind": "BusterNamespaceLease", "metadata": map[string]interface{}{"name": "native-controller-demo", "annotations": map[string]string{exposureOwnerAnnotation: owner}}, "spec": spec}, &item)
	api(http.MethodPost, "/api/v1/namespaces", map[string]interface{}{"apiVersion": "v1", "kind": "Namespace", "metadata": map[string]interface{}{"name": namespace, "labels": ownerLabels(&item, namespace)}}, nil)
	credentials, err := c.ensureTestCredentials(ctx, &item, namespace)
	if err != nil {
		t.Fatal(err)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	status := map[string]interface{}{"phase": "Ready", "namespaceName": namespace, "previewUrl": "https://native-demo.example/", "exposurePhase": "Ready", "exposureOwner": owner, "exposureGeneration": item.Metadata.Generation}
	for name, value := range credentials {
		status[name] = value
	}
	if err = c.patchLeaseStatus(ctx, &item, status); err != nil {
		t.Fatal(err)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	pending, _ := json.Marshal(map[string]interface{}{"phase": "awaiting-readiness", "owner": owner, "leaseUID": item.Metadata.UID, "immutableImage": item.Spec["verifiedImage"], "manifestDigest": digest})
	if err = c.kube(ctx, http.MethodPatch, c.leasePath(item.Metadata.Name), map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": item.Metadata.ResourceVersion, "annotations": map[string]string{"kubeclaw.forgestack.ai/readiness-handoff": string(pending)}}}, "application/merge-patch+json", nil); err != nil {
		t.Fatal(err)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	exposure, err := previewExposureSpec(&item, namespace)
	if err != nil {
		t.Fatal(err)
	}
	ingress := previewIngress(&item, namespace, exposure)
	ingressPath := "/apis/networking.k8s.io/v1/namespaces/" + namespace + "/ingresses"
	api(http.MethodPost, ingressPath, ingress, &ingress)
	if err = c.kube(ctx, http.MethodPatch, ingressPath+"/"+exposure.IngressName+"/status", map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": objectValue(ingress["metadata"])["resourceVersion"]}, "status": map[string]interface{}{"loadBalancer": map[string]interface{}{"ingress": []interface{}{map[string]interface{}{"hostname": "native-demo.example"}}}}}, "application/merge-patch+json", nil); err != nil {
		t.Fatal(err)
	}
	proof := objectValue(item.Status["generatedCredentials"])
	ready := demoReadyRequest{SchemaVersion: "demo-ready-request.v1", RequestID: "native-ready", RunID: "native-run", SourceRevision: "git:" + strings.Repeat("b", 40), CandidateDigest: digest, DecisionDigest: digest, ResultDigest: digest, LeaseName: item.Metadata.Name, LeaseUID: item.Metadata.UID, Namespace: namespace, ImmutableImage: stringValue(item.Spec["verifiedImage"]), ManifestDigest: digest, CredentialDigest: stringValue(proof["credentialDigest"]), SecretUID: stringValue(proof["secretUID"]), ExposureOwner: owner, ExposureGeneration: item.Metadata.Generation, URL: "https://native-demo.example/", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Receipt: demoReceipt{SchemaVersion: "discord-delivery-receipt.v1", Accepted: true, Target: "explicit-native-admission-fixture", Status: 200, MessageID: "123456789", DeliveryID: "schema-fixture-no-message-sent", PayloadDigest: digest}}
	if code, raw := call("/v1/demo-ready", novaToken, ready); code != 200 {
		t.Fatalf("native original Ready %d %s", code, raw)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	originalReady, _ := json.Marshal(item.Status["demoReadiness"])
	input := func(id, action string) productDecision {
		t.Helper()
		api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
		subject, err := c.productSubject(ctx, &item)
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC().Truncate(time.Second)
		d := productDecision{SchemaVersion: "demo-product-decision.v1", Issuer: c.product.Issuer, ActorID: "human:native-reviewer", DecisionID: id, Action: action, LeaseName: item.Metadata.Name, LeaseUID: item.Metadata.UID, SourceRevision: subject["sourceRevision"].(string), CandidateDigest: subject["candidateDigest"].(string), ResultDigest: subject["resultDigest"].(string), ReadyDigest: subject["readyDigest"].(string), Generation: item.Metadata.Generation, ExpectedExpiry: subject["expectedExpiry"].(string), ExpectedRevision: item.Metadata.ResourceVersion, IssuedAt: now.Format(time.RFC3339), ExpiresAt: now.Add(5 * time.Minute).Format(time.RFC3339), Reason: "Explicit native signed-controller admission test, no external delivery claim"}
		if action == "extend" {
			seconds := int64(60)
			d.ExtensionSeconds = &seconds
		}
		return d
	}
	d := input("00000000-0000-4000-8000-000000000001", "accept")
	for _, which := range []string{"foreign-sa", "wrong-signature", "wrong-source", "wrong-generation", "wrong-revision", "wrong-actor", "expired"} {
		t.Run(which, func(t *testing.T) {
			candidate := d
			signingKey := key
			token := prismToken
			switch which {
			case "foreign-sa":
				token = foreignToken
			case "wrong-signature":
				_, signingKey, _ = ed25519.GenerateKey(rand.Reader)
			case "wrong-source":
				candidate.SourceRevision = "git:" + strings.Repeat("c", 40)
			case "wrong-generation":
				candidate.Generation++
			case "wrong-revision":
				candidate.ExpectedRevision = "stale"
			case "wrong-actor":
				candidate.ActorID = "human:foreign"
			case "expired":
				candidate.IssuedAt = time.Now().UTC().Add(-time.Hour).Truncate(time.Second).Format(time.RFC3339)
				candidate.ExpiresAt = time.Now().UTC().Add(-time.Minute).Truncate(time.Second).Format(time.RFC3339)
			}
			code, raw := call("/v1/demo-product/decisions", token, productSign(t, candidate, signingKey))
			if code < 400 {
				t.Fatalf("negative accepted %s: %d %s", which, code, raw)
			}
			var after lease
			api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &after)
			if after.Metadata.ResourceVersion != d.ExpectedRevision {
				t.Fatal("negative mutated native lease")
			}
			t.Logf("native %s rejected HTTP %d", which, code)
		})
	}
	beforeExpiry := c.expiresAt(&item)
	envelope := productSign(t, d, key)
	code, raw := call("/v1/demo-product/decisions", prismToken, envelope)
	if code != 200 {
		t.Fatalf("native accept %d %s", code, raw)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	acceptedRevision := item.Metadata.ResourceVersion
	if !c.expiresAt(&item).Equal(beforeExpiry) {
		t.Fatal("accept changed expiry")
	}
	// Restart the original handler/controller object; persistent native API remains.
	endpoint.Close()
	reopened := *c
	c = &reopened
	endpoint = httptest.NewTLSServer(c.readinessHandler())
	defer endpoint.Close()
	if code, raw = call("/v1/demo-product/decisions", prismToken, envelope); code != 200 {
		t.Fatalf("native restart replay %d %s", code, raw)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	if item.Metadata.ResourceVersion != acceptedRevision {
		t.Fatal("replay wrote twice")
	}
	changed := d
	changed.Reason = "changed same identity"
	if code, raw = call("/v1/demo-product/decisions", prismToken, productSign(t, changed, key)); code != 409 || !bytes.Contains(raw, []byte("DEMO_PRODUCT_REPLAY_CHANGED")) {
		t.Fatalf("changed replay %d %s", code, raw)
	}
	extension := input("00000000-0000-4000-8000-000000000002", "extend")
	// Preserve an owned earlier API observation; decoding a later response into
	// item's existing maps must not mutate the stale cleanup witness itself.
	staleBytes, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	var stale lease
	if err = json.Unmarshal(staleBytes, &stale); err != nil {
		t.Fatal(err)
	}
	if code, raw = call("/v1/demo-product/decisions", prismToken, productSign(t, extension, key)); code != 200 {
		t.Fatalf("native extend %d %s", code, raw)
	}
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &item)
	if c.expiresAt(&item).Sub(beforeExpiry) != time.Minute {
		t.Fatal("native extension not exact")
	}
	afterReady, _ := json.Marshal(item.Status["demoReadiness"])
	if !bytes.Equal(originalReady, afterReady) {
		t.Fatal("extension changed original Ready")
	}
	if err = c.patchLeaseStatus(ctx, &stale, map[string]interface{}{"phase": "Expired"}); err == nil {
		t.Fatal("stale cleanup crossed extension")
	}
	var final lease
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &final)
	if final.Metadata.ResourceVersion != item.Metadata.ResourceVersion || final.Status["phase"] != "Ready" {
		t.Fatal("stale cleanup mutated native state")
	}
	// A real forwarding proxy drops exactly one successful native status PATCH
	// acknowledgement. It never invents an API response or persisted fact.
	lost := input("00000000-0000-4000-8000-000000000003", "extend")
	lostEnvelope := productSign(t, lost, key)
	var dropped atomic.Bool
	proxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forward, e := http.NewRequestWithContext(r.Context(), r.Method, config.URL+r.URL.RequestURI(), r.Body)
		if e != nil {
			t.Error(e)
			return
		}
		forward.Header = r.Header.Clone()
		forward.ContentLength = r.ContentLength
		response, e := client.Do(forward)
		if e != nil {
			t.Error(e)
			return
		}
		defer response.Body.Close()
		body, e := io.ReadAll(response.Body)
		if e != nil {
			t.Error(e)
			return
		}
		if r.Method == http.MethodPatch && strings.HasSuffix(r.URL.Path, "/status") && response.StatusCode == 200 && dropped.CompareAndSwap(false, true) {
			connection, _, e := w.(http.Hijacker).Hijack()
			if e != nil {
				t.Error(e)
				return
			}
			_ = connection.Close()
			return
		}
		for name, values := range response.Header {
			for _, value := range values {
				w.Header().Add(name, value)
			}
		}
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(body)
	}))
	defer proxy.Close()
	c.apiURL, c.httpClient = proxy.URL, proxy.Client()
	if code, raw = call("/v1/demo-product/decisions", prismToken, lostEnvelope); code != 409 || !bytes.Contains(raw, []byte("DEMO_PRODUCT_COMMIT_UNCERTAIN")) || !dropped.Load() {
		t.Fatalf("lost real native ACK %d %s dropped=%v", code, raw, dropped.Load())
	}
	c.apiURL, c.httpClient = config.URL, client
	var committed lease
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &committed)
	if c.expiresAt(&committed).Sub(beforeExpiry) != 2*time.Minute {
		t.Fatal("lost ACK did not persist exactly one extension")
	}
	endpoint.Close()
	replayController := *c
	c = &replayController
	endpoint = httptest.NewTLSServer(c.readinessHandler())
	defer endpoint.Close()
	if code, raw = call("/v1/demo-product/decisions", prismToken, lostEnvelope); code != 200 {
		t.Fatalf("lost native ACK replay %d %s", code, raw)
	}
	var replayed lease
	api(http.MethodGet, c.leasePath(item.Metadata.Name), nil, &replayed)
	if replayed.Metadata.ResourceVersion != committed.Metadata.ResourceVersion || !c.expiresAt(&replayed).Equal(c.expiresAt(&committed)) {
		t.Fatal("lost ACK replay applied extension twice")
	}
	t.Logf("Actual native API successful status PATCH acknowledgement dropped; original controller uncertain -> recreated handler replay, exact revision %s retained", replayed.Metadata.ResourceVersion)
	t.Log(fmt.Sprintf("Original native controller: accept, restart exact replay, changed replay reject, extend +60s, immutable Ready, stale cleanup denied; API revision %s -> %s; no external delivery claim", d.ExpectedRevision, final.Metadata.ResourceVersion))
}
