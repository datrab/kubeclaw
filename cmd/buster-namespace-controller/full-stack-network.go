package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
)

func onlyKeys(item map[string]interface{}, allowed ...string) bool {
	for key := range item {
		if !contains(allowed, key) {
			return false
		}
	}
	return true
}
func fixtureSelector(raw interface{}, nonempty bool) bool {
	item, ok := raw.(map[string]interface{})
	if !ok || !onlyKeys(item, "matchLabels") {
		return false
	}
	labels := map[string]interface{}{}
	if value, exists := item["matchLabels"]; exists {
		var valid bool
		labels, valid = value.(map[string]interface{})
		if !valid {
			return false
		}
	}
	if len(labels) > 32 || (nonempty && len(labels) == 0) {
		return false
	}
	for key, value := range labels {
		text, ok := value.(string)
		if key == "" || !ok || len(text) > 63 {
			return false
		}
	}
	return true
}
func validateFixtureNetworkSpec(raw interface{}) error {
	invalid := errors.New("fullStack network policy exceeds local-pod and DNS envelope")
	spec, ok := raw.(map[string]interface{})
	if !ok || !onlyKeys(spec, "podSelector", "policyTypes", "ingress", "egress") || !fixtureSelector(spec["podSelector"], false) {
		return invalid
	}
	types, ok := spec["policyTypes"].([]interface{})
	if !ok || len(types) < 1 || len(types) > 2 {
		return invalid
	}
	for _, value := range types {
		if value != "Ingress" && value != "Egress" {
			return invalid
		}
	}
	for _, direction := range []string{"ingress", "egress"} {
		value, exists := spec[direction]
		if !exists {
			continue
		}
		expected := "Ingress"
		peerField := "from"
		if direction == "egress" {
			expected = "Egress"
			peerField = "to"
		}
		if !contains(stringSlice(types), expected) {
			return invalid
		}
		rules, ok := value.([]interface{})
		if !ok || len(rules) > 64 {
			return invalid
		}
		for _, rawRule := range rules {
			rule, ok := rawRule.(map[string]interface{})
			if !ok || !onlyKeys(rule, peerField, "ports") {
				return invalid
			}
			peers, ok := rule[peerField].([]interface{})
			if !ok || len(peers) < 1 || len(peers) > 32 {
				return invalid
			}
			dns := false
			for _, rawPeer := range peers {
				peer, ok := rawPeer.(map[string]interface{})
				if !ok || !onlyKeys(peer, "podSelector", "namespaceSelector") || !fixtureSelector(peer["podSelector"], true) {
					return invalid
				}
				if ns, exists := peer["namespaceSelector"]; exists {
					if direction != "egress" || !fixtureSelector(ns, true) {
						return invalid
					}
					labels := securityObject(securityObject(ns)["matchLabels"])
					pods := securityObject(securityObject(peer["podSelector"])["matchLabels"])
					if len(labels) != 1 || labels["kubernetes.io/metadata.name"] != "kube-system" || len(pods) != 1 || pods["k8s-app"] != "kube-dns" {
						return invalid
					}
					dns = true
				}
			}
			ports, ok := rule["ports"].([]interface{})
			if !ok || len(ports) < 1 || len(ports) > 32 {
				return invalid
			}
			for _, rawPort := range ports {
				port, ok := rawPort.(map[string]interface{})
				if !ok || !onlyKeys(port, "port", "protocol") {
					return invalid
				}
				if value, ok := port["port"].(float64); ok {
					if value != float64(int(value)) {
						return invalid
					}
				} else if _, ok := port["port"].(int); !ok {
					return invalid
				}
				n := intValue(port["port"], 0)
				if n < 1 || n > 65535 || (dns && n != 53) {
					return invalid
				}
				protocol := stringValueDefault(port["protocol"], "TCP")
				if protocol != "TCP" && protocol != "UDP" {
					return invalid
				}
			}
		}
	}
	return nil
}
func (c *controller) validateFullStackNetwork(item *lease) error {
	spec := item.Spec
	if spec["fullStack"] != true {
		if _, ok := spec["networkPolicies"]; ok {
			return errors.New("networkPolicies requires fullStack")
		}
		if _, ok := spec["endpointSelector"]; ok {
			return errors.New("endpointSelector requires fullStack")
		}
		return nil
	}
	// Only the enabled, fully validated fixed bootstrap profile may use pretest.
	// This does not widen the generic full-stack or network-policy envelope.
	release, err := c.familyclawBootstrapRequest(item)
	if err != nil {
		return err
	}
	if (spec["purpose"] != "gate" && release == "") || stringValue(securityObject(spec["exposure"])["provider"]) != "off" {
		return errors.New("fullStack is restricted to unexposed gate leases")
	}
	port := intValue(spec["serviceTargetPort"], intValue(spec["servicePort"], 0))
	if port < 1 || port > 65535 {
		return errors.New("fullStack endpoint port is invalid")
	}
	if !fixtureSelector(map[string]interface{}{"matchLabels": spec["endpointSelector"]}, true) {
		return errors.New("fullStack requires nonempty endpointSelector")
	}
	policies, ok := spec["networkPolicies"].([]interface{})
	if !ok || len(policies) > 64 {
		return errors.New("invalid fullStack networkPolicies")
	}
	seen := map[string]bool{}
	for _, raw := range policies {
		policy, ok := raw.(map[string]interface{})
		if !ok || !onlyKeys(policy, "name", "spec") {
			return errors.New("invalid fullStack policy")
		}
		name := stringValue(policy["name"])
		if len(name) > 63 || sanitizeDNSLabel(name, "") != name || name == "" || seen[name] {
			return errors.New("invalid or duplicate fullStack policy name")
		}
		seen[name] = true
		if err := validateFixtureNetworkSpec(policy["spec"]); err != nil {
			return err
		}
	}
	return nil
}
func (c *controller) ensureFullStackPolicies(ctx context.Context, item *lease, namespace string) error {
	if err := c.validateFullStackNetwork(item); err != nil {
		return err
	}
	for _, raw := range interfaceSlice(item.Spec["networkPolicies"]) {
		policy := securityObject(raw)
		sum := sha256.Sum256([]byte(stringValue(policy["name"])))
		digest := fmt.Sprintf("%x", sum)
		name := "buster-fixture-" + digest[:32]
		manifest := map[string]interface{}{"apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy", "metadata": map[string]interface{}{"name": name, "namespace": namespace, "labels": ownerLabels(item, namespace)}, "spec": policy["spec"]}
		base := "/apis/networking.k8s.io/v1/namespaces/" + namespace + "/networkpolicies"
		if err := c.createOrPatch(ctx, base, base+"/"+name, manifest, nil); err != nil {
			return fmt.Errorf("install fixture network policy: %w", err)
		}
	}
	return nil
}
