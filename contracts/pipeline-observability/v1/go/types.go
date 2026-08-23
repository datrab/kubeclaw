package observabilityv1

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"time"
	"unicode/utf8"

	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

const maxSafeInteger int64 = 9007199254740991

var idPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]*$`)
var timePattern = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$`)
var digestPattern = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)

func validID(value string) bool {
	return len(value) >= 1 && len(value) <= 256 && idPattern.MatchString(value)
}

func validTime(value string) bool {
	if !timePattern.MatchString(value) {
		return false
	}
	_, err := time.Parse(time.RFC3339, value)
	return err == nil
}

func decodeStrict[T any](raw []byte, value *T) error {
	if !utf8.Valid(raw) {
		return fmt.Errorf("wire JSON is not valid UTF-8")
	}
	canonical, err := jsoncanonicalizer.Transform(raw)
	if err != nil {
		return err
	}
	if !bytes.Equal(canonical, raw) {
		return fmt.Errorf("wire JSON is not RFC 8785 canonical")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(value); err != nil {
		return err
	}
	var trailing any
	if err = decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("wire JSON has trailing values")
		}
		return err
	}
	return nil
}

func requireFields(raw []byte, keys []string, nullable map[string]bool) error {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return err
	}
	for _, key := range keys {
		value, present := object[key]
		if !present {
			return fmt.Errorf("missing required field %s", key)
		}
		if !nullable[key] && bytes.Equal(value, []byte("null")) {
			return fmt.Errorf("required field %s is null", key)
		}
	}
	return nil
}

type ProducerIdentityV1 struct {
	ProducerID   string `json:"producerId"`
	BootID       string `json:"bootId"`
	ProducerType string `json:"producerType"`
}
type ProducerCorrelationV1 struct {
	PipelineRunID   string  `json:"pipelineRunId"`
	ModuleID        *string `json:"moduleId"`
	GateID          *string `json:"gateId"`
	AttemptID       *string `json:"attemptId"`
	ClaimID         *string `json:"claimId"`
	ClaimGeneration *int64  `json:"claimGeneration"`
	TraceID         *string `json:"traceId"`
	ParentEventID   *string `json:"parentEventId"`
}
type ProducerRecordV1 struct {
	SchemaVersion string                `json:"schemaVersion"`
	RecordID      string                `json:"recordId"`
	Producer      ProducerIdentityV1    `json:"producer"`
	Sequence      int64                 `json:"sequence"`
	RecordType    string                `json:"recordType"`
	OccurredAt    string                `json:"occurredAt"`
	Correlation   ProducerCorrelationV1 `json:"correlation"`
	Payload       any                   `json:"payload"`
	RecordDigest  string                `json:"recordDigest"`
}

type ProducerClosureV1 struct {
	SchemaVersion       string             `json:"schemaVersion"`
	ClosureID           string             `json:"closureId"`
	Producer            ProducerIdentityV1 `json:"producer"`
	PipelineRunID       string             `json:"pipelineRunId"`
	FirstSequence       int64              `json:"firstSequence"`
	FinalSequence       int64              `json:"finalSequence"`
	RecordCount         int64              `json:"recordCount"`
	RequiredEvidenceIDs []string           `json:"requiredEvidenceIds"`
	ClosedAt            string             `json:"closedAt"`
	ClosureDigest       string             `json:"closureDigest"`
}

type AdmissionAcknowledgementV1 struct {
	SchemaVersion   string             `json:"schemaVersion"`
	RecordID        string             `json:"recordId"`
	Producer        ProducerIdentityV1 `json:"producer"`
	PipelineRunID   string             `json:"pipelineRunId"`
	Sequence        int64              `json:"sequence"`
	State           string             `json:"state"`
	AdmittedAt      string             `json:"admittedAt"`
	CanonicalCursor int64              `json:"canonicalCursor"`
	RecordDigest    string             `json:"recordDigest"`
}
type ReplayRangeV1 struct {
	SchemaVersion string             `json:"schemaVersion"`
	Producer      ProducerIdentityV1 `json:"producer"`
	PipelineRunID string             `json:"pipelineRunId"`
	FromSequence  int64              `json:"fromSequence"`
	ToSequence    int64              `json:"toSequence"`
	RequestedAt   string             `json:"requestedAt"`
}
type ProducerGapReportV1 struct {
	SchemaVersion string             `json:"schemaVersion"`
	Producer      ProducerIdentityV1 `json:"producer"`
	PipelineRunID string             `json:"pipelineRunId"`
	FromSequence  int64              `json:"fromSequence"`
	ToSequence    int64              `json:"toSequence"`
	State         string             `json:"state"`
	ReportedAt    string             `json:"reportedAt"`
	ReasonCode    string             `json:"reasonCode"`
}
type UnresolvedObservabilityItemV1 struct {
	ItemID     string             `json:"itemId"`
	Kind       string             `json:"kind"`
	Producer   ProducerIdentityV1 `json:"producer"`
	SubjectID  string             `json:"subjectId"`
	ReasonCode string             `json:"reasonCode"`
}
type ObservabilityCompletenessV1 struct {
	SchemaVersion      string                          `json:"schemaVersion"`
	PipelineRunID      string                          `json:"pipelineRunId"`
	State              string                          `json:"state"`
	RequiredClosureIDs []string                        `json:"requiredClosureIds"`
	AdmittedClosureIDs []string                        `json:"admittedClosureIds"`
	MissingClosureIDs  []string                        `json:"missingClosureIds"`
	MissingRanges      []ProducerGapReportV1           `json:"missingRanges"`
	UnresolvedItems    []UnresolvedObservabilityItemV1 `json:"unresolvedItems"`
	EvaluatedAt        string                          `json:"evaluatedAt"`
}

