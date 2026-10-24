package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"math/big"
	"regexp"
	"time"
)

var familyclawReleaseName = regexp.MustCompile(`^[a-z][a-z0-9-]{0,34}$`)
var familyclawTestNamespace = regexp.MustCompile(`^test-[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$`)

// Pure generation only: NOT wired to reconciliation or lease admission.
// Integration must establish per-lease ownership, durable creation intent and
// retry/restart recovery BEFORE invoking this for new immutable Secrets.
func familyclawBootstrapDocuments(item *lease, namespace, release string, now time.Time) ([]map[string]interface{}, error) {
	if item == nil || item.Metadata.UID == "" || item.Metadata.Name == "" ||
		!familyclawReleaseName.MatchString(release) || !familyclawTestNamespace.MatchString(namespace) {
		return nil, errors.New("familyclaw bootstrap requires a named lease UID and disposable namespace/release")
	}
	values := make([]string, 8)
	for i := range values {
		bytes := make([]byte, 32)
		if _, err := rand.Read(bytes); err != nil {
			return nil, errors.New("familyclaw bootstrap randomness failed")
		}
		values[i] = hex.EncodeToString(bytes)
	}
	owner, runtime, api := values[1], values[2], values[3]
	tls, err := familyclawBootstrapTLS(release+"-database", now)
	if err != nil {
		return nil, err
	}
	connection := func(role, password string) string {
		return "postgresql://" + role + ":" + password + "@" + release + "-database:5432/familyclaw"
	}
	// Laravel APP_KEY requires exactly 32 decoded bytes.
	appKey, _ := hex.DecodeString(values[7])
	data := []struct {
		name   string
		values map[string]string
	}{
		{"familyclaw-database-bootstrap", map[string]string{"postgres-password": values[0], "owner-password": owner, "runtime-password": runtime}},
		{"familyclaw-database-owner", map[string]string{"connection": connection("familyclaw_owner", owner)}},
		{"familyclaw-database-tls", tls},
		{"familyclaw-runtime", map[string]string{"FAMILYCLAW_DATABASE_URL": connection("familyclaw_runtime", runtime), "FAMILYCLAW_API_TOKEN": api, "FAMILYCLAW_PAPERLESS_TOKEN": values[4][:40]}},
		{"familyclaw-openclaw", map[string]string{"OPENCLAW_GATEWAY_TOKEN": values[5], "FAMILYCLAW_API_TOKEN": api}},
		{"familyclaw-firefly", map[string]string{"APP_KEY": "base64:" + base64.StdEncoding.EncodeToString(appKey), "DB_PASSWORD": values[6], "APP_URL": "http://" + release + "-firefly:8080"}},
	}
	documents := make([]map[string]interface{}, 0, len(data))
	for _, entry := range data {
		documents = append(documents, map[string]interface{}{
			"apiVersion": "v1", "kind": "Secret", "type": "Opaque", "immutable": true,
			"metadata": map[string]interface{}{"name": entry.name, "namespace": namespace,
				"labels":      ownerLabels(item, namespace),
				"annotations": map[string]string{"kubeclaw.forgestack.ai/bootstrap-profile": "familyclaw.v1", "kubeclaw.forgestack.ai/bootstrap-lease-uid": item.Metadata.UID}},
			"stringData": entry.values})
	}
	return documents, nil
}

func familyclawBootstrapTLS(host string, now time.Time) (map[string]string, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, errors.New("familyclaw bootstrap TLS key generation failed")
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, errors.New("familyclaw bootstrap TLS serial generation failed")
	}
	certificate := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: host},
		DNSNames: []string{host}, NotBefore: now.Add(-time.Minute), NotAfter: now.Add(24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment | x509.KeyUsageCertSign,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IsCA: true, BasicConstraintsValid: true}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, &key.PublicKey, key)
	if err != nil {
		return nil, errors.New("familyclaw bootstrap TLS certificate generation failed")
	}
	cert := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	private := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	return map[string]string{"tls.crt": cert, "ca.crt": cert, "tls.key": private}, nil
}
