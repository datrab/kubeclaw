package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"reflect"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const productDomain = "kubeclaw.demo-product-decision.v1\x00"
const productMaxDecisions = 128

var productDecisionID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

type productConfig struct {
	Audience, Producer, Issuer string
	PublicKey                  ed25519.PublicKey
	Actors                     map[string]bool
}
type productEnvelope struct {
	SchemaVersion string `json:"schemaVersion"`
	Payload       string `json:"payload"`
	Signature     string `json:"signature"`
}
type productDecision struct {
	SchemaVersion    string `json:"schemaVersion"`
	Issuer           string `json:"issuer"`
	ActorID          string `json:"actorId"`
	DecisionID       string `json:"decisionId"`
	Action           string `json:"action"`
	LeaseName        string `json:"leaseName"`
	LeaseUID         string `json:"leaseUID"`
	SourceRevision   string `json:"sourceRevision"`
	CandidateDigest  string `json:"candidateDigest"`
	ResultDigest     string `json:"resultDigest"`
	ReadyDigest      string `json:"readyDigest"`
	Generation       int64  `json:"generation"`
	ExpectedExpiry   string `json:"expectedExpiry"`
	ExpectedRevision string `json:"expectedRevision"`
	IssuedAt         string `json:"issuedAt"`
	ExpiresAt        string `json:"expiresAt"`
	Reason           string `json:"reason"`
	ExtensionSeconds *int64 `json:"extensionSeconds,omitempty"`
}

func (c *controller) configureProduct() error {
	enabled := os.Getenv("BUSTER_PRODUCT_ENABLED")
	if enabled == "" || enabled == "false" {
		return nil
	}
	if enabled != "true" || c.readiness == nil {
		return errors.New("DEMO_PRODUCT_CONFIG_INVALID")
	}
	key, err := base64.StdEncoding.Strict().DecodeString(os.Getenv("BUSTER_PRODUCT_VERIFY_KEY"))
	var actors []string
	cfg := &productConfig{Audience: os.Getenv("BUSTER_PRODUCT_AUDIENCE"), Producer: os.Getenv("BUSTER_PRODUCT_PRODUCER"), Issuer: os.Getenv("BUSTER_PRODUCT_ISSUER"), PublicKey: key, Actors: map[string]bool{}}
	parts := strings.Split(cfg.Producer, ":")
	if err != nil || len(key) != ed25519.PublicKeySize || !readyText(cfg.Audience) || !readyText(cfg.Issuer) || len(parts) != 4 || parts[0] != "system" || parts[1] != "serviceaccount" || !readyName.MatchString(parts[2]) || !readyName.MatchString(parts[3]) || cfg.Producer == c.readiness.Producer || json.Unmarshal([]byte(os.Getenv("BUSTER_PRODUCT_ACTORS_JSON")), &actors) != nil || len(actors) == 0 {
		return errors.New("DEMO_PRODUCT_CONFIG_INVALID")
	}
	for _, actor := range actors {
		if !readyText(actor) || cfg.Actors[actor] {
			return errors.New("DEMO_PRODUCT_CONFIG_INVALID")
		}
		cfg.Actors[actor] = true
	}
	c.product = cfg
	return nil
}

