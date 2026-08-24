package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testController(t *testing.T) *controller {
	t.Helper()
	allowed, err := parseAllowedAccess(`[
		{"subject":"kubeclaw/agent-nova","modes":["deployer"]},
		{"subject":"kubeclaw/agent-buster","modes":["tester"]}
	]`)
	if err != nil {
		t.Fatal(err)
	}
	return &controller{
		namespace: "kubeclaw", allowedPrefixes: []string{"test"}, allowedAccess: allowed,
		serviceAccountName: "agent-buster-namespace-controller",
		secretRoleName:     "buster-controller-secrets",
		deployerRoleName:   "buster-namespace-deployer",
		testerRoleName:     "buster-namespace-tester",
		defaultTTL:         2 * time.Hour, maxTTL: 24 * time.Hour,
	}
}

func TestControllerSecretRoleIsTargetNamespaceScoped(t *testing.T) {
	ctrl := testController(t)
	encoded, err := json.Marshal(map[string]interface{}{
		"binding": ctrl.controllerSecretRoleBinding("test-demo", "buster-controller-secrets"),
	})
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	if !strings.Contains(text, `"namespace":"test-demo"`) || !strings.Contains(text, `"name":"agent-buster-namespace-controller"`) || !strings.Contains(text, `"kind":"ClusterRole"`) {
		t.Fatalf("controller Secret access is not target scoped: %s", text)
	}
}

func TestEnsureControllerSecretAccessUsesOneTargetRoleBinding(t *testing.T) {
	var method, path string
	var body []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path = r.Method, r.URL.Path
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()

	ctrl := testController(t)
	ctrl.apiURL = server.URL
	ctrl.httpClient = server.Client()
	ctrl.token = "test-token"
	if err := ctrl.ensureControllerSecretAccess(context.Background(), "test-demo"); err != nil {
		t.Fatal(err)
	}
	if method != http.MethodPost || path != "/apis/rbac.authorization.k8s.io/v1/namespaces/test-demo/rolebindings" {
		t.Fatalf("unexpected target request: %s %s", method, path)
	}
	text := string(body)
	if !strings.Contains(text, `"kind":"ClusterRole"`) || !strings.Contains(text, `"name":"buster-controller-secrets"`) {
		t.Fatalf("target binding does not use the fixed Secret role: %s", text)
	}
}

func TestLegacyRunnerAccessDeletionRemovesRoleAndBinding(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	if err := ctrl.deleteLegacyRunnerAccess(context.Background(), "test-demo"); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(paths, "\n")
	for _, resource := range []string{"rolebindings", "roles"} {
		if !strings.Contains(joined, "DELETE /apis/rbac.authorization.k8s.io/v1/namespaces/test-demo/"+resource+"/buster-namespace-runner") {
			t.Fatalf("legacy %s was not revoked: %s", resource, joined)
		}
	}
}

func TestLegacyLeaseCannotRevokeAnotherNamespacesAccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"metadata":{"labels":{"kubeclaw/managed-by":"buster-namespace-controller","kubeclaw/buster-lease":"other-lease"}}}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	owned, err := ctrl.legacyNamespaceOwned(context.Background(), &lease{Metadata: metadata{Name: "lease-a"}}, "test-demo")
	if err != nil || owned {
		t.Fatalf("foreign legacy namespace reported owned: owned=%v err=%v", owned, err)
	}
}

func TestOwnershipMismatchDoesNotBlockLeaseFinalizerRemoval(t *testing.T) {
	finalizerPatched := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/namespaces/test-demo" {
			_, _ = w.Write([]byte(`{"metadata":{"labels":{"kubeclaw/managed-by":"someone-else"}}}`))
			return
		}
		if r.Method == http.MethodPatch && r.URL.Path == "/apis/kubeclaw.forgestack.ai/v1alpha1/namespaces/kubeclaw/busternamespaceleases/lease-a" {
			finalizerPatched = true
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiGroup, ctrl.apiVersion, ctrl.finalizer = "kubeclaw.forgestack.ai", "v1alpha1", "kubeclaw.forgestack.ai/cleanup"
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	item := &lease{Metadata: metadata{Name: "lease-a", UID: "uid-a", Finalizers: []string{ctrl.finalizer}}}
	if err := ctrl.reconcileDeletedLease(context.Background(), item, "test-demo"); err != nil {
		t.Fatal(err)
	}
	if !finalizerPatched {
		t.Fatal("ownership collision left the lease finalizer stuck")
	}
}

