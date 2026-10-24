package main

import (
	"context"
	"errors"
)

// Fixed opt-in profile, not an arbitrary Secret manifest/import facility.
func (c *controller) familyclawBootstrapRequest(item *lease) (string, error) {
	value, present := item.Spec["familyclawBootstrap"]
	if !present {
		return "", nil
	}
	if !c.familyclawBootstrapEnabled {
		return "", errors.New("familyclaw bootstrap profile is disabled")
	}
	entry, ok := value.(map[string]interface{})
	if !ok || len(entry) != 2 || entry["profile"] != "familyclaw.v1" {
		return "", errors.New("familyclaw bootstrap requires the fixed familyclaw.v1 profile")
	}
	release := stringValue(entry["release"])
	if !familyclawReleaseName.MatchString(release) {
		return "", errors.New("familyclaw bootstrap release is invalid")
	}
	ttl := intValue(item.Spec["ttlSeconds"], 0)
	if ttl < 60 || ttl > 3600 || !boolValue(item.Spec["fullStack"]) || stringValueDefault(item.Spec["purpose"], "pretest") != "pretest" {
		return "", errors.New("familyclaw bootstrap requires a full-stack pretest lease with TTL 60..3600")
	}
	if len(stringSlice(item.Spec["secretsToCopy"])) != 0 || item.Spec["testCredentials"] != nil {
		return "", errors.New("familyclaw bootstrap cannot mix copied or demo credentials")
	}
	return release, nil
}

func (c *controller) ensureLeaseFamilyclawBootstrap(ctx context.Context, item *lease, namespace string) error {
	release, err := c.familyclawBootstrapRequest(item)
	if err != nil || release == "" {
		return err
	}
	live, err := c.familyclawBootstrapLease(ctx, item, namespace)
	if err != nil {
		return err
	}
	current, err := c.familyclawBootstrapRequest(live)
	if err != nil || current != release {
		return errors.New("familyclaw bootstrap lease profile changed")
	}
	result, err := c.ensureFamilyclawBootstrap(ctx, live, namespace, release)
	if err != nil {
		return err
	}
	if err = c.familyclawBootstrapStatus(ctx, live, namespace, "familyclawBootstrapReady", result); err != nil {
		return err
	}
	fresh, err := c.familyclawBootstrapLease(ctx, live, namespace)
	if err != nil {
		return err
	}
	item.Status = fresh.Status
	return nil
}
