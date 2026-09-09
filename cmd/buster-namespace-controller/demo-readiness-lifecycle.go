package main

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

func (c *controller) configureReadiness() error {
	if os.Getenv("BUSTER_READY_LISTEN") == "" {
		return nil
	}
	config := &readinessConfig{Address: os.Getenv("BUSTER_READY_LISTEN"), Audience: os.Getenv("BUSTER_READY_AUDIENCE"), Producer: os.Getenv("BUSTER_READY_PRODUCER"), Certificate: os.Getenv("BUSTER_READY_TLS_CERT"), Key: os.Getenv("BUSTER_READY_TLS_KEY")}
	parts := strings.Split(config.Producer, ":")
	if len(parts) != 4 || parts[0] != "system" || parts[1] != "serviceaccount" || !readyName.MatchString(parts[2]) || !readyName.MatchString(parts[3]) || !readyText(config.Audience) || config.Certificate == "" || config.Key == "" {
		return errors.New("Ready server requires explicit audience, ServiceAccount identity and TLS certificate")
	}
	if _, _, err := net.SplitHostPort(config.Address); err != nil {
		return errors.New("invalid Ready listen address")
	}
	c.readiness = config
	return nil
}
func (c *controller) startReadinessServer(ctx context.Context) error {
	if c.readiness == nil {
		return nil
	}
	certificate, err := tls.LoadX509KeyPair(c.readiness.Certificate, c.readiness.Key)
	if err != nil {
		return errors.New("Ready TLS certificate unavailable")
	}
	listener, err := tls.Listen("tcp", c.readiness.Address, &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{certificate}})
	if err != nil {
		return err
	}
	server := &http.Server{Handler: c.readinessHandler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 20 * 1024}
	go func() { <-ctx.Done(); _ = server.Close() }()
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logJSON("error", "Ready server stopped", "listener failure")
		}
	}()
	return nil
}
func demoReadyDeadline(item *lease) (time.Time, bool) {
	state := objectValue(item.Status["demoReadiness"])
	ready, err := time.Parse(time.RFC3339, stringValue(state["readyAt"]))
	if err != nil {
		return time.Time{}, false
	}
	seconds, err := storedDemoRetention(state)
	if err != nil {
		return time.Time{}, false
	}
	expected, err := demoRetentionDeadline(ready, seconds)
	if err != nil {
		return time.Time{}, false
	}
	expires, err := time.Parse(time.RFC3339, stringValue(state["expiresAt"]))
	if err != nil || !expires.Equal(expected) || state["leaseUID"] != item.Metadata.UID || !readyDigest.MatchString(stringValue(state["requestDigest"])) {
		return time.Time{}, false
	}
	return expires, true
}
func readyStateEqual(left, right *lease) bool {
	a, _ := json.Marshal(left.Status["demoReadiness"])
	b, _ := json.Marshal(right.Status["demoReadiness"])
	pa, _ := json.Marshal(left.Status["demoProduct"])
	pb, _ := json.Marshal(right.Status["demoProduct"])
	return string(a) == string(b) && string(pa) == string(pb)
}