func TestNormalizeLeaseNamespaceName(t *testing.T) {
	ctrl := testController(t)
	got := ctrl.normalizeLeaseNamespaceName("Real E2E_Nginx")
	if got != "test-real-e2e-nginx" {
		t.Fatalf("normalized namespace mismatch: got %q", got)
	}
	long := ctrl.normalizeLeaseNamespaceName("test-" + strings.Repeat("abcdefghijklmnopqrstuvwxyz", 3))
	if len(long) > 63 || !ctrl.hasAllowedPrefix(long) {
		t.Fatalf("invalid normalized namespace %q", long)
	}
}

func TestAllowedAccessAndLeaseRequests(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access": []interface{}{
			map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"},
			map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"},
		},
	}}
	requests, err := ctrl.accessRequests(item)
	if err != nil || len(requests) != 2 {
		t.Fatalf("unexpected access requests: %#v, %v", requests, err)
	}
	item.Spec["access"] = []interface{}{map[string]interface{}{"subject": "other/runner", "mode": "deployer"}}
	if _, err := ctrl.accessRequests(item); err == nil {
		t.Fatal("expected unapproved subject to be rejected")
	}
}

func TestRunnerRolesExcludeSecretsIngressAndPortForward(t *testing.T) {
	ctrl := testController(t)
	for _, mode := range []string{"deployer", "tester"} {
		encoded, err := json.Marshal(ctrl.namespaceRole("test-demo", "runner-"+mode, mode))
		if err != nil {
			t.Fatal(err)
		}
		text := string(encoded)
		for _, forbidden := range []string{"pods/portforward", `"secrets"`, `"ingresses"`, `"roles"`, `"rolebindings"`} {
			if strings.Contains(text, forbidden) {
				t.Fatalf("%s role contains forbidden authority %s: %s", mode, forbidden, text)
			}
		}
	}
}

func TestCredentialRequestUsesOneDedicatedSecret(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access": []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}},
		"testCredentials": map[string]interface{}{
			"mode": "generate", "secretName": "preview-login",
			"readers": []interface{}{"kubeclaw/agent-nova"},
		},
	}}
	request, err := ctrl.credentialRequest(item)
	if err != nil {
		t.Fatal(err)
	}
	if request.SecretName != "preview-login" || len(request.Readers) != 1 {
		t.Fatalf("unexpected credential request: %#v", request)
	}
	role, _ := json.Marshal(map[string]interface{}{
		"resources": []string{"secrets"}, "resourceNames": []string{request.SecretName}, "verbs": []string{"get"},
	})
	if !strings.Contains(string(role), `"resourceNames":["preview-login"]`) {
		t.Fatalf("credential role was not resource scoped: %s", role)
	}
}

func TestCredentialReaderDoesNotNeedWorkloadAccess(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access": []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"}},
		"testCredentials": map[string]interface{}{
			"mode": "generate", "secretName": "preview-login",
			"readers": []interface{}{"kubeclaw/agent-nova", "kubeclaw/agent-buster"},
		},
	}}
	if _, err := ctrl.credentialRequest(item); err != nil {
		t.Fatalf("credential reader should need only exact Secret access: %v", err)
	}
}

func TestExistingCredentialUsesDeployerAsExactSecretWriter(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access": []interface{}{
			map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"},
			map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"},
		},
		"testCredentials": map[string]interface{}{
			"mode": "existing", "secretName": "preview-login", "keys": []interface{}{"token"},
			"readers": []interface{}{"kubeclaw/agent-nova", "kubeclaw/agent-buster"},
		},
	}}
	request, err := ctrl.credentialRequest(item)
	if err != nil {
		t.Fatal(err)
	}
	if len(request.Writers) != 1 || request.Writers[0].Name != "agent-nova" {
		t.Fatalf("existing credential writers are not deployer scoped: %#v", request.Writers)
	}
}

func TestExistingCredentialSeparatesReaderAndWriterRoles(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		requests = append(requests, r.URL.Path+" "+string(body))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	request := &testCredentialRequest{
		Mode: "existing", SecretName: "preview-login",
		Readers: []serviceAccountRef{{Namespace: "kubeclaw", Name: "agent-buster"}},
		Writers: []serviceAccountRef{{Namespace: "kubeclaw", Name: "agent-nova"}},
	}
	if err := ctrl.ensureCredentialAccess(context.Background(), "test-demo", request); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(requests, "\n")
	if !strings.Contains(joined, `"name":"buster-preview-credentials-reader"`) ||
		!strings.Contains(joined, `"verbs":["get"]`) ||
		!strings.Contains(joined, `"name":"buster-preview-credentials-writer"`) ||
		!strings.Contains(joined, `"verbs":["patch"]`) {
		t.Fatalf("reader and writer credential roles were not separated: %s", joined)
	}
	if strings.Contains(joined, `"verbs":["patch","update"]`) {
		t.Fatalf("writer role exceeds controller Secret authority: %s", joined)
	}
}

