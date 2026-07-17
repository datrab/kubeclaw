package main

import "testing"

func TestNormalizeLeaseNamespaceName(t *testing.T) {
	ctrl := &controller{allowedPrefixes: []string{"test"}}

	got := ctrl.normalizeLeaseNamespaceName("Real E2E_Nginx")
	if got != "test-real-e2e-nginx" {
		t.Fatalf("normalized namespace mismatch: got %q", got)
	}

	long := ctrl.normalizeLeaseNamespaceName("test-" + "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz")
	if len(long) > 63 {
		t.Fatalf("normalized namespace exceeded DNS label limit: %d", len(long))
	}
	if !ctrl.hasAllowedPrefix(long) {
		t.Fatalf("normalized namespace lost allowed prefix: %q", long)
	}
}

func TestParseServiceAccountRefs(t *testing.T) {
	ctrl := &controller{busterServiceAccountNamespace: "kubeclaw"}

	accounts, err := ctrl.parseServiceAccountRefs("agent-nova,other-ns/custom-runner")
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 2 {
		t.Fatalf("expected 2 accounts, got %d", len(accounts))
	}
	if accounts[0] != (serviceAccountRef{Namespace: "kubeclaw", Name: "agent-nova"}) {
		t.Fatalf("unexpected default namespace account: %#v", accounts[0])
	}
	if accounts[1] != (serviceAccountRef{Namespace: "other-ns", Name: "custom-runner"}) {
		t.Fatalf("unexpected explicit namespace account: %#v", accounts[1])
	}
}

func TestPreviewExposureSpec(t *testing.T) {
	item := &lease{
		Spec: map[string]interface{}{
			"purpose":     "final-preview",
			"serviceName": "real-pipeline-e2e-nginx",
			"exposure": map[string]interface{}{
				"provider":            "tailscale-ingress",
				"credentialsRef":      "secret/app-credentials",
				"credentialsKeys":     []interface{}{"username", "password"},
				"credentialsDelivery": "discord",
			},
		},
	}

	exposure, err := previewExposureSpec(item, "test-real-e2e")
	if err != nil {
		t.Fatal(err)
	}
	if exposure == nil {
		t.Fatal("expected final-preview exposure")
	}
	if exposure.ServiceName != "real-pipeline-e2e-nginx" {
		t.Fatalf("unexpected service name: %q", exposure.ServiceName)
	}
	if exposure.CredentialsSecretName != "app-credentials" {
		t.Fatalf("unexpected credential secret name: %q", exposure.CredentialsSecretName)
	}
	if !exposure.RevealCredentials {
		t.Fatal("expected discord credential delivery to reveal credential availability")
	}
	if len(exposure.CredentialsKeys) != 2 {
		t.Fatalf("unexpected credential keys: %#v", exposure.CredentialsKeys)
	}
}

func TestSecretHasCredentialKeys(t *testing.T) {
	secret := map[string]interface{}{
		"data": map[string]interface{}{
			"username": "dXNlcg==",
			"ignored":  "",
		},
	}

	if !secretHasCredentialKeys(secret, []string{"username"}) {
		t.Fatal("expected allowed populated credential key")
	}
	if secretHasCredentialKeys(secret, []string{"password"}) {
		t.Fatal("did not expect unavailable credential key")
	}
}
