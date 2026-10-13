package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const demoRetention = time.Duration(defaultDemoRetentionSeconds) * time.Second

type readinessConfig struct{ Audience, Producer, Certificate, Key, Address string }
type demoReceipt struct {
	SchemaVersion string `json:"schemaVersion"`
	Accepted      bool   `json:"accepted"`
	Target        string `json:"target"`
	Status        int    `json:"status"`
	MessageID     string `json:"messageId"`
	DeliveryID    string `json:"deliveryId"`
	PayloadDigest string `json:"payloadDigest"`
}
type demoReadyRequest struct {
	RetentionSeconds   json.RawMessage `json:"retentionSeconds,omitempty"`
	wireDigest         string
	SchemaVersion      string      `json:"schemaVersion"`
	RequestID          string      `json:"requestId"`
	RunID              string      `json:"runId"`
	SourceRevision     string      `json:"sourceRevision"`
	CandidateDigest    string      `json:"candidateDigest"`
	DecisionDigest     string      `json:"decisionDigest"`
	ResultDigest       string      `json:"resultDigest"`
	LeaseName          string      `json:"leaseName"`
	LeaseUID           string      `json:"leaseUID"`
	Namespace          string      `json:"namespace"`
	ImmutableImage     string      `json:"immutableImage"`
	ManifestDigest     string      `json:"manifestDigest"`
	CredentialDigest   string      `json:"credentialDigest"`
	SecretUID          string      `json:"secretUID"`
	ExposureOwner      string      `json:"exposureOwner"`
	ExposureGeneration int64       `json:"exposureGeneration"`
	URL                string      `json:"url"`
	ObservedAt         string      `json:"observedAt"`
	Receipt            demoReceipt `json:"receipt"`
}
type demoReadyStatusRequest struct {
	SchemaVersion string `json:"schemaVersion"`
	LeaseName     string `json:"leaseName"`
	LeaseUID      string `json:"leaseUID"`
	RequestID     string `json:"requestId"`
}