func TestEveryWorkloadSubjectMustBeCredentialReader(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access": []interface{}{
			map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"},
			map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"},
		},
		"testCredentials": map[string]interface{}{
			"mode": "generate", "secretName": "preview-login",
			"readers": []interface{}{"kubeclaw/agent-nova"},
		},
	}}
	if _, err := ctrl.credentialRequest(item); err == nil {
		t.Fatal("expected a workload-capable non-reader to be rejected")
	}
}

func TestCredentialSecretRejectsUndeclaredKeys(t *testing.T) {
	request := &testCredentialRequest{SecretName: "preview-login", Keys: []string{"username", "password"}}
	secret := map[string]interface{}{"data": map[string]interface{}{
		"username": "dXNlcg==", "password": "cGFzcw==", "provider-token": "c2VjcmV0",
	}}
	if err := validateDeliverableCredentialSecret(secret, request); err == nil {
		t.Fatal("expected undeclared credential key to be rejected")
	}
	delete(objectValue(secret["data"]), "provider-token")
	if err := validateDeliverableCredentialSecret(secret, request); err != nil {
		t.Fatal(err)
	}
}

func TestCredentialSecretCannotReuseCopiedSourceSecret(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access":        []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}},
		"secretsToCopy": []interface{}{"preview-login"},
		"testCredentials": map[string]interface{}{
			"mode": "generate", "secretName": "preview-login",
			"readers": []interface{}{"kubeclaw/agent-nova"},
		},
	}}
	if _, err := ctrl.credentialRequest(item); err == nil {
		t.Fatal("expected copied source Secret name reuse to be rejected")
	}
}

func TestLeaseUsesDefaultTTLWhenOmitted(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"access":        []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-buster", "mode": "tester"}},
		"cleanupPolicy": "delete",
	}}
	if err := ctrl.validateLeaseSpec(item); err != nil {
		t.Fatalf("omitted ttlSeconds should use the controller default: %v", err)
	}
}

func TestSanitizeSecretRemovesSourceOwnership(t *testing.T) {
	secret := map[string]interface{}{
		"apiVersion": "v1", "kind": "Secret",
		"metadata": map[string]interface{}{
			"name": "runtime", "namespace": "kubeclaw", "resourceVersion": "10",
			"ownerReferences": []interface{}{map[string]interface{}{"name": "source"}},
			"finalizers":      []interface{}{"protect-source"},
		},
		"data": map[string]interface{}{"token": "dGVzdA=="},
	}
	got := sanitizeSecret(secret, "test-app")
	meta := objectValue(got["metadata"])
	if stringValue(meta["namespace"]) != "test-app" {
		t.Fatalf("wrong target namespace: %#v", meta)
	}
	for _, forbidden := range []string{"resourceVersion", "ownerReferences", "finalizers"} {
		if _, exists := meta[forbidden]; exists {
			t.Fatalf("copied source metadata %s: %#v", forbidden, meta)
		}
	}
}

func TestPreviewExposureContainsNoCredentialPolicy(t *testing.T) {
	item := &lease{Spec: map[string]interface{}{
		"purpose": "final-preview", "serviceName": "prism-studio",
		"exposure": map[string]interface{}{
			"provider": "tailscale-ingress", "servicePort": 80, "path": "/",
		},
	}}
	exposure, err := previewExposureSpec(item, "test-prism")
	if err != nil || exposure == nil {
		t.Fatalf("expected exposure: %#v, %v", exposure, err)
	}
	if exposure.ServiceName != "prism-studio" || exposure.ServicePort != 80 {
		t.Fatalf("unexpected exposure: %#v", exposure)
	}
}

func TestPreviewReadinessRequiresDeclaredServiceAndEndpointPort(t *testing.T) {
	service := map[string]interface{}{"spec": map[string]interface{}{"ports": []interface{}{
		map[string]interface{}{"name": "http", "port": 80, "targetPort": 8080},
	}}}
	endpoints := map[string]interface{}{"subsets": []interface{}{map[string]interface{}{
		"addresses": []interface{}{map[string]interface{}{"ip": "10.0.0.2"}},
		"ports":     []interface{}{map[string]interface{}{"name": "http", "port": 8080}},
	}}}
	if !serviceEndpointReady(service, endpoints, 80) {
		t.Fatal("expected declared ready Service port")
	}
	if serviceEndpointReady(service, endpoints, 443) {
		t.Fatal("undeclared Service port must not be reported ready")
	}
	objectValue(interfaceSlice(endpoints["subsets"])[0])["ports"] = []interface{}{map[string]interface{}{"name": "other", "port": 9090}}
	if serviceEndpointReady(service, endpoints, 80) {
		t.Fatal("mismatched Endpoint port must not be reported ready")
	}
}