func EncodeCanonical(value any) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return jsoncanonicalizer.Transform(raw)
}

func DecodeProducerRecordStrict(raw []byte) (ProducerRecordV1, error) {
	var value ProducerRecordV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "recordId", "producer", "sequence", "recordType", "occurredAt", "correlation", "payload", "recordDigest"}, map[string]bool{"payload": true})
	}
	if err == nil {
		var object map[string]json.RawMessage
		if err = json.Unmarshal(raw, &object); err == nil {
			var correlation map[string]json.RawMessage
			if err == nil {
				err = json.Unmarshal(object["correlation"], &correlation)
			}
			if err == nil {
				for _, key := range []string{"pipelineRunId", "moduleId", "gateId", "attemptId", "claimId", "claimGeneration", "traceId", "parentEventId"} {
					if _, present := correlation[key]; !present {
						err = fmt.Errorf("missing correlation field %s", key)
						break
					}
				}
			}
		}
	}
	if err == nil {
		err = ValidateProducerRecord(value)
	}
	return value, err
}
func DecodeProducerClosureStrict(raw []byte) (ProducerClosureV1, error) {
	var value ProducerClosureV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "closureId", "producer", "pipelineRunId", "firstSequence", "finalSequence", "recordCount", "requiredEvidenceIds", "closedAt", "closureDigest"}, nil)
	}
	if err == nil {
		err = ValidateProducerClosure(value)
	}
	return value, err
}
func DecodeAdmissionAcknowledgementStrict(raw []byte) (AdmissionAcknowledgementV1, error) {
	var value AdmissionAcknowledgementV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "recordId", "producer", "pipelineRunId", "sequence", "state", "admittedAt", "canonicalCursor", "recordDigest"}, nil)
	}
	if err == nil {
		err = ValidateAdmissionAcknowledgement(value)
	}
	return value, err
}
func DecodeReplayRangeStrict(raw []byte) (ReplayRangeV1, error) {
	var value ReplayRangeV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "producer", "pipelineRunId", "fromSequence", "toSequence", "requestedAt"}, nil)
	}
	if err == nil {
		err = ValidateReplayRange(value)
	}
	return value, err
}
func DecodeGapReportStrict(raw []byte) (ProducerGapReportV1, error) {
	var value ProducerGapReportV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "producer", "pipelineRunId", "fromSequence", "toSequence", "state", "reportedAt", "reasonCode"}, nil)
	}
	if err == nil {
		err = ValidateGapReport(value)
	}
	return value, err
}
func DecodeObservabilityCompletenessStrict(raw []byte) (ObservabilityCompletenessV1, error) {
	var value ObservabilityCompletenessV1
	err := decodeStrict(raw, &value)
	if err == nil {
		err = requireFields(raw, []string{"schemaVersion", "pipelineRunId", "state", "requiredClosureIds", "admittedClosureIds", "missingClosureIds", "missingRanges", "unresolvedItems", "evaluatedAt"}, nil)
	}
	if err == nil {
		err = ValidateObservabilityCompleteness(value)
	}
	return value, err
}

func validProducer(producer ProducerIdentityV1) bool {
	return validID(producer.ProducerID) && validID(producer.BootID) && validID(producer.ProducerType)
}
func validRange(from, to int64) bool { return from >= 1 && to >= from && to <= maxSafeInteger }
func validUniqueIDs(values []string) bool {
	if values == nil || len(values) > 10000 {
		return false
	}
	seen := make(map[string]struct{}, len(values))
	for _, id := range values {
		if !validID(id) {
			return false
		}
		if _, ok := seen[id]; ok {
			return false
		}
		seen[id] = struct{}{}
	}
	return true
}

