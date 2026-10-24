package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Closed generation contract: no commands, file reads, imported values or scripts.
type fixtureSecretValue struct {
	Kind     string `json:"kind"`
	Bytes    int    `json:"bytes,omitempty"`
	Encoding string `json:"encoding,omitempty"`
	Host     string `json:"host,omitempty"`
}
type fixtureSecretRequest struct {
	Values  map[string]fixtureSecretValue `json:"values"`
	Secrets map[string]map[string]string  `json:"secrets"`
}

var fixtureSecretID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,39}$`)
var fixtureSecretName = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$`)
var fixtureSecretKey = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)
var fixtureSecretRef = regexp.MustCompile(`\$\{([a-z][a-z0-9-]{0,39})(?:\.(ca|cert|key))?\}`)

func parseFixtureSecrets(item *lease) (*fixtureSecretRequest, error) {
	raw, present := item.Spec["testSecrets"]
	if !present {
		return nil, nil
	}
	b, err := json.Marshal(raw)
	if err != nil || len(b) > 32768 {
		return nil, errors.New("testSecrets input exceeds bound")
	}
	var r fixtureSecretRequest
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if d.Decode(&r) != nil {
		return nil, errors.New("testSecrets invalid contract")
	}
	ttl := intValue(item.Spec["ttlSeconds"], 0)
	if !boolValue(item.Spec["fullStack"]) || stringValue(item.Spec["purpose"]) != "gate" || ttl < 60 || ttl > 3600 || !strings.HasPrefix(stringValue(item.Spec["namespaceName"]), "test-") || stringValue(objectValue(item.Spec["exposure"])["provider"]) != "off" {
		return nil, errors.New("testSecrets requires isolated gate lease, exposure off, TTL 60..3600")
	}
	if len(r.Values) < 1 || len(r.Values) > 32 || len(r.Secrets) < 1 || len(r.Secrets) > 16 {
		return nil, errors.New("testSecrets count bound exceeded")
	}
	for id, v := range r.Values {
		if !fixtureSecretID.MatchString(id) {
			return nil, errors.New("testSecrets invalid value ID")
		}
		switch v.Kind {
		case "random":
			if v.Bytes < 16 || v.Bytes > 64 || v.Host != "" || (v.Encoding != "hex" && v.Encoding != "base64" && v.Encoding != "base64url") {
				return nil, errors.New("testSecrets invalid random generator")
			}
		case "tls":
			if v.Bytes != 0 || v.Encoding != "" || !fixtureSecretName.MatchString(v.Host) {
				return nil, errors.New("testSecrets TLS host must be a local service name")
			}
		default:
			return nil, errors.New("testSecrets unsupported generator")
		}
	}
	for name, keys := range r.Secrets {
		if !fixtureSecretName.MatchString(name) || strings.HasPrefix(name, fixtureSecretJournal) || len(keys) < 1 || len(keys) > 32 {
			return nil, errors.New("testSecrets invalid Secret definition")
		}
		for _, source := range stringSlice(item.Spec["secretsToCopy"]) {
			if source == name {
				return nil, errors.New("testSecrets copied Secret collision")
			}
		}
		if stringValue(objectValue(item.Spec["testCredentials"])["secretName"]) == name {
			return nil, errors.New("testSecrets demo credential collision")
		}
		for key, template := range keys {
			if !fixtureSecretKey.MatchString(key) || key == "." || strings.HasPrefix(key, "..") || len(template) < 1 || len(template) > 4096 {
				return nil, errors.New("testSecrets invalid key/template")
			}
			refs := fixtureSecretRef.FindAllStringSubmatch(template, -1)
			if strings.Contains(fixtureSecretRef.ReplaceAllString(template, ""), "${") {
				return nil, errors.New("testSecrets invalid generated reference")
			}
			for _, ref := range refs {
				v, ok := r.Values[ref[1]]
				if !ok || (v.Kind == "tls" && ref[2] == "") || (v.Kind == "random" && ref[2] != "") {
					return nil, errors.New("testSecrets unresolved reference")
				}
			}
		}
	}
	return &r, nil
}
func fixtureSecretDocuments(item *lease, namespace string, r *fixtureSecretRequest, now time.Time) ([]map[string]interface{}, error) {
	if item == nil || item.Metadata.UID == "" || namespace != stringValue(item.Spec["namespaceName"]) || !strings.HasPrefix(namespace, "test-") {
		return nil, errors.New("testSecrets namespace identity missing")
	}
	// Generation accepts only the same validated request bound into the lease.
	checked, err := parseFixtureSecrets(item)
	if err != nil || checked == nil || fixtureSecretDigest(checked) != fixtureSecretDigest(r) {
		return nil, errors.New("testSecrets request binding invalid")
	}
	values := map[string]string{}
	for id, v := range r.Values {
		if v.Kind == "random" {
			b := make([]byte, v.Bytes)
			if _, err := rand.Read(b); err != nil {
				return nil, errors.New("testSecrets randomness failed")
			}
			switch v.Encoding {
			case "hex":
				values[id] = hex.EncodeToString(b)
			case "base64":
				values[id] = base64.StdEncoding.EncodeToString(b)
			case "base64url":
				values[id] = base64.RawURLEncoding.EncodeToString(b)
			}
		} else {
			tls, err := fixtureSecretTLS(v.Host, now)
			if err != nil {
				return nil, err
			}
			values[id+".ca"] = tls["ca.crt"]
			values[id+".cert"] = tls["tls.crt"]
			values[id+".key"] = tls["tls.key"]
		}
	}
	documents := []map[string]interface{}{}
	total := 0
	for name, keys := range r.Secrets {
		data := map[string]string{}
		for key, template := range keys {
			value := fixtureSecretRef.ReplaceAllStringFunc(template, func(ref string) string { return values[ref[2:len(ref)-1]] })
			data[key] = value
			total += len(value)
		}
		if total > 49152 {
			return nil, errors.New("testSecrets output exceeds bound")
		}
		documents = append(documents, map[string]interface{}{"apiVersion": "v1", "kind": "Secret", "type": "Opaque", "immutable": true, "metadata": map[string]interface{}{"name": name, "namespace": namespace, "labels": ownerLabels(item, namespace), "annotations": map[string]string{"kubeclaw.forgestack.ai/bootstrap-profile": "test-secrets.v1", "kubeclaw.forgestack.ai/bootstrap-lease-uid": item.Metadata.UID}}, "stringData": data})
	}
	sort.Slice(documents, func(i, j int) bool {
		return stringValue(objectValue(documents[i]["metadata"])["name"]) < stringValue(objectValue(documents[j]["metadata"])["name"])
	})
	encoded, err := json.Marshal(documents)
	if err != nil || len(encoded) > 65536 {
		return nil, errors.New("testSecrets serialized journal exceeds bound")
	}
	return documents, nil
}

func (c *controller) ensureLeaseTestSecrets(ctx context.Context, item *lease, namespace string) error {
	request, err := parseFixtureSecrets(item)
	if err != nil || request == nil {
		return err
	}
	_, err = c.ensureFixtureSecret(ctx, item, namespace, request)
	return err
}