func TestPreviewReadinessAcceptsUnnamedSingleServicePort(t *testing.T) {
	service := map[string]interface{}{"spec": map[string]interface{}{"ports": []interface{}{
		map[string]interface{}{"port": 80, "targetPort": "http"},
	}}}
	endpoints := map[string]interface{}{"subsets": []interface{}{map[string]interface{}{
		"addresses": []interface{}{map[string]interface{}{"ip": "10.0.0.2"}},
		"ports":     []interface{}{map[string]interface{}{"port": 8080}},
	}}}
	if !serviceEndpointReady(service, endpoints, 80) {
		t.Fatal("unnamed single-port Service should use its sole ready Endpoint port")
	}
}

func TestLeaseValidationRequiresTTLAndApprovedAccess(t *testing.T) {
	ctrl := testController(t)
	item := &lease{Spec: map[string]interface{}{
		"ttlSeconds": 7200, "cleanupPolicy": "delete",
		"access": []interface{}{map[string]interface{}{"subject": "kubeclaw/agent-nova", "mode": "deployer"}},
	}}
	if err := ctrl.validateLeaseSpec(item); err != nil {
		t.Fatal(err)
	}
	item.Spec["ttlSeconds"] = 90000
	if err := ctrl.validateLeaseSpec(item); err == nil {
		t.Fatal("expected excessive TTL to be rejected")
	}
}

func TestExpiresAtClampsLegacyTTLToMaximum(t *testing.T) {
	ctrl := testController(t)
	created := time.Now().UTC().Add(-25 * time.Hour).Truncate(time.Second)
	item := &lease{Metadata: metadata{CreationTimestamp: created.Format(time.RFC3339)}, Spec: map[string]interface{}{
		"ttlSeconds": 7 * 24 * 60 * 60,
	}}
	if got, want := ctrl.expiresAt(item), created.Add(ctrl.maxTTL); !got.Equal(want) {
		t.Fatalf("legacy TTL was not clamped: got %s want %s", got, want)
	}
}

func TestExpiredLeaseDoesNotRewriteStatusOnEveryPoll(t *testing.T) {
	statusPatches := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/status") && r.Method == http.MethodPatch {
			statusPatches++
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"not found"}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	item := &lease{
		Metadata: metadata{Name: "lease-a", UID: "uid-a", CreationTimestamp: time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339)},
		Spec:     map[string]interface{}{"ttlSeconds": 7200},
		Status:   map[string]interface{}{"phase": "Expired"},
	}
	expired, err := ctrl.expireLease(context.Background(), item, "test-demo")
	if err != nil || !expired {
		t.Fatalf("expected idempotent expiry: expired=%v err=%v", expired, err)
	}
	if statusPatches != 0 {
		t.Fatalf("expired lease rewrote status %d times", statusPatches)
	}
}

func TestReadyNamespaceOwnershipMustStillMatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"metadata":{"labels":{"kubeclaw/managed-by":"someone-else"}}}`))
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token = server.URL, server.Client(), "test-token"
	item := &lease{Metadata: metadata{Name: "lease-a", UID: "uid-a"}}
	if err := ctrl.verifyNamespaceOwnership(context.Background(), item, "test-demo"); err == nil {
		t.Fatal("expected ready reconciliation to reject changed namespace ownership")
	}
}

func TestRejectedProvisionedLeaseDeletesPreviouslyGrantedNamespace(t *testing.T) {
	deleted := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/namespaces/test-demo" && !deleted:
			_, _ = w.Write([]byte(`{"metadata":{"labels":{"kubeclaw/managed-by":"buster-namespace-controller","kubeclaw/buster-lease":"lease-a","kubeclaw/buster-lease-uid":"uid-a"}}}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/api/v1/namespaces/test-demo":
			deleted = true
			_, _ = w.Write([]byte(`{}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/namespaces/test-demo" && deleted:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"message":"not found"}`))
		default:
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	defer server.Close()
	ctrl := testController(t)
	ctrl.apiURL, ctrl.httpClient, ctrl.token, ctrl.pollInterval = server.URL, server.Client(), "test-token", time.Millisecond
	item := &lease{
		Metadata: metadata{Name: "lease-a", UID: "uid-a", Finalizers: []string{ctrl.finalizer}, CreationTimestamp: time.Now().UTC().Format(time.RFC3339)},
		Spec: map[string]interface{}{
			"namespaceName": "test-demo", "ttlSeconds": 7200,
			"access": []interface{}{map[string]interface{}{"subject": "revoked/agent", "mode": "deployer"}},
		},
		Status: map[string]interface{}{"phase": "Ready", "namespaceName": "test-demo", "specDigest": "sha256:provisioned"},
	}
	if err := ctrl.reconcileLease(context.Background(), item); err != nil {
		t.Fatal(err)
	}
	if !deleted {
		t.Fatal("expected policy rejection to revoke access by deleting the owned namespace")
	}
}

