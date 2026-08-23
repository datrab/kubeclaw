package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"

	observabilityv1 "kubeclaw.dev/pipeline-observability/go"
)

func main() {
	raw, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	record, err := observabilityv1.DecodeProducerRecordStrict(bytes.TrimSpace(raw))
	if err != nil {
		panic(err)
	}
	if _, err = observabilityv1.DecodeProducerRecordStrict(bytes.Replace(bytes.TrimSpace(raw), []byte(`"sequence":1`), []byte(`"sequence":1.0`), 1)); err == nil {
		panic("noncanonical number accepted")
	}
	if _, err = observabilityv1.DecodeProducerRecordStrict(bytes.Replace(bytes.TrimSpace(raw), []byte(`"<script>"`), []byte(`"\ud800"`), 1)); err == nil {
		panic("invalid Unicode accepted")
	}
	if _, err = observabilityv1.DecodeProducerRecordStrict(bytes.Replace(bytes.TrimSpace(raw), []byte(`,"parentEventId":null`), nil, 1)); err == nil {
		panic("omitted nullable correlation field accepted")
	}
	if _, err = observabilityv1.DecodeProducerRecordStrict(append(append([]byte{}, bytes.TrimSpace(raw)...), bytes.TrimSpace(raw)...)); err == nil {
		panic("trailing JSON document accepted")
	}
	if record.SchemaVersion != "producer-record.v1" || record.Sequence < 1 || record.RecordID == "" {
		panic("invalid producer record")
	}
	if err = observabilityv1.ValidateProducerRecord(record); err != nil {
		panic(err)
	}
	invalidRecord := record
	invalidRecord.Sequence = 0
	invalidRecord.RecordDigest, err = observabilityv1.ProducerRecordDigest(invalidRecord)
	if err != nil {
		panic(err)
	}
	if observabilityv1.ValidateProducerRecord(invalidRecord) == nil {
		panic("invalid record accepted")
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		panic(err)
	}
	var left, right any
	if json.Unmarshal(raw, &left) != nil || json.Unmarshal(encoded, &right) != nil || fmt.Sprint(left) != fmt.Sprint(right) {
		panic("fixture bytes do not represent the same JSON value")
	}
	canonical, err := observabilityv1.EncodeCanonical(record)
	if err != nil {
		panic(err)
	}
	if !bytes.Equal(canonical, bytes.TrimSpace(raw)) {
		panic("Go canonical encoder differs from record fixture")
	}
	closureRaw, err := os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}
	closure, err := observabilityv1.DecodeProducerClosureStrict(bytes.TrimSpace(closureRaw))
	if err != nil {
		panic(err)
	}
	if err = observabilityv1.ValidateProducerClosure(closure); err != nil {
		panic(err)
	}
	canonicalClosure, err := observabilityv1.EncodeCanonical(closure)
	if err != nil {
		panic(err)
	}
	if !bytes.Equal(canonicalClosure, bytes.TrimSpace(closureRaw)) {
		panic("Go canonical encoder differs from closure fixture")
	}
	invalidClosure := closure
	invalidClosure.FirstSequence = 2
	invalidClosure.FinalSequence = 2
	invalidClosure.RecordCount = 1
	invalidClosure.ClosureDigest, err = observabilityv1.ProducerClosureDigest(invalidClosure)
	if err != nil {
		panic(err)
	}
	if observabilityv1.ValidateProducerClosure(invalidClosure) == nil {
		panic("invalid closure accepted")
	}
	complete := observabilityv1.ObservabilityCompletenessV1{SchemaVersion: "observability-completeness.v1", PipelineRunID: "run:1", State: "complete", RequiredClosureIDs: []string{"closure:1"}, AdmittedClosureIDs: []string{"closure:1"}, MissingClosureIDs: []string{}, MissingRanges: []observabilityv1.ProducerGapReportV1{}, UnresolvedItems: []observabilityv1.UnresolvedObservabilityItemV1{}, EvaluatedAt: "2026-08-09T12:03:00Z"}
	if err = observabilityv1.ValidateObservabilityCompleteness(complete); err != nil {
		panic(err)
	}
	complete.MissingClosureIDs = []string{"closure:1"}
	if observabilityv1.ValidateObservabilityCompleteness(complete) == nil {
		panic("incomplete run accepted as complete")
	}
	fmt.Println("ok")
}
