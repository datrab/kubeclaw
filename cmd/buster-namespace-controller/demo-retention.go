package main

import (
	"encoding/json"
	"errors"
	"time"
)

const legacyDemoRetentionSeconds int64 = 604800

// Technical arithmetic bound only; this is not an operational retention policy.
const maximumDemoRetentionSeconds int64 = (1<<63 - 1) / int64(time.Second)

func parseDemoRetention(raw json.RawMessage) (int64, error) {
	if len(raw) == 0 {
		return 0, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	var seconds int64
	if string(raw) == "null" || json.Unmarshal(raw, &seconds) != nil || seconds < 1 || seconds > maximumDemoRetentionSeconds {
		return 0, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	return seconds, nil
}

func storedDemoRetention(state map[string]interface{}) (int64, error) {
	value, exists := state["retentionSeconds"]
	if state["schemaVersion"] == "demo-readiness.v1" && !exists {
		// Only the actual historical schema has implicit seven-day retention.
		return legacyDemoRetentionSeconds, nil
	}
	if state["schemaVersion"] != "demo-readiness.v2" || !exists {
		return 0, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return 0, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	return parseDemoRetention(raw)
}

func demoRetentionDeadline(ready time.Time, seconds int64) (time.Time, error) {
	if seconds < 1 || seconds > maximumDemoRetentionSeconds {
		return time.Time{}, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	expires := ready.Add(time.Duration(seconds) * time.Second)
	if ready.Year() < 1 || ready.Year() > 9999 || expires.Year() < 1 || expires.Year() > 9999 {
		return time.Time{}, errors.New("DEMO_READY_RETENTION_INVALID")
	}
	return expires, nil
}

// Only new admission selects the current default. Persisted v2 and historical
// v1 records above are recovered without consulting the current deployment.
func (c *controller) admittedDemoRetention(raw json.RawMessage) (int64, error) {
	if len(raw) == 0 {
		if c.policy.DefaultDemoRetentionSeconds < 1 || c.policy.DefaultDemoRetentionSeconds > maximumDemoRetentionSeconds {
			return 0, errors.New("CONTROLLER_POLICY_INVALID")
		}
		return c.policy.DefaultDemoRetentionSeconds, nil
	}
	return parseDemoRetention(raw)
}
