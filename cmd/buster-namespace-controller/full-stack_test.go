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

func TestFullStackBootstrapPurposeBoundary(t *testing.T) {
	cases := []struct {
		name    string
		enabled bool
		patch   func(map[string]interface{})
		want    bool
	}{
		{"fixed pretest", true, func(s map[string]interface{}) {}, true},
		{"disabled profile", false, func(s map[string]interface{}) {}, false},
		{"generic pretest", true, func(s map[string]interface{}) { delete(s, "familyclawBootstrap") }, false},
		{"generic gate", false, func(s map[string]interface{}) { delete(s, "familyclawBootstrap"); s["purpose"] = "gate" }, true},
		{"unknown profile", true, func(s map[string]interface{}) {
			s["familyclawBootstrap"].(map[string]interface{})["profile"] = "arbitrary"
		}, false},
		{"invalid release", true, func(s map[string]interface{}) {
			s["familyclawBootstrap"].(map[string]interface{})["release"] = "bad/release"
		}, false},
		{"exposed", true, func(s map[string]interface{}) { s["exposure"] = map[string]interface{}{"provider": "tailscale"} }, false},
		{"copied credentials", true, func(s map[string]interface{}) { s["secretsToCopy"] = []interface{}{"foreign"} }, false},
		{"demo credentials", true, func(s map[string]interface{}) { s["testCredentials"] = map[string]interface{}{} }, false},
		{"long ttl", true, func(s map[string]interface{}) { s["ttlSeconds"] = 3601 }, false},
		{"short ttl", true, func(s map[string]interface{}) { s["ttlSeconds"] = 59 }, false},
		{"wrong purpose", true, func(s map[string]interface{}) { s["purpose"] = "production" }, false},
		{"empty selector", true, func(s map[string]interface{}) { s["endpointSelector"] = map[string]interface{}{} }, false},
		{"invalid policy", true, func(s map[string]interface{}) {
			s["networkPolicies"] = []interface{}{map[string]interface{}{"name": "bad", "spec": map[string]interface{}{}}}
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spec := map[string]interface{}{"fullStack": true, "purpose": "pretest", "ttlSeconds": 600, "exposure": map[string]interface{}{"provider": "off"}, "familyclawBootstrap": map[string]interface{}{"profile": "familyclaw.v1", "release": "familyclaw"}, "servicePort": 8080, "endpointSelector": map[string]interface{}{"app": "core"}, "networkPolicies": []interface{}{}}
			tc.patch(spec)
			c := &controller{familyclawBootstrapEnabled: tc.enabled}
			err := c.validateFullStackNetwork(&lease{Spec: spec})
			if (err == nil) != tc.want {
				t.Fatalf("accepted=%v want=%v error=%v", err == nil, tc.want, err)
			}
		})
	}
}
