package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func stackJSON(t *testing.T, value string) map[string]interface{} {
	t.Helper()
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(value), &result); err != nil {
		t.Fatal(err)
	}
	return result
}
func TestFullStackImageInventory(t *testing.T) {
	primary := "registry.local/core@sha256:" + strings.Repeat("a", 64)
	other := "registry.local/db@sha256:" + strings.Repeat("b", 64)
	spec := map[string]interface{}{"fullStack": true, "verifiedImage": primary, "verifiedImages": []interface{}{primary, other}, "manifestDigest": "sha256:" + strings.Repeat("c", 64)}
	if err := validateFullStackImages(spec); err != nil {
		t.Fatal(err)
	}
	for _, images := range [][]interface{}{{}, {other}, {primary, primary}, {primary, "registry.local/db:latest"}} {
		spec["verifiedImages"] = images
		if validateFullStackImages(spec) == nil {
			t.Fatalf("accepted invalid inventory %v", images)
		}
	}
	spec["verifiedImages"] = []interface{}{primary, other}
	delete(spec, "fullStack")
	if validateFullStackImages(spec) == nil {
		t.Fatal("accepted inventory without fullStack opt-in")
	}
}
func TestFullStackNetworkEnvelope(t *testing.T) {
	valid := `{"podSelector":{"matchLabels":{"app":"core"}},"policyTypes":["Egress"],"egress":[{"to":[{"podSelector":{"matchLabels":{"app":"database"}}}],"ports":[{"port":5432}]}]}`
	if err := validateFixtureNetworkSpec(stackJSON(t, valid)); err != nil {
		t.Fatal(err)
	}
	if err := validateFixtureNetworkSpec(stackJSON(t, `{"podSelector":{},"policyTypes":["Ingress","Egress"]}`)); err != nil {
		t.Fatal(err)
	}
	for _, policy := range []string{
		`{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"podSelector":{}}],"ports":[{"port":5432}]}]}`,
		`{"podSelector":{},"policyTypes":["Egress"],"egress":[{}]}`,
		`{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"ipBlock":{"cidr":"0.0.0.0/0"}}],"ports":[{"port":443}]}]}`,
		`{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"namespaceSelector":{},"podSelector":{}}],"ports":[{"port":443}]}]}`,
		`{"podSelector":{},"policyTypes":["Ingress"],"egress":[{"to":[{"podSelector":{}}],"ports":[{"port":443}]}]}`,
	} {
		if validateFixtureNetworkSpec(stackJSON(t, policy)) == nil {
			t.Fatalf("accepted policy %s", policy)
		}
	}
	dns := `{"podSelector":{},"policyTypes":["Egress"],"egress":[{"to":[{"namespaceSelector":{"matchLabels":{"kubernetes.io/metadata.name":"kube-system"}},"podSelector":{"matchLabels":{"k8s-app":"kube-dns"}}}],"ports":[{"port":53,"protocol":"UDP"}]}]}`
	if err := validateFixtureNetworkSpec(stackJSON(t, dns)); err != nil {
		t.Fatal(err)
	}
	if validateFixtureNetworkSpec(stackJSON(t, strings.Replace(dns, `"port":53`, `"port":443`, 1))) == nil {
		t.Fatal("accepted non-DNS port")
	}
}