func ValidateAdmissionAcknowledgement(value AdmissionAcknowledgementV1) error {
	if value.SchemaVersion != "admission-acknowledgement.v1" || !validID(value.RecordID) || !validProducer(value.Producer) || !validID(value.PipelineRunID) || value.Sequence < 1 || value.Sequence > maxSafeInteger || (value.State != "admitted" && value.State != "duplicate") || !validTime(value.AdmittedAt) || value.CanonicalCursor < 1 || value.CanonicalCursor > maxSafeInteger || !digestPattern.MatchString(value.RecordDigest) {
		return fmt.Errorf("invalid admission acknowledgement")
	}
	return nil
}
func ValidateReplayRange(value ReplayRangeV1) error {
	if value.SchemaVersion != "replay-range.v1" || !validProducer(value.Producer) || !validID(value.PipelineRunID) || !validRange(value.FromSequence, value.ToSequence) || !validTime(value.RequestedAt) {
		return fmt.Errorf("invalid replay range")
	}
	return nil
}
func ValidateGapReport(value ProducerGapReportV1) error {
	if value.SchemaVersion != "producer-gap-report.v1" || !validProducer(value.Producer) || !validID(value.PipelineRunID) || !validRange(value.FromSequence, value.ToSequence) || (value.State != "missing" && value.State != "unavailable" && value.State != "restored") || !validTime(value.ReportedAt) || !validID(value.ReasonCode) {
		return fmt.Errorf("invalid gap report")
	}
	return nil
}
func ValidateObservabilityCompleteness(value ObservabilityCompletenessV1) error {
	if value.SchemaVersion != "observability-completeness.v1" || !validID(value.PipelineRunID) || (value.State != "complete" && value.State != "partial" && value.State != "degraded" && value.State != "unknown") || !validUniqueIDs(value.RequiredClosureIDs) || !validUniqueIDs(value.AdmittedClosureIDs) || !validUniqueIDs(value.MissingClosureIDs) || value.UnresolvedItems == nil || len(value.UnresolvedItems) > 10000 || value.MissingRanges == nil || len(value.MissingRanges) > 10000 || !validTime(value.EvaluatedAt) {
		return fmt.Errorf("invalid completeness")
	}
	required := make(map[string]struct{}, len(value.RequiredClosureIDs))
	for _, id := range value.RequiredClosureIDs {
		required[id] = struct{}{}
	}
	admitted := make(map[string]struct{}, len(value.AdmittedClosureIDs))
	for _, id := range value.AdmittedClosureIDs {
		if _, ok := required[id]; !ok {
			return fmt.Errorf("admitted closure is not required")
		}
		admitted[id] = struct{}{}
	}
	missing := make(map[string]struct{}, len(value.MissingClosureIDs))
	for _, id := range value.MissingClosureIDs {
		if _, ok := required[id]; !ok {
			return fmt.Errorf("missing closure is not required")
		}
		missing[id] = struct{}{}
	}
	for _, id := range value.RequiredClosureIDs {
		_, a := admitted[id]
		_, m := missing[id]
		if a == m {
			return fmt.Errorf("required closure must be exactly admitted or missing")
		}
	}
	for _, gap := range value.MissingRanges {
		if err := ValidateGapReport(gap); err != nil {
			return err
		}
		if gap.PipelineRunID != value.PipelineRunID {
			return fmt.Errorf("gap belongs to another run")
		}
		if gap.State == "restored" {
			return fmt.Errorf("restored range is not missing")
		}
	}
	seenItems := make(map[string]struct{}, len(value.UnresolvedItems))
	for _, item := range value.UnresolvedItems {
		if !validID(item.ItemID) || !validProducer(item.Producer) || !validID(item.SubjectID) || !validID(item.ReasonCode) || (item.Kind != "missing-closure" && item.Kind != "missing-evidence" && item.Kind != "quarantined-record") {
			return fmt.Errorf("invalid unresolved item")
		}
		if _, ok := seenItems[item.ItemID]; ok {
			return fmt.Errorf("duplicate unresolved item")
		}
		seenItems[item.ItemID] = struct{}{}
	}
	for _, id := range value.MissingClosureIDs {
		found := false
		for _, item := range value.UnresolvedItems {
			if item.Kind == "missing-closure" && item.SubjectID == id {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("missing closure has no attributed item")
		}
	}
	hasCause := len(value.MissingClosureIDs) > 0 || len(value.MissingRanges) > 0 || len(value.UnresolvedItems) > 0
	if value.State == "complete" && hasCause {
		return fmt.Errorf("complete state has unresolved observability")
	}
	if value.State != "complete" && !hasCause {
		return fmt.Errorf("non-complete state has no observability cause")
	}
	return nil
}

func ProducerRecordDigest(record ProducerRecordV1) (string, error) {
	record.RecordDigest = ""
	value, err := json.Marshal(record)
	if err != nil {
		return "", err
	}
	var unsigned map[string]any
	if err = json.Unmarshal(value, &unsigned); err != nil {
		return "", err
	}
	delete(unsigned, "recordDigest")
	value, err = json.Marshal(unsigned)
	if err != nil {
		return "", err
	}
	canonical, err := jsoncanonicalizer.Transform(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func ValidateProducerRecord(record ProducerRecordV1) error {
	if record.SchemaVersion != "producer-record.v1" {
		return fmt.Errorf("invalid schemaVersion")
	}
	if !validID(record.RecordID) || !validProducer(record.Producer) || !validID(record.RecordType) || !validID(record.Correlation.PipelineRunID) {
		return fmt.Errorf("invalid required identifier")
	}
	if record.Sequence < 1 || record.Sequence > maxSafeInteger {
		return fmt.Errorf("sequence outside the shared safe range")
	}
	if !validTime(record.OccurredAt) {
		return fmt.Errorf("invalid occurredAt")
	}
	optionalIDs := []*string{record.Correlation.ModuleID, record.Correlation.GateID, record.Correlation.AttemptID, record.Correlation.ClaimID, record.Correlation.TraceID, record.Correlation.ParentEventID}
	for _, value := range optionalIDs {
		if value != nil && !validID(*value) {
			return fmt.Errorf("invalid optional identifier")
		}
	}
	if record.Correlation.ClaimGeneration != nil && (*record.Correlation.ClaimGeneration < 1 || *record.Correlation.ClaimGeneration > maxSafeInteger) {
		return fmt.Errorf("claimGeneration outside the shared safe range")
	}
	digest, err := ProducerRecordDigest(record)
	if err != nil {
		return err
	}
	if digest != record.RecordDigest {
		return fmt.Errorf("recordDigest does not match immutable record")
	}
	return nil
}

func ValidateProducerRecordDigest(record ProducerRecordV1) error {
	return ValidateProducerRecord(record)
}

func ProducerClosureDigest(closure ProducerClosureV1) (string, error) {
	closure.ClosureDigest = ""
	value, err := json.Marshal(closure)
	if err != nil {
		return "", err
	}
	var unsigned map[string]any
	if err = json.Unmarshal(value, &unsigned); err != nil {
		return "", err
	}
	delete(unsigned, "closureDigest")
	value, err = json.Marshal(unsigned)
	if err != nil {
		return "", err
	}
	canonical, err := jsoncanonicalizer.Transform(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func ValidateProducerClosure(closure ProducerClosureV1) error {
	if closure.SchemaVersion != "producer-closure.v1" {
		return fmt.Errorf("invalid schemaVersion")
	}
	if !validID(closure.ClosureID) || !validProducer(closure.Producer) || !validID(closure.PipelineRunID) {
		return fmt.Errorf("invalid required identifier")
	}
	if !validTime(closure.ClosedAt) {
		return fmt.Errorf("invalid closedAt")
	}
	if closure.RecordCount < 0 || closure.RecordCount > maxSafeInteger || closure.FirstSequence < 0 || closure.FinalSequence < 0 || closure.FirstSequence > maxSafeInteger || closure.FinalSequence > maxSafeInteger {
		return fmt.Errorf("closure range outside the shared safe range")
	}
	if closure.RecordCount == 0 {
		if closure.FirstSequence != 0 || closure.FinalSequence != 0 {
			return fmt.Errorf("empty closure must use a zero range")
		}
	} else if closure.FirstSequence != 1 || closure.FinalSequence != closure.RecordCount || closure.FinalSequence > maxSafeInteger {
		return fmt.Errorf("closure must describe a safe contiguous range that starts at one")
	}
	if !validUniqueIDs(closure.RequiredEvidenceIDs) {
		return fmt.Errorf("invalid evidence identifiers")
	}
	digest, err := ProducerClosureDigest(closure)
	if err != nil {
		return err
	}
	if digest != closure.ClosureDigest {
		return fmt.Errorf("closureDigest does not match immutable closure")
	}
	return nil
}

func ValidateProducerClosureDigest(closure ProducerClosureV1) error {
	return ValidateProducerClosure(closure)
}