// Every API-backed mutation uses authoritative identity and resource-version CAS.
func (c *controller) patchLeaseStatus(ctx context.Context, item *lease, status map[string]interface{}) error {
	var current lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &current); err != nil {
		return err
	}
	if current.Metadata.ResourceVersion == "" || current.Metadata.UID != item.Metadata.UID || current.Metadata.Generation != item.Metadata.Generation || current.Metadata.DeletionTimestamp != item.Metadata.DeletionTimestamp || !readyStateEqual(item, &current) || current.Metadata.Annotations[exposureOwnerAnnotation] != item.Metadata.Annotations[exposureOwnerAnnotation] {
		return errors.New("lease status transition superseded")
	}
	phase := stringValue(current.Status["phase"])
	if (phase == "Expired" || phase == "Deleting" || phase == "Rejected") && phase != stringValue(item.Status["phase"]) {
		return errors.New("lease terminal transition superseded")
	}
	claim := stringValue(objectValue(current.Status["exposureMutation"])["id"])
	terminal := status["phase"] == "Expired" || status["phase"] == "Deleting" || status["phase"] == "Rejected"
	if claim != "" && item.ExposureClaim != claim && !terminal {
		return errors.New("DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED")
	}
	if claim != "" && (terminal || (status["exposurePhase"] != nil && status["exposurePhase"] != "Reconciling")) {
		status["exposureMutation"] = nil
	}
	unchanged := true
	for key, value := range status {
		a, _ := json.Marshal(value)
		b, _ := json.Marshal(current.Status[key])
		if string(a) != string(b) {
			unchanged = false
		}
	}
	if unchanged {
		return nil
	}
	if err := c.kube(ctx, http.MethodPatch, c.statusPath(item.Metadata.Name), map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": current.Metadata.ResourceVersion}, "status": status}, "application/merge-patch+json", nil); err != nil {
		return err
	}
	if item.Status == nil {
		item.Status = map[string]interface{}{}
	}
	for key, value := range status {
		item.Status[key] = value
	}
	if value, exists := status["exposureMutation"]; exists && value == nil {
		item.ExposureClaim = ""
	}
	return nil
}
func (c *controller) fenceNamespaceCleanup(ctx context.Context, item *lease) error {
	phase := stringValue(item.Status["phase"])
	if phase != "Expired" && phase != "Rejected" {
		phase = "Deleting"
	}
	return c.patchLeaseStatus(ctx, item, map[string]interface{}{"phase": phase})
}
func effectiveExposureOwner(item *lease) string {
	if _, ok := demoReadyDeadline(item); ok {
		return stringValue(objectValue(item.Status["demoReadiness"])["owner"])
	}
	return item.Metadata.Annotations[exposureOwnerAnnotation]
}
func effectiveExposureGeneration(item *lease) int64 {
	if _, ok := demoReadyDeadline(item); ok {
		return int64(intValue(objectValue(item.Status["demoReadiness"])["exposureGeneration"], 0))
	}
	return item.Metadata.Generation
}

func (c *controller) removeFinalizerCAS(ctx context.Context, item *lease) error {
	var current lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &current); err != nil {
		return err
	}
	if current.Metadata.UID != item.Metadata.UID || current.Metadata.ResourceVersion == "" || current.Metadata.DeletionTimestamp == "" {
		return errors.New("lease deletion superseded")
	}
	finalizers := []string{}
	for _, value := range current.Metadata.Finalizers {
		if value != c.finalizer {
			finalizers = append(finalizers, value)
		}
	}
	return c.kube(ctx, http.MethodPatch, c.leasePath(item.Metadata.Name), map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": current.Metadata.ResourceVersion, "finalizers": finalizers}}, "application/merge-patch+json", nil)
}

func (c *controller) fenceExposureMutation(ctx context.Context, item *lease) error {
	// The CAS reservation makes readiness admission reject until the original
	// reconciler publishes the newly observed exposure. A stale pre-Ready worker
	// cannot delete/replace the ingress after the readiness status committed.
	if item.ExposureClaim == "" {
		random := make([]byte, 24)
		if _, err := rand.Read(random); err != nil {
			return err
		}
		item.ExposureClaim = hex.EncodeToString(random)
	}
	if err := c.patchLeaseStatus(ctx, item, map[string]interface{}{"exposurePhase": "Reconciling", "exposureMutation": map[string]interface{}{"id": item.ExposureClaim, "startedAt": time.Now().UTC().Format(time.RFC3339)}}); err != nil {
		return err
	}
	var persisted lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &persisted); err != nil {
		return err
	}
	if persisted.Metadata.UID != item.Metadata.UID || persisted.Metadata.DeletionTimestamp != "" || stringValue(objectValue(persisted.Status["exposureMutation"])["id"]) != item.ExposureClaim || !readyStateEqual(item, &persisted) {
		return errors.New("DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED")
	}
	return nil
}

func (c *controller) deleteNamespaceCAS(ctx context.Context, namespaceName string, namespace map[string]interface{}) error {
	meta := objectValue(namespace["metadata"])
	uid, version := stringValue(meta["uid"]), stringValue(meta["resourceVersion"])
	if uid == "" || version == "" {
		return errors.New("namespace deletion identity is missing")
	}
	if err := c.kube(ctx, http.MethodDelete, "/api/v1/namespaces/"+namespaceName, map[string]interface{}{"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": map[string]interface{}{"uid": uid, "resourceVersion": version}}, "application/json", nil); err != nil {
		return err
	}
	return c.waitForNamespaceDeleted(ctx, namespaceName)
}