var readyDigest = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
var readyName = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{0,252}$`)

func readyText(s string) bool {
	return len(s) > 0 && len(s) <= 1024 && !strings.ContainsAny(s, "\x00\r\n")
}
func (r demoReadyRequest) validate() error {
	if _, err := parseDemoRetention(r.RetentionSeconds); err != nil {
		return err
	}
	if r.SchemaVersion != "demo-ready-request.v1" || !readyName.MatchString(r.LeaseName) || !readyName.MatchString(r.Namespace) || r.ExposureGeneration < 1 {
		return errors.New("DEMO_READY_REQUEST_INVALID")
	}
	for _, s := range []string{r.RequestID, r.RunID, r.LeaseUID, r.SecretUID, r.ExposureOwner, r.Receipt.Target, r.Receipt.DeliveryID} {
		if !readyText(s) {
			return errors.New("DEMO_READY_IDENTITY_INVALID")
		}
	}
	for _, s := range []string{r.CandidateDigest, r.DecisionDigest, r.ResultDigest, r.ManifestDigest, r.CredentialDigest, r.Receipt.PayloadDigest} {
		if !readyDigest.MatchString(s) {
			return errors.New("DEMO_READY_DIGEST_INVALID")
		}
	}
	if !regexp.MustCompile(`^git:[a-f0-9]{40}([a-f0-9]{24})?$`).MatchString(r.SourceRevision) || !regexp.MustCompile(`^[^\s]+@sha256:[a-f0-9]{64}$`).MatchString(r.ImmutableImage) {
		return errors.New("DEMO_READY_SOURCE_INVALID")
	}
	u, err := url.Parse(r.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" || u.RawQuery != "" || u.String() != r.URL || !readyText(r.URL) {
		return errors.New("DEMO_READY_URL_INVALID")
	}
	if r.Receipt.SchemaVersion != "discord-delivery-receipt.v1" || !r.Receipt.Accepted || r.Receipt.Status < 200 || r.Receipt.Status > 299 || !regexp.MustCompile(`^[1-9][0-9]{0,19}$`).MatchString(r.Receipt.MessageID) || (len(r.Receipt.MessageID) == 20 && r.Receipt.MessageID > "18446744073709551615") {
		return errors.New("DEMO_READY_RECEIPT_INVALID")
	}
	return nil
}
func readyRequestDigest(r demoReadyRequest) string { return r.wireDigest }

func (c *controller) authenticateReady(ctx context.Context, authorization string) error {
	return c.authenticateTransport(ctx, authorization, c.readiness)
}

func (c *controller) authenticateTransport(ctx context.Context, authorization string, cfg *readinessConfig) error {
	if cfg == nil || !strings.HasPrefix(authorization, "Bearer ") || len(authorization) > 16384 {
		return errors.New("DEMO_READY_UNAUTHORIZED")
	}
	token := strings.TrimPrefix(authorization, "Bearer ")
	if token == "" || strings.ContainsAny(token, " \r\n\t") {
		return errors.New("DEMO_READY_UNAUTHORIZED")
	}
	var review struct {
		Status struct {
			Authenticated bool     `json:"authenticated"`
			Audiences     []string `json:"audiences"`
			User          struct {
				Username string `json:"username"`
			} `json:"user"`
		} `json:"status"`
	}
	err := c.kube(ctx, http.MethodPost, "/apis/authentication.k8s.io/v1/tokenreviews", map[string]interface{}{"apiVersion": "authentication.k8s.io/v1", "kind": "TokenReview", "spec": map[string]interface{}{"token": token, "audiences": []string{cfg.Audience}}}, "application/json", &review)
	if err != nil || !review.Status.Authenticated || review.Status.User.Username != cfg.Producer || !contains(review.Status.Audiences, cfg.Audience) {
		return errors.New("DEMO_READY_UNAUTHORIZED")
	}
	return nil
}

func (c *controller) readinessHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/demo-product/") {
			c.productHandler(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodPost || (r.URL.Path != "/v1/demo-ready" && r.URL.Path != "/v1/demo-ready/status") {
			http.Error(w, "DEMO_READY_ROUTE_INVALID", 404)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		if err := c.authenticateReady(ctx, r.Header.Get("Authorization")); err != nil {
			http.Error(w, "DEMO_READY_UNAUTHORIZED", 401)
			return
		}
		raw, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, 16*1024))
		if readErr != nil {
			http.Error(w, "DEMO_READY_REQUEST_INVALID", 400)
			return
		}
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.DisallowUnknownFields()
		var result map[string]interface{}
		var err error
		if r.URL.Path == "/v1/demo-ready/status" {
			var input demoReadyStatusRequest
			if decoder.Decode(&input) != nil || decoder.Decode(new(interface{})) != io.EOF || input.SchemaVersion != "demo-ready-status-request.v1" || !readyName.MatchString(input.LeaseName) || !readyText(input.LeaseUID) || !readyText(input.RequestID) {
				http.Error(w, "DEMO_READY_REQUEST_INVALID", 400)
				return
			}
			result, err = c.readDemoReady(ctx, input)
		} else {
			var input demoReadyRequest
			if decoder.Decode(&input) != nil || decoder.Decode(new(interface{})) != io.EOF || input.validate() != nil {
				http.Error(w, "DEMO_READY_REQUEST_INVALID", 400)
				return
			}
			digest := sha256.Sum256(raw)
			input.wireDigest = "sha256:" + hex.EncodeToString(digest[:])
			result, err = c.commitDemoReady(ctx, input)
		}
		if err != nil {
			http.Error(w, readyErrorCode(err), 409)
			return
		}
		_ = json.NewEncoder(w).Encode(result)
	})
}

func (c *controller) readDemoReady(ctx context.Context, r demoReadyStatusRequest) (map[string]interface{}, error) {
	var item lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(r.LeaseName), nil, "application/json", &item); err != nil {
		return nil, err
	}
	if item.Metadata.DeletionTimestamp != "" {
		return nil, errors.New("DEMO_READY_LEASE_DELETING")
	}
	if !time.Now().Before(c.expiresAt(&item)) {
		return nil, errors.New("DEMO_READY_EXPIRED")
	}
	state := objectValue(item.Status["demoReadiness"])
	if item.Metadata.UID != r.LeaseUID || item.Metadata.DeletionTimestamp != "" || stringValue(state["requestId"]) != r.RequestID || stringValue(state["state"]) != "ready-for-acceptance" || !time.Now().Before(c.expiresAt(&item)) || stringValue(item.Status["phase"]) != "Ready" {
		return nil, errors.New("DEMO_READY_NOT_CURRENT")
	}
	if err := c.verifyCommittedReady(ctx, &item); err != nil {
		return nil, err
	}
	return readyResponse(&item, state), nil
}
func readyResponse(item *lease, state map[string]interface{}) map[string]interface{} {
	seconds, _ := storedDemoRetention(state)
	return map[string]interface{}{"retentionSeconds": seconds, "schemaVersion": "demo-ready-response.v1", "leaseName": item.Metadata.Name, "leaseUID": item.Metadata.UID, "requestId": state["requestId"], "state": state["state"], "readyAt": state["readyAt"], "expiresAt": state["expiresAt"], "requestDigest": state["requestDigest"]}
}

func (c *controller) commitDemoReady(ctx context.Context, r demoReadyRequest) (map[string]interface{}, error) {
	if !readyDigest.MatchString(r.wireDigest) {
		return nil, errors.New("DEMO_READY_REQUEST_INVALID")
	}
	var item lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(r.LeaseName), nil, "application/json", &item); err != nil {
		return nil, err
	}
	if item.Metadata.UID != r.LeaseUID || item.Metadata.ResourceVersion == "" || stringValue(item.Status["phase"]) != "Ready" {
		return nil, errors.New("DEMO_READY_LEASE_NOT_CURRENT")
	}
	if item.Metadata.DeletionTimestamp != "" {
		return nil, errors.New("DEMO_READY_LEASE_DELETING")
	}
	if !time.Now().Before(c.expiresAt(&item)) {
		return nil, errors.New("DEMO_READY_EXPIRED")
	}
	state := objectValue(item.Status["demoReadiness"])
	if len(state) > 0 {
		if state["requestDigest"] != readyRequestDigest(r) || state["state"] != "ready-for-acceptance" {
			receipt := objectValue(state["receipt"])
			if receipt["messageId"] != r.Receipt.MessageID || receipt["deliveryId"] != r.Receipt.DeliveryID || receipt["payloadDigest"] != r.Receipt.PayloadDigest || receipt["target"] != r.Receipt.Target {
				return nil, errors.New("DEMO_READY_RECEIPT_CONFLICT")
			}
			return nil, errors.New("DEMO_READY_REPLAY_CHANGED")
		}
		if err := c.verifyCommittedReady(ctx, &item); err != nil {
			return nil, err
		}
		return readyResponse(&item, state), nil
	}
	if len(objectValue(item.Status["exposureMutation"])) > 0 {
		return nil, errors.New("DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED")
	}
	observed, err := time.Parse(time.RFC3339Nano, r.ObservedAt)
	now := time.Now().UTC()
	if err != nil || observed.After(now) || now.Sub(observed) > 5*time.Minute {
		return nil, errors.New("DEMO_READY_OBSERVATION_STALE")
	}
	if err = c.verifyReadySource(ctx, &item, r); err != nil {
		return nil, err
	}
	now = time.Now().UTC()
	if !now.Before(c.expiresAt(&item)) || now.Sub(observed) > 5*time.Minute {
		return nil, errors.New("DEMO_READY_EXPIRED")
	}
	seconds, err := parseDemoRetention(r.RetentionSeconds)
	if err != nil {
		return nil, err
	}
	expires, err := demoRetentionDeadline(now, seconds)
	if err != nil {
		return nil, err
	}
	state = map[string]interface{}{"retentionSeconds": seconds, "namespace": r.Namespace, "schemaVersion": "demo-readiness.v2", "state": "ready-for-acceptance", "requestId": r.RequestID, "requestDigest": readyRequestDigest(r), "readyAt": now.Format(time.RFC3339Nano), "expiresAt": expires.Format(time.RFC3339Nano), "runId": r.RunID, "sourceRevision": r.SourceRevision, "candidateDigest": r.CandidateDigest, "decisionDigest": r.DecisionDigest, "resultDigest": r.ResultDigest, "leaseUID": r.LeaseUID, "immutableImage": r.ImmutableImage, "manifestDigest": r.ManifestDigest, "credentialDigest": r.CredentialDigest, "secretUID": r.SecretUID, "url": r.URL, "previousOwner": r.ExposureOwner, "owner": "ready:" + readyRequestDigest(r), "exposureGeneration": r.ExposureGeneration, "exposureSpec": item.Spec["exposure"], "receipt": r.Receipt}
	patch := map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": item.Metadata.ResourceVersion}, "status": map[string]interface{}{"demoReadiness": state, "expiresAt": state["expiresAt"], "exposureOwner": state["owner"]}}
	if err = c.kube(ctx, http.MethodPatch, c.statusPath(r.LeaseName), patch, "application/merge-patch+json", nil); err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == 409 {
			return nil, errors.New("DEMO_READY_VERSION_CONFLICT")
		}
		return nil, errors.New("DEMO_READY_COMMIT_UNCERTAIN")
	}
	var persisted lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(r.LeaseName), nil, "application/json", &persisted); err != nil {
		return nil, errors.New("DEMO_READY_COMMIT_UNCERTAIN")
	}
	actual := objectValue(persisted.Status["demoReadiness"])
	actualSeconds, retentionErr := storedDemoRetention(actual)
	if _, present := actual["retentionSeconds"]; !present || retentionErr != nil || actualSeconds != seconds {
		return nil, errors.New("DEMO_READY_COMMIT_UNCERTAIN")
	}
	if persisted.Metadata.UID != item.Metadata.UID || persisted.Metadata.DeletionTimestamp != "" || actual["requestDigest"] != state["requestDigest"] || actual["readyAt"] != state["readyAt"] || actual["expiresAt"] != state["expiresAt"] {
		return nil, errors.New("DEMO_READY_COMMIT_UNCERTAIN")
	}
	if err := c.verifyCommittedReady(ctx, &persisted); err != nil {
		return nil, err
	}
	return readyResponse(&persisted, actual), nil
}

func (c *controller) verifyReadySource(ctx context.Context, item *lease, r demoReadyRequest) error {
	if item.Metadata.Annotations[exposureOwnerAnnotation] != r.ExposureOwner || stringValue(item.Status["exposureOwner"]) != r.ExposureOwner {
		return errors.New("DEMO_READY_EXPOSURE_OWNER_CHANGED")
	}
	if stringValue(item.Spec["purpose"]) != "final-preview" || stringValue(item.Spec["cleanupPolicy"]) != "retain" || stringValue(item.Status["namespaceName"]) != r.Namespace || stringValue(item.Spec["verifiedImage"]) != r.ImmutableImage || stringValue(item.Spec["manifestDigest"]) != r.ManifestDigest || stringValue(item.Status["previewUrl"]) != r.URL || stringValue(item.Status["exposurePhase"]) != "Ready" || item.Metadata.Generation != r.ExposureGeneration || item.Metadata.Annotations[exposureOwnerAnnotation] != r.ExposureOwner || stringValue(item.Status["exposureOwner"]) != r.ExposureOwner || intValue(item.Status["exposureGeneration"], 0) != int(r.ExposureGeneration) {
		return errors.New("DEMO_READY_SOURCE_CHANGED")
	}
	var pending map[string]interface{}
	if json.Unmarshal([]byte(item.Metadata.Annotations["kubeclaw.forgestack.ai/readiness-handoff"]), &pending) != nil || pending["phase"] != "awaiting-readiness" || pending["owner"] != r.ExposureOwner || pending["leaseUID"] != r.LeaseUID || pending["immutableImage"] != r.ImmutableImage || pending["manifestDigest"] != r.ManifestDigest {
		return errors.New("DEMO_READY_HANDOFF_INVALID")
	}
	if err := c.verifyReadyNamespace(ctx, item, r.Namespace); err != nil {
		return err
	}
	if err := c.verifyReadyIngress(ctx, item, r.Namespace, r.URL); err != nil {
		return err
	}
	return c.verifyReadySecret(ctx, item, r.Namespace, r.SecretUID, r.CredentialDigest)
}
