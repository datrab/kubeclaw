package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestFamilyclawBootstrapIsolatedContractsAndTLS(t *testing.T) {
	now := time.Now().UTC()
	item := &lease{Metadata: metadata{Name: "fixture-one", UID: "lease-uid-one"}}
	documents, err := familyclawBootstrapDocuments(item, "test-familyclaw", "familyclaw", now)
	if err != nil {
		t.Fatal(err)
	}
	if len(documents) != 6 {
		t.Fatal("expected exactly six secrets")
	}
	data := map[string]map[string]string{}
	for _, doc := range documents {
		meta := objectValue(doc["metadata"])
		if doc["immutable"] != true || meta["namespace"] != "test-familyclaw" {
			t.Fatal("scope or immutability lost")
		}
		annotations := meta["annotations"].(map[string]string)
		if annotations["kubeclaw.forgestack.ai/bootstrap-lease-uid"] != item.Metadata.UID {
			t.Fatal("lease binding lost")
		}
		data[meta["name"].(string)] = doc["stringData"].(map[string]string)
	}
	bootstrap := data["familyclaw-database-bootstrap"]
	owner, err := url.Parse(data["familyclaw-database-owner"]["connection"])
	if err != nil {
		t.Fatal("invalid owner URL")
	}
	runtime, err := url.Parse(data["familyclaw-runtime"]["FAMILYCLAW_DATABASE_URL"])
	if err != nil {
		t.Fatal("invalid runtime URL")
	}
	ownerPassword, _ := owner.User.Password()
	runtimePassword, _ := runtime.User.Password()
	if owner.User.Username() != "familyclaw_owner" || ownerPassword != bootstrap["owner-password"] {
		t.Fatal("owner binding mismatch")
	}
	if runtime.User.Username() != "familyclaw_runtime" || runtimePassword != bootstrap["runtime-password"] || ownerPassword == runtimePassword {
		t.Fatal("runtime binding mismatch")
	}
	if runtime.Host != "familyclaw-database:5432" || runtime.Path != "/familyclaw" {
		t.Fatal("database target mismatch")
	}
	if data["familyclaw-openclaw"]["FAMILYCLAW_API_TOKEN"] != data["familyclaw-runtime"]["FAMILYCLAW_API_TOKEN"] {
		t.Fatal("API mismatch")
	}
	for _, name := range []string{"familyclaw-runtime", "familyclaw-openclaw", "familyclaw-firefly"} {
		for _, value := range data[name] {
			if value == ownerPassword || value == bootstrap["postgres-password"] || strings.Contains(value, "PRIVATE KEY") {
				t.Fatal("private authority crossed roles")
			}
		}
	}
	tls := data["familyclaw-database-tls"]
	block, _ := pem.Decode([]byte(tls["tls.crt"]))
	if block == nil {
		t.Fatal("missing certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal("invalid certificate")
	}
	roots := x509.NewCertPool()
	roots.AddCert(cert)
	if _, err = cert.Verify(x509.VerifyOptions{DNSName: "familyclaw-database", Roots: roots, CurrentTime: now}); err != nil {
		t.Fatal("TLS verification failed")
	}
	if cert.VerifyHostname("foreign-database") == nil {
		t.Fatal("foreign hostname accepted")
	}
	keyBlock, _ := pem.Decode([]byte(tls["tls.key"]))
	if keyBlock == nil {
		t.Fatal("missing key")
	}
	key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		t.Fatal("invalid key")
	}
	if cert.PublicKey.(*rsa.PublicKey).N.Cmp(key.N) != 0 || tls["ca.crt"] != tls["tls.crt"] {
		t.Fatal("TLS key/CA mismatch")
	}
	appKey, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(data["familyclaw-firefly"]["APP_KEY"], "base64:"))
	if err != nil || len(appKey) != 32 || hex.EncodeToString(appKey) == data["familyclaw-firefly"]["DB_PASSWORD"] {
		t.Fatal("APP_KEY not independently generated")
	}
	if len(data["familyclaw-runtime"]["FAMILYCLAW_PAPERLESS_TOKEN"]) != 40 {
		t.Fatal("Paperless token contract mismatch")
	}
}

func TestFamilyclawBootstrapRejectsUnboundAndForeignTargets(t *testing.T) {
	valid := &lease{Metadata: metadata{Name: "fixture-one", UID: "lease-uid-one"}}
	for _, input := range []struct {
		item               *lease
		namespace, release string
	}{
		{nil, "test-familyclaw", "familyclaw"},
		{&lease{Metadata: metadata{Name: "fixture-one"}}, "test-familyclaw", "familyclaw"},
		{valid, "kubeclaw", "familyclaw"}, {valid, "test-invalid-", "familyclaw"},
		{valid, "test-familyclaw", "bad/release"}, {valid, "test-familyclaw", strings.Repeat("a", 36)},
	} {
		if documents, err := familyclawBootstrapDocuments(input.item, input.namespace, input.release, time.Now()); err == nil || documents != nil {
			t.Fatal("invalid binding accepted")
		}
	}
}
