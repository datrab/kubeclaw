package main

import (
	"crypto/x509"
	"encoding/pem"
	"strings"
	"testing"
	"time"
)

func TestFixtureSecretGenerationCouplingTLSAndBinding(t *testing.T) {
	spec := genericTestSecretSpec()
	r := objectValue(spec["testSecrets"])
	objectValue(r["values"])["server"] = map[string]interface{}{"kind": "tls", "host": "database"}
	objectValue(r["secrets"])["tls"] = map[string]interface{}{"cert": "${server.cert}", "key": "${server.key}", "ca": "${server.ca}"}
	item := &lease{Metadata: metadata{Name: "fixture", UID: "uid"}, Spec: spec}
	request, err := parseFixtureSecrets(item)
	if err != nil {
		t.Fatal(err)
	}
	docs, err := fixtureSecretDocuments(item, "test-generic", request, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	var password string
	for _, doc := range docs {
		data := stringMap(doc["stringData"])
		if p := data["password"]; p != "" {
			if password != "" && password != p {
				t.Fatal("shared value differs")
			}
			password = p
		}
		if data["cert"] != "" {
			block, _ := pem.Decode([]byte(data["cert"]))
			if block == nil {
				t.Fatal("certificate missing")
			}
			cert, err := x509.ParseCertificate(block.Bytes)
			if err != nil || cert.VerifyHostname("database") != nil {
				t.Fatal("TLS identity invalid")
			}
			if cert.VerifyHostname("other") == nil {
				t.Fatal("wrong host accepted")
			}
			if data["ca"] != data["cert"] || !strings.Contains(data["key"], "PRIVATE KEY") {
				t.Fatal("TLS material invalid")
			}
		}
	}
	if len(password) != 64 {
		t.Fatal("random encoding wrong")
	}
	if _, err = fixtureSecretDocuments(item, "test-foreign", request, time.Now()); err == nil {
		t.Fatal("foreign namespace accepted")
	}
	request.Secrets["injected"] = map[string]string{"value": "${password}"}
	if _, err = fixtureSecretDocuments(item, "test-generic", request, time.Now()); err == nil {
		t.Fatal("unbound request accepted")
	}
}
func TestFixtureSecretAdmissionRejectsEscalation(t *testing.T) {
	for name, mutate := range map[string]func(map[string]interface{}){
		"long TTL": func(s map[string]interface{}) { s["ttlSeconds"] = 3601 },
		"exposure": func(s map[string]interface{}) {
			s["exposure"] = map[string]interface{}{"provider": "tailscale-ingress"}
		},
		"namespace":      func(s map[string]interface{}) { s["namespaceName"] = "production" },
		"purpose":        func(s map[string]interface{}) { s["purpose"] = "final-preview" },
		"copy collision": func(s map[string]interface{}) { s["secretsToCopy"] = []interface{}{"service-runtime"} },
		"unknown generator": func(s map[string]interface{}) {
			objectValue(objectValue(s["testSecrets"])["values"])["password"] = map[string]interface{}{"kind": "command"}
		},
		"weak random": func(s map[string]interface{}) {
			objectValue(objectValue(s["testSecrets"])["values"])["password"] = map[string]interface{}{"kind": "random", "bytes": 1, "encoding": "hex"}
		},
		"foreign field": func(s map[string]interface{}) { objectValue(s["testSecrets"])["script"] = "cat /token" },
		"unknown ref": func(s map[string]interface{}) {
			objectValue(objectValue(s["testSecrets"])["secrets"])["service-runtime"] = map[string]interface{}{"password": "${foreign}"}
		},
		"journal collision": func(s map[string]interface{}) {
			objectValue(objectValue(s["testSecrets"])["secrets"])["buster-test-secrets-journal-fake"] = map[string]interface{}{"value": "${password}"}
		},
	} {
		t.Run(name, func(t *testing.T) {
			spec := genericTestSecretSpec()
			mutate(spec)
			if _, err := parseFixtureSecrets(&lease{Spec: spec}); err == nil {
				t.Fatal("invalid contract accepted")
			}
		})
	}
}

func TestFixtureSecretRejectsOversizeJournalBeforeIntent(t *testing.T) {
	f := newTestSecretAPIFixture(t)
	r := objectValue(f.item.Spec["testSecrets"])
	r["values"] = map[string]interface{}{"big": map[string]interface{}{"kind": "random", "bytes": 64, "encoding": "hex"}}
	secrets := map[string]interface{}{}
	for i := 0; i < 16; i++ {
		keys := map[string]interface{}{}
		for j := 0; j < 8; j++ {
			keys[strings.Repeat("k", 127)+string(rune('a'+j))] = "${big}${big}${big}"
		}
		secrets["secret-"+string(rune('a'+i))] = keys
	}
	r["secrets"] = secrets
	if err := f.ensure(); err == nil {
		t.Fatal("oversize serialized journal accepted")
	}
	if f.posts != 0 || len(f.status) != 0 {
		t.Fatal("rejected generation committed intent or private objects")
	}
}

func TestFixtureSecretRejectsReservedKubernetesKeys(t *testing.T) {
	for _, key := range []string{".", "..", "..password"} {
		t.Run(key, func(t *testing.T) {
			f := newTestSecretAPIFixture(t)
			objectValue(objectValue(objectValue(f.item.Spec["testSecrets"])["secrets"])["service-runtime"])[key] = "${password}"
			if _, err := parseFixtureSecrets(f.item); err == nil {
				t.Fatal("reserved key accepted")
			}
			if f.posts != 0 {
				t.Fatal("invalid input wrote objects")
			}
		})
	}
}

func TestRemovedBootstrapFieldRejected(t *testing.T) {
	for _, value := range []interface{}{nil, "", map[string]interface{}{"profile": "familyclaw.v1", "release": "familyclaw"}} {
		c := testController(t)
		if err := c.validateLeaseSpec(&lease{Spec: map[string]interface{}{"familyclawBootstrap": value}}); err == nil {
			t.Fatal("removed bootstrap field accepted")
		}
	}
}
