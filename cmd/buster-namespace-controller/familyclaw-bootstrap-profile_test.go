package main

import (
	"context"
	"testing"
)

func bootstrapProfileSpec() map[string]interface{} {
	return map[string]interface{}{"fullStack": true, "ttlSeconds": 600, "familyclawBootstrap": map[string]interface{}{"profile": "familyclaw.v1", "release": "familyclaw"}}
}
func TestFamilyclawBootstrapProfileDefaultDenyAndAbsentNoop(t *testing.T) {
	c := testController(t)
	if err := c.ensureLeaseFamilyclawBootstrap(context.Background(), &lease{Spec: map[string]interface{}{}}, "not-used"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.familyclawBootstrapRequest(&lease{Spec: bootstrapProfileSpec()}); err == nil {
		t.Fatal("default deny bypassed")
	}
	c.familyclawBootstrapEnabled = true
	if release, err := c.familyclawBootstrapRequest(&lease{Spec: bootstrapProfileSpec()}); err != nil || release != "familyclaw" {
		t.Fatal("valid profile rejected")
	}
}
func TestFamilyclawBootstrapProfileRejectsEscalationAndLongRetention(t *testing.T) {
	for _, mutate := range []func(map[string]interface{}){
		func(s map[string]interface{}) { s["ttlSeconds"] = 3601 },
		func(s map[string]interface{}) { delete(s, "ttlSeconds") },
		func(s map[string]interface{}) { s["purpose"] = "final-preview" },
		func(s map[string]interface{}) { s["fullStack"] = false },
		func(s map[string]interface{}) { s["secretsToCopy"] = []interface{}{"prism-test-runtime"} },
		func(s map[string]interface{}) { s["testCredentials"] = map[string]interface{}{"mode": "generate"} },
		func(s map[string]interface{}) { objectValue(s["familyclawBootstrap"])["profile"] = "arbitrary" },
		func(s map[string]interface{}) { objectValue(s["familyclawBootstrap"])["release"] = "../foreign" },
		func(s map[string]interface{}) { objectValue(s["familyclawBootstrap"])["data"] = "private-import" },
	} {
		c := testController(t)
		c.familyclawBootstrapEnabled = true
		s := bootstrapProfileSpec()
		mutate(s)
		if _, err := c.familyclawBootstrapRequest(&lease{Spec: s}); err == nil {
			t.Fatal("invalid bootstrap authority accepted")
		}
	}
}
func TestFamilyclawBootstrapProfileReconcileWrapperProvisionsAndPreservesProofs(t *testing.T) {
	f := newBootstrapAPIFixture(t)
	f.ctrl.familyclawBootstrapEnabled = true
	f.item.Spec = bootstrapProfileSpec()
	if err := f.ctrl.ensureLeaseFamilyclawBootstrap(context.Background(), f.item, "test-familyclaw"); err != nil {
		t.Fatal(err)
	}
	if len(f.secrets) != 7 || len(objectValue(f.item.Status["familyclawBootstrapSecrets"])) != 6 || !boolValue(objectValue(f.item.Status["familyclawBootstrapReady"])["ready"]) {
		t.Fatal("provisioning proofs lost")
	}
	posts := f.posts
	if err := f.ctrl.ensureLeaseFamilyclawBootstrap(context.Background(), f.item, "test-familyclaw"); err != nil {
		t.Fatal(err)
	}
	if f.posts != posts {
		t.Fatal("ready reconciliation regenerated secrets")
	}
}