// Decode the exact signed bytes. Reject duplicate keys as well as unknown fields,
// trailing values, invalid UTF-8, and nested duplicates before typed decoding.
func productJSON(raw []byte, target interface{}) error {
	if !utf8.Valid(raw) {
		return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	var walk func() error
	walk = func() error {
		token, err := d.Token()
		if err != nil {
			return err
		}
		delimiter, ok := token.(json.Delim)
		if !ok {
			return nil
		}
		switch delimiter {
		case '{':
			keys := map[string]bool{}
			for d.More() {
				token, err = d.Token()
				if err != nil {
					return err
				}
				key, ok := token.(string)
				if !ok || keys[key] {
					return errors.New("duplicate key")
				}
				keys[key] = true
				if err = walk(); err != nil {
					return err
				}
			}
		case '[':
			for d.More() {
				if err = walk(); err != nil {
					return err
				}
			}
		default:
			return errors.New("invalid delimiter")
		}
		_, err = d.Token()
		return err
	}
	if walk() != nil {
		return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	if _, err := d.Token(); err != io.EOF {
		return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	kind := reflect.TypeOf(target).Elem()
	allowed := map[string]bool{}
	for i := 0; i < kind.NumField(); i++ {
		allowed[strings.Split(kind.Field(i).Tag.Get("json"), ",")[0]] = true
	}
	for key, value := range fields {
		if !allowed[key] || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
		}
	}
	d = json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(target) != nil || d.Decode(new(interface{})) != io.EOF {
		return errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	return nil
}
func productUTC(s string) (time.Time, error) {
	t, e := time.Parse("2006-01-02T15:04:05Z", s)
	if e != nil || t.Format("2006-01-02T15:04:05Z") != s {
		return time.Time{}, errors.New("DEMO_PRODUCT_TIME_INVALID")
	}
	return t, nil
}
func (c *controller) verifyProduct(envelope productEnvelope) (productDecision, string, error) {
	var d productDecision
	invalid := errors.New("DEMO_PRODUCT_SIGNATURE_INVALID")
	if c.product == nil || envelope.SchemaVersion != "demo-product-decision-envelope.v1" {
		return d, "", invalid
	}
	raw, e := base64.StdEncoding.Strict().DecodeString(envelope.Payload)
	sig, se := base64.StdEncoding.Strict().DecodeString(envelope.Signature)
	if e != nil || se != nil || len(raw) > 8192 || base64.StdEncoding.EncodeToString(raw) != envelope.Payload || base64.StdEncoding.EncodeToString(sig) != envelope.Signature || !ed25519.Verify(c.product.PublicKey, append([]byte(productDomain), raw...), sig) {
		return d, "", invalid
	}
	if e = productJSON(raw, &d); e != nil {
		return d, "", e
	}
	if d.SchemaVersion != "demo-product-decision.v1" || d.Issuer != c.product.Issuer || !c.product.Actors[d.ActorID] || !readyName.MatchString(d.LeaseName) || d.Generation < 1 || d.Generation > 9007199254740991 || !readyText(d.LeaseUID) || !productDecisionID.MatchString(d.DecisionID) || !readyText(d.ExpectedRevision) || len(strings.TrimSpace(d.Reason)) < 1 || len(d.Reason) > 2000 || strings.ContainsAny(d.Reason, "\x00") {
		return d, "", errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	if !readyDigest.MatchString(d.ReadyDigest) || !readyDigest.MatchString(d.CandidateDigest) || !readyDigest.MatchString(d.ResultDigest) || !readyText(d.SourceRevision) {
		return d, "", errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	if d.Action != "accept" && d.Action != "extend" || d.Action == "accept" && d.ExtensionSeconds != nil || d.Action == "extend" && (d.ExtensionSeconds == nil || *d.ExtensionSeconds < 1 || *d.ExtensionSeconds > maximumDemoRetentionSeconds) {
		return d, "", errors.New("DEMO_PRODUCT_REQUEST_INVALID")
	}
	issued, ie := productUTC(d.IssuedAt)
	expires, ee := productUTC(d.ExpiresAt)
	if ie != nil || ee != nil || !expires.After(issued) || expires.Sub(issued) > 5*time.Minute {
		return d, "", errors.New("DEMO_PRODUCT_TIME_INVALID")
	}
	if _, e = time.Parse(time.RFC3339Nano, d.ExpectedExpiry); e != nil {
		return d, "", errors.New("DEMO_PRODUCT_TIME_INVALID")
	}
	digest := sha256.Sum256(raw)
	return d, "sha256:" + hex.EncodeToString(digest[:]), nil
}

func productRecords(item *lease) []interface{} {
	return interfaceSlice(objectValue(item.Status["demoProduct"])["decisions"])
}
func productReceipt(item *lease, decisionID, digest string) (map[string]interface{}, error) {
	for _, record := range productRecords(item) {
		r := objectValue(record)
		if r["decisionId"] == decisionID {
			if r["payloadDigest"] != digest {
				return nil, errors.New("DEMO_PRODUCT_REPLAY_CHANGED")
			}
			return r, nil
		}
	}
	return nil, nil
}
func productDeadline(item *lease, base time.Time) time.Time {
	state := objectValue(item.Status["demoProduct"])
	ready := objectValue(item.Status["demoReadiness"])
	if state["leaseUID"] != item.Metadata.UID || state["readyDigest"] != ready["requestDigest"] {
		return base
	}
	// List-map storage may reorder entries. Follow exact expiry links, not array order.
	original := base
	links := map[string]time.Time{}
	for _, record := range productRecords(item) {
		r := objectValue(record)
		if r["action"] != "extend" {
			continue
		}
		previous, e := time.Parse(time.RFC3339Nano, stringValue(r["previousExpiry"]))
		next, ne := time.Parse(time.RFC3339Nano, stringValue(r["expiresAt"]))
		if e != nil || ne != nil || !next.After(previous) {
			return original
		}
		key := previous.UTC().Format(time.RFC3339Nano)
		if _, exists := links[key]; exists {
			return original
		}
		links[key] = next
	}
	for len(links) > 0 {
		key := base.UTC().Format(time.RFC3339Nano)
		next, exists := links[key]
		if !exists {
			return original
		}
		delete(links, key)
		base = next
	}

	return base
}
func (c *controller) productSubject(ctx context.Context, item *lease) (map[string]interface{}, error) {
	s := objectValue(item.Status["demoReadiness"])
	if item.Metadata.DeletionTimestamp != "" || stringValue(item.Status["phase"]) != "Ready" || item.Metadata.Generation != int64(intValue(s["exposureGeneration"], 0)) || !time.Now().Before(c.expiresAt(item)) {
		return nil, errors.New("DEMO_PRODUCT_NOT_CURRENT")
	}
	if err := c.verifyCommittedReady(ctx, item); err != nil {
		return nil, errors.New("DEMO_PRODUCT_NOT_CURRENT")
	}
	return map[string]interface{}{"leaseName": item.Metadata.Name, "leaseUID": item.Metadata.UID, "sourceRevision": s["sourceRevision"], "candidateDigest": s["candidateDigest"], "resultDigest": s["resultDigest"], "readyDigest": s["requestDigest"], "generation": item.Metadata.Generation, "expectedExpiry": c.expiresAt(item).UTC().Format(time.RFC3339Nano), "expectedRevision": item.Metadata.ResourceVersion, "url": s["url"], "runId": s["runId"]}, nil
}
func (c *controller) commitProduct(ctx context.Context, envelope productEnvelope) (map[string]interface{}, error) {
	d, digest, err := c.verifyProduct(envelope)
	if err != nil {
		return nil, err
	}
	var item lease
	if err = c.kube(ctx, http.MethodGet, c.leasePath(d.LeaseName), nil, "application/json", &item); err != nil {
		return nil, errors.New("DEMO_PRODUCT_LEASE_UNAVAILABLE")
	}
	if item.Metadata.UID != d.LeaseUID {
		return nil, errors.New("DEMO_PRODUCT_NOT_CURRENT")
	}
	if receipt, e := productReceipt(&item, d.DecisionID, digest); e != nil || receipt != nil {
		return receipt, e
	}
	issued, _ := productUTC(d.IssuedAt)
	expires, _ := productUTC(d.ExpiresAt)
	now := time.Now().UTC()
	if now.Before(issued) || !now.Before(expires) {
		return nil, errors.New("DEMO_PRODUCT_DECISION_EXPIRED")
	}
	subject, err := c.productSubject(ctx, &item)
	if err != nil {
		return nil, err
	}
	if subject["readyDigest"] != d.ReadyDigest || subject["sourceRevision"] != d.SourceRevision || subject["candidateDigest"] != d.CandidateDigest || subject["resultDigest"] != d.ResultDigest || item.Metadata.Generation != d.Generation || subject["expectedExpiry"] != d.ExpectedExpiry || item.Metadata.ResourceVersion != d.ExpectedRevision {
		return nil, errors.New("DEMO_PRODUCT_SUBJECT_CHANGED")
	}
	records := productRecords(&item)
	if len(records) >= productMaxDecisions {
		return nil, errors.New("DEMO_PRODUCT_HISTORY_FULL")
	}
	next := c.expiresAt(&item)
	state := "accepted"
	if d.Action == "extend" {
		next, err = demoRetentionDeadline(next, *d.ExtensionSeconds)
		if err != nil {
			return nil, errors.New("DEMO_PRODUCT_EXTENSION_INVALID")
		}
		state = "extended"
	}
	receipt := map[string]interface{}{"schemaVersion": "demo-product-decision-receipt.v1", "decisionId": d.DecisionID, "payloadDigest": digest, "action": d.Action, "leaseName": d.LeaseName, "leaseUID": d.LeaseUID, "readyDigest": d.ReadyDigest, "generation": d.Generation, "actorId": d.ActorID, "issuer": d.Issuer, "appliedAt": now.Format(time.RFC3339Nano), "previousExpiry": d.ExpectedExpiry, "expiresAt": next.Format(time.RFC3339Nano), "state": state, "envelope": map[string]interface{}{"schemaVersion": envelope.SchemaVersion, "payload": envelope.Payload, "signature": envelope.Signature}}
	records = append(records, receipt)
	product := map[string]interface{}{"leaseUID": d.LeaseUID, "readyDigest": d.ReadyDigest, "decisions": records}
	if !time.Now().Before(expires) || !time.Now().Before(c.expiresAt(&item)) {
		return nil, errors.New("DEMO_PRODUCT_DECISION_EXPIRED")
	}
	patch := map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": d.ExpectedRevision}, "status": map[string]interface{}{"demoProduct": product, "expiresAt": next.Format(time.RFC3339Nano)}}
	err = c.kube(ctx, http.MethodPatch, c.statusPath(d.LeaseName), patch, "application/merge-patch+json", nil)
	if err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == 409 {
			return nil, errors.New("DEMO_PRODUCT_VERSION_CONFLICT")
		}
		return nil, errors.New("DEMO_PRODUCT_COMMIT_UNCERTAIN")
	}
	var persisted lease
	if c.kube(ctx, http.MethodGet, c.leasePath(d.LeaseName), nil, "application/json", &persisted) != nil || persisted.Metadata.UID != d.LeaseUID {
		return nil, errors.New("DEMO_PRODUCT_COMMIT_UNCERTAIN")
	}
	actual, e := productReceipt(&persisted, d.DecisionID, digest)
	if e != nil || actual == nil {
		return nil, errors.New("DEMO_PRODUCT_COMMIT_UNCERTAIN")
	}
	a, _ := json.Marshal(actual)
	b, _ := json.Marshal(receipt)
	if !bytes.Equal(a, b) {
		return nil, errors.New("DEMO_PRODUCT_COMMIT_UNCERTAIN")
	}
	return actual, nil
}

func (c *controller) productHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if c.product == nil || r.Method != http.MethodPost || (r.URL.Path != "/v1/demo-product/subjects" && r.URL.Path != "/v1/demo-product/decisions" && r.URL.Path != "/v1/demo-product/status") {
		http.Error(w, "DEMO_PRODUCT_DISABLED_OR_ROUTE_INVALID", 404)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if c.authenticateTransport(ctx, r.Header.Get("Authorization"), &readinessConfig{Audience: c.product.Audience, Producer: c.product.Producer}) != nil {
		http.Error(w, "DEMO_PRODUCT_UNAUTHORIZED", 401)
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16384))
	if err != nil {
		http.Error(w, "DEMO_PRODUCT_REQUEST_INVALID", 400)
		return
	}
	var result interface{}
	switch r.URL.Path {
	case "/v1/demo-product/decisions":
		var envelope productEnvelope
		if err = productJSON(raw, &envelope); err == nil {
			result, err = c.commitProduct(ctx, envelope)
		}
	case "/v1/demo-product/subjects":
		var input struct {
			SchemaVersion string `json:"schemaVersion"`
			LeaseName     string `json:"leaseName,omitempty"`
		}
		err = productJSON(raw, &input)
		if err == nil && (input.SchemaVersion != "demo-product-subject-request.v1" || input.LeaseName != "" && !readyName.MatchString(input.LeaseName)) {
			err = errors.New("DEMO_PRODUCT_REQUEST_INVALID")
		}
		if err == nil {
			var list leaseList
			if input.LeaseName != "" {
				var item lease
				err = c.kube(ctx, http.MethodGet, c.leasePath(input.LeaseName), nil, "application/json", &item)
				list.Items = []lease{item}
			} else {
				err = c.kube(ctx, http.MethodGet, c.leasePath(""), nil, "application/json", &list)
			}
			subjects := []map[string]interface{}{}
			if err == nil {
				for i := range list.Items {
					subject, e := c.productSubject(ctx, &list.Items[i])
					if e == nil {
						subjects = append(subjects, subject)
					} else if input.LeaseName != "" {
						err = e
					}
				}
			}
			result = map[string]interface{}{"schemaVersion": "demo-product-subjects.v1", "subjects": subjects}
		}
	case "/v1/demo-product/status":
		var input struct {
			SchemaVersion string `json:"schemaVersion"`
			DecisionID    string `json:"decisionId"`
			LeaseName     string `json:"leaseName"`
			LeaseUID      string `json:"leaseUID"`
			PayloadDigest string `json:"payloadDigest"`
		}
		err = productJSON(raw, &input)
		if err == nil && (input.SchemaVersion != "demo-product-status-request.v1" || !readyName.MatchString(input.LeaseName) || !readyText(input.LeaseUID) || !productDecisionID.MatchString(input.DecisionID) || !readyDigest.MatchString(input.PayloadDigest)) {
			err = errors.New("DEMO_PRODUCT_REQUEST_INVALID")
		}
		if err == nil {
			var item lease
			err = c.kube(ctx, http.MethodGet, c.leasePath(input.LeaseName), nil, "application/json", &item)
			if err == nil {
				if item.Metadata.UID != input.LeaseUID {
					err = errors.New("DEMO_PRODUCT_NOT_CURRENT")
				} else {
					var receipt map[string]interface{}
					receipt, err = productReceipt(&item, input.DecisionID, input.PayloadDigest)
					result = receipt
					if receipt == nil && err == nil {
						err = errors.New("DEMO_PRODUCT_DECISION_NOT_FOUND")
					}
				}
			}
		}
	}
	if err != nil {
		code := err.Error()
		if !strings.HasPrefix(code, "DEMO_PRODUCT_") {
			code = "DEMO_PRODUCT_EVIDENCE_UNAVAILABLE"
		}
		http.Error(w, code, 409)
		return
	}
	_ = json.NewEncoder(w).Encode(result)
}
