package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"testing"
	"time"
)

func TestDemoConfiguredInitialRetentionThroughOriginalHTTP(t *testing.T) {
	credentials := readyCredentials(t)
	t.Run("omitted duration and existing committed records retain seven days", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		status, result := f.call("/v1/demo-ready", "producer-token", f.request)
		if status != 200 || result["retentionSeconds"] != float64(defaultDemoRetentionSeconds) {
			t.Fatal(status, result)
		}
		f.mu.Lock()
		// Restore the exact historical v1 status shape, not a v2 missing-field fallback.
		objectValue(f.item.Status["demoReadiness"])["schemaVersion"] = "demo-readiness.v1"
		delete(objectValue(f.item.Status["demoReadiness"]), "retentionSeconds")
		f.version++
		f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
		f.mu.Unlock()
		status, replay := f.call("/v1/demo-ready", "producer-token", f.request)
		if status != 200 || replay["expiresAt"] != result["expiresAt"] || replay["retentionSeconds"] != result["retentionSeconds"] || f.patches != 1 {
			t.Fatal(status, replay)
		}
	})
	for _, seconds := range []int64{60, 1209600, maximumDemoRetentionSeconds} {
		t.Run(fmt.Sprintf("configured-%d-seconds", seconds), func(t *testing.T) {
			f := newReadyHTTPFixture(t, credentials)
			f.request.RetentionSeconds = json.RawMessage(strconv.FormatInt(seconds, 10))
			status, result := f.call("/v1/demo-ready", "producer-token", f.request)
			if status != 200 {
				t.Fatal(status, result)
			}
			ready, err := time.Parse(time.RFC3339Nano, stringValue(result["readyAt"]))
			if err != nil {
				t.Fatal(err)
			}
			expires, err := time.Parse(time.RFC3339Nano, stringValue(result["expiresAt"]))
			if err != nil {
				t.Fatal(err)
			}
			if result["retentionSeconds"] != float64(seconds) || expires.Sub(ready) != time.Duration(seconds)*time.Second || !f.controller.expiresAt(f.snapshot()).Equal(expires) {
				t.Fatal("configured retention differs from common expiry", result)
			}
			status, replay := f.call("/v1/demo-ready", "producer-token", f.request)
			if status != 200 || replay["readyAt"] != result["readyAt"] || replay["expiresAt"] != result["expiresAt"] || f.patches != 1 {
				t.Fatal("replay renewed", status, replay)
			}
			if seconds == 1209600 {
				f.request.RetentionSeconds = json.RawMessage("1209601")
				if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_REPLAY_CHANGED" {
					t.Fatal("changed retention replay accepted", status, result)
				}
			}
		})
	}
	t.Run("invalid noninteger and overflow duration never mutate", func(t *testing.T) {
		for _, raw := range []string{"0", "-1", "1.5", "null", "true", `"604800"`, "9223372037", "9223372036854775808"} {
			f := newReadyHTTPFixture(t, credentials)
			f.request.RetentionSeconds = json.RawMessage(raw)
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 400 || f.patches != 0 {
				t.Fatal(raw, status)
			}
		}
	})
	t.Run("custom expiry cleanup and manual deletion preserve original lifecycle", func(t *testing.T) {
		for _, manual := range []bool{false, true} {
			f := newReadyHTTPFixture(t, credentials)
			f.request.RetentionSeconds = json.RawMessage("60")
			if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
				t.Fatal(status)
			}
			f.mu.Lock()
			if manual {
				f.item.Metadata.DeletionTimestamp = time.Now().UTC().Format(time.RFC3339Nano)
			} else {
				// Aged persisted status in the API wire fixture; actual expiry code and clock run unchanged.
				s := objectValue(f.item.Status["demoReadiness"])
				ready := time.Now().UTC().Add(-61 * time.Second)
				s["readyAt"] = ready.Format(time.RFC3339Nano)
				s["expiresAt"] = ready.Add(time.Minute).Format(time.RFC3339Nano)
				f.item.Status["expiresAt"] = s["expiresAt"]
			}
			f.version++
			f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
			f.mu.Unlock()
			if manual {
				if err := f.controller.reconcileDeletedLease(context.Background(), f.snapshot(), f.request.Namespace); err != nil {
					t.Fatal(err)
				}
			} else {
				if expired, err := f.controller.expireLease(context.Background(), f.snapshot(), f.request.Namespace); err != nil || !expired {
					t.Fatal(expired, err)
				}
			}
			if f.deletes != 1 {
				t.Fatal("common namespace cleanup failed")
			}
		}
	})
	t.Run("invalid stored duration cannot return successful readiness", func(t *testing.T) {
		f := newReadyHTTPFixture(t, credentials)
		if status, _ := f.call("/v1/demo-ready", "producer-token", f.request); status != 200 {
			t.Fatal(status)
		}
		f.mu.Lock()
		objectValue(f.item.Status["demoReadiness"])["retentionSeconds"] = 1.5
		f.version++
		f.item.Metadata.ResourceVersion = strconv.Itoa(f.version)
		f.mu.Unlock()
		if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_RETENTION_INVALID" {
			t.Fatal(status, result)
		}
	})
	t.Run("pruned default and custom v2 duration never acknowledge replay or status", func(t *testing.T) {
		for _, raw := range []string{"", "604800", "1209600"} {
			f := newReadyHTTPFixture(t, credentials)
			f.request.RetentionSeconds = json.RawMessage(raw)
			f.pruneRetention = true
			if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_COMMIT_UNCERTAIN" {
				t.Fatal(raw, status, result)
			}
			if f.snapshot().Status["demoReadiness"].(map[string]interface{})["schemaVersion"] != "demo-readiness.v2" {
				t.Fatal("new record not versioned")
			}
			if status, result := f.call("/v1/demo-ready", "producer-token", f.request); status != 409 || result["error"] != "DEMO_READY_RETENTION_INVALID" {
				t.Fatal(raw, "replay", status, result)
			}
			input := demoReadyStatusRequest{SchemaVersion: "demo-ready-status-request.v1", LeaseName: f.request.LeaseName, LeaseUID: f.request.LeaseUID, RequestID: f.request.RequestID}
			if status, result := f.call("/v1/demo-ready/status", "producer-token", input); status != 409 || result["error"] != "DEMO_READY_RETENTION_INVALID" {
				t.Fatal(raw, "status", status, result)
			}
			if f.patches != 1 {
				t.Fatal("invalid record changed on retry")
			}
		}
	})

}

func TestDemoRetentionTimestampArithmeticBound(t *testing.T) {
	if _, err := demoRetentionDeadline(time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC), 1); err == nil {
		t.Fatal("unrepresentable RFC3339 timestamp accepted")
	}
	if _, err := demoRetentionDeadline(time.Now(), maximumDemoRetentionSeconds+1); err == nil {
		t.Fatal("duration arithmetic overflow accepted")
	}
}