func TestLeaseSpecDigestTracksOnlyImmutableFields(t *testing.T) {
	spec := map[string]interface{}{"namespaceName": "test-demo", "ttlSeconds": 7200,
		"purpose": "gate", "exposure": map[string]interface{}{"provider": "off"}}
	before := leaseSpecDigest(spec)
	spec["purpose"] = "final-preview"
	spec["exposure"] = map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "web"}
	if changed := leaseSpecDigest(spec); before != changed {
		t.Fatalf("mutable exposure fields changed immutable digest: %s %s", before, changed)
	}
	spec["ttlSeconds"] = 7201
	after := leaseSpecDigest(spec)
	if before == after || !strings.HasPrefix(before, "sha256:") {
		t.Fatalf("unexpected spec digests: %s %s", before, after)
	}
}

func TestLegacyExposureDigestMigrationIsBounded(t *testing.T) {
	initial := map[string]interface{}{"namespaceName": "test-demo", "ttlSeconds": 7200,
		"purpose": "gate", "exposure": map[string]interface{}{"provider": "off"}}
	stored := fullLeaseSpecDigest(initial)
	current := cloneObject(initial)
	current["purpose"] = "final-preview"
	current["exposure"] = map[string]interface{}{"provider": "tailscale-ingress", "serviceName": "web", "servicePort": 80}
	if !legacyMutableExposureDigest(stored, current) {
		t.Fatal("expected known gate-to-preview digest migration")
	}
	current["ttlSeconds"] = 7201
	if legacyMutableExposureDigest(stored, current) {
		t.Fatal("immutable mutation must not pass legacy digest migration")
	}
}

func TestIngressPreviewURLIsCanonical(t *testing.T) {
	ingress := map[string]interface{}{"status": map[string]interface{}{"loadBalancer": map[string]interface{}{
		"ingress": []interface{}{map[string]interface{}{"hostname": "preview.example.ts.net"}},
	}}}
	root := ingressPreviewURL(ingress, &previewExposure{Path: "/"})
	if root != "https://preview.example.ts.net/" {
		t.Fatalf("unexpected root preview URL %q", root)
	}
	nested := ingressPreviewURL(ingress, &previewExposure{Path: "/preview"})
	if nested != "https://preview.example.ts.net/preview" {
		t.Fatalf("unexpected nested preview URL %q", nested)
	}
}

func TestPreviewIngressUsesTLSNameAndPathRouting(t *testing.T) {
	item := &lease{Metadata: metadata{Name: "lease-a", UID: "uid-a"}}
	ingress := previewIngress(item, "test-demo", &previewExposure{IngressName: "buster-final-preview",
		Hostname: "preview-demo", ServiceName: "web", ServicePort: 8080, Path: "/preview"})
	spec := objectValue(ingress["spec"])
	tls := objectValue(interfaceSlice(spec["tls"])[0])
	if hosts := stringSlice(tls["hosts"]); len(hosts) != 1 || hosts[0] != "preview-demo" {
		t.Fatal("TLS host does not contain the requested Tailscale name")
	}
	rule := objectValue(interfaceSlice(spec["rules"])[0])
	if _, found := rule["host"]; found {
		t.Fatal("Tailscale path rule must accept the full MagicDNS host")
	}
	path := objectValue(interfaceSlice(objectValue(rule["http"])["paths"])[0])
	if stringValue(path["path"]) != "/preview" || stringValue(path["pathType"]) != "Prefix" {
		t.Fatal("Tailscale path rule is not a prefix route")
	}
}

func TestSourceSecretAllowlistIsDenyByDefault(t *testing.T) {
	ctrl := testController(t)
	if ctrl.allowedSourceSecrets["provider-production"] {
		t.Fatal("unexpected source Secret authority")
	}
	ctrl.allowedSourceSecrets = map[string]bool{"prism-provider": true}
	if !ctrl.allowedSourceSecrets["prism-provider"] || ctrl.allowedSourceSecrets["other"] {
		t.Fatal("source Secret allowlist is not exact")
	}
}
