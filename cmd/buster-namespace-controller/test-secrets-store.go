package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"regexp"
	"time"
)

const fixtureSecretJournal = "buster-test-secrets-journal"

func fixtureSecretJournalName(intent map[string]interface{}) string {
	digest := stringValue(intent["digest"])
	if !regexp.MustCompile(`^sha256:[a-f0-9]{64}$`).MatchString(digest) {
		return ""
	}
	return fixtureSecretJournal + "-" + digest[7:39]
}

func fixtureSecretDigest(value interface{}) string {
	bytes, _ := json.Marshal(value)
	sum := sha256.Sum256(bytes)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Called only after generic test-secret admission and namespace ownership validation. Journal contains private material and
// must never be delivered to workloads, tool output, status or public artifacts.
func (c *controller) ensureFixtureSecret(ctx context.Context, item *lease, namespace string, request *fixtureSecretRequest) (map[string]interface{}, error) {
	live, err := c.fixtureSecretLease(ctx, item, namespace)
	if err != nil {
		return nil, err
	}
	documents, err := c.fixtureSecretJournal(ctx, live, namespace, request)
	if err != nil {
		return nil, err
	}
	for _, document := range documents {
		if err = c.ensureFixtureSecretChild(ctx, live, namespace, document); err != nil {
			return nil, err
		}
	}
	item.Status = live.Status
	return map[string]interface{}{"schemaVersion": "test-secrets.v1", "namespace": namespace, "secretCount": len(documents), "ready": true}, nil
}

func (c *controller) fixtureSecretLease(ctx context.Context, item *lease, namespace string) (*lease, error) {
	if item == nil || item.Metadata.UID == "" {
		return nil, errors.New("fixture secret lease identity missing")
	}
	var live lease
	if err := c.kube(ctx, http.MethodGet, c.statusPath(item.Metadata.Name), nil, "application/json", &live); err != nil {
		return nil, err
	}
	if live.Metadata.UID != item.Metadata.UID || live.Metadata.ResourceVersion == "" || live.Metadata.DeletionTimestamp != "" ||
		stringValue(live.Spec["namespaceName"]) != namespace || fixtureSecretDigest(live.Spec) != fixtureSecretDigest(item.Spec) || time.Now().After(c.expiresAt(&live)) {
		return nil, errors.New("fixture secret lease identity changed")
	}
	if err := c.verifyNamespaceOwnership(ctx, &live, namespace); err != nil {
		return nil, err
	}
	return &live, nil
}

func (c *controller) fixtureSecretStatus(ctx context.Context, item *lease, namespace, key string, value interface{}) error {
	live, err := c.fixtureSecretLease(ctx, item, namespace)
	if err != nil {
		return err
	}
	if key != "fixtureSecretIntent" && !reflect.DeepEqual(live.Status["fixtureSecretIntent"], item.Status["fixtureSecretIntent"]) {
		return errors.New("fixture secret intent changed concurrently")
	}
	if key == "fixtureSecretIntent" && (len(objectValue(live.Status["fixtureSecretSource"])) != 0 || len(objectValue(live.Status["fixtureSecretSecrets"])) != 0) {
		return errors.New("fixture secret source already committed")
	}
	if !reflect.DeepEqual(live.Status[key], item.Status[key]) {
		return errors.New("fixture secret status changed concurrently")
	}
	if reflect.DeepEqual(live.Status[key], value) {
		return nil
	}
	patch := map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": live.Metadata.ResourceVersion},
		"status": map[string]interface{}{key: value}}
	if err = c.kube(ctx, http.MethodPatch, c.statusPath(item.Metadata.Name), patch, "application/merge-patch+json", nil); err != nil {
		return err
	}
	if item.Status == nil {
		item.Status = map[string]interface{}{}
	}
	item.Status[key] = value
	return nil
}

func (c *controller) readFixtureSecretSecret(ctx context.Context, item *lease, namespace, name string) (map[string]interface{}, error) {
	var secret map[string]interface{}
	err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespace+"/secrets/"+name, nil, "application/json", &secret)
	if err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
			return nil, nil
		}
		return nil, errors.New("fixture secret Secret read failed")
	}
	meta := objectValue(secret["metadata"])
	annotations := stringMap(meta["annotations"])
	labels := stringMap(meta["labels"])
	if !boolValue(secret["immutable"]) || stringValue(meta["uid"]) == "" || stringValue(meta["resourceVersion"]) == "" ||
		stringValue(meta["name"]) != name || stringValue(meta["namespace"]) != namespace ||
		annotations["kubeclaw.forgestack.ai/bootstrap-profile"] != "test-secrets.v1" ||
		annotations["kubeclaw.forgestack.ai/bootstrap-lease-uid"] != item.Metadata.UID ||
		labels["kubeclaw/managed-by"] != "buster-namespace-controller" || labels["kubeclaw/buster-lease-uid"] != item.Metadata.UID {
		return nil, errors.New("fixture secret Secret ownership invalid")
	}
	return secret, nil
}

func fixtureSecretData(secret map[string]interface{}) (map[string]string, error) {
	values := map[string]string{}
	for key, value := range objectValue(secret["data"]) {
		bytes, err := base64.StdEncoding.Strict().DecodeString(stringValue(value))
		if err != nil || len(bytes) == 0 {
			return nil, errors.New("fixture secret Secret data invalid")
		}
		values[key] = string(bytes)
	}
	if len(values) == 0 {
		return nil, errors.New("fixture secret Secret data missing")
	}
	return values, nil
}

func (c *controller) createFixtureSecretSecret(ctx context.Context, item *lease, namespace, name string, document map[string]interface{}) (map[string]interface{}, error) {
	live, err := c.fixtureSecretLease(ctx, item, namespace)
	if err != nil {
		return nil, err
	}
	if !reflect.DeepEqual(live.Status["fixtureSecretIntent"], item.Status["fixtureSecretIntent"]) {
		return nil, errors.New("fixture secret intent changed before Secret creation")
	}
	// POST is attempted once. On uncertain response or conflict, read the actual
	// immutable object; never replay a write or overwrite/delete an existing object.
	_ = c.kube(ctx, http.MethodPost, "/api/v1/namespaces/"+namespace+"/secrets", document, "application/json", nil)
	actual, err := c.readFixtureSecretSecret(ctx, item, namespace, name)
	if err != nil {
		return nil, err
	}
	if actual == nil {
		return nil, errors.New("fixture secret creation unresolved; committed material missing")
	}
	return actual, nil
}

func (c *controller) fixtureSecretJournal(ctx context.Context, item *lease, namespace string, request *fixtureSecretRequest) ([]map[string]interface{}, error) {
	intent := objectValue(item.Status["fixtureSecretIntent"])
	name := fixtureSecretJournalName(intent)
	var stage map[string]interface{}
	var err error
	if len(intent) > 0 {
		if name == "" {
			return nil, errors.New("fixture secret intent digest invalid")
		}
		stage, err = c.readFixtureSecretSecret(ctx, item, namespace, name)
		if err != nil {
			return nil, err
		}
	}
	if stage == nil {
		if len(objectValue(item.Status["fixtureSecretSource"])) != 0 || len(objectValue(item.Status["fixtureSecretSecrets"])) != 0 {
			return nil, errors.New("fixture secret committed journal missing")
		}
		// An orphaned intent is recoverable only before any material was delivered.
		// Fresh CAS below also rejects a concurrently committed journal source.
		for name := range request.Secrets {
			child, readErr := c.readFixtureSecretSecret(ctx, item, namespace, name)
			if readErr != nil {
				return nil, readErr
			}
			if child != nil {
				return nil, errors.New("fixture secret orphaned intent has existing material")
			}
		}
		documents, err := fixtureSecretDocuments(item, namespace, request, time.Now())
		if err != nil {
			return nil, err
		}
		bytes, err := json.Marshal(documents)
		if err != nil {
			return nil, errors.New("fixture secret journal encoding failed")
		}
		intent = map[string]interface{}{"leaseUID": item.Metadata.UID, "namespace": namespace, "requestDigest": fixtureSecretDigest(request), "digest": fixtureSecretDigest(string(bytes))}
		if err = c.fixtureSecretStatus(ctx, item, namespace, "fixtureSecretIntent", intent); err != nil {
			return nil, err
		}
		name = fixtureSecretJournalName(intent)
		journal := map[string]interface{}{"apiVersion": "v1", "kind": "Secret", "type": "Opaque", "immutable": true,
			"metadata": map[string]interface{}{"name": name, "namespace": namespace, "labels": ownerLabels(item, namespace),
				"annotations": map[string]string{"kubeclaw.forgestack.ai/bootstrap-profile": "test-secrets.v1", "kubeclaw.forgestack.ai/bootstrap-lease-uid": item.Metadata.UID}},
			"stringData": map[string]string{"documents": string(bytes)}}
		stage, err = c.createFixtureSecretSecret(ctx, item, namespace, name, journal)
		if err != nil {
			return nil, err
		}
	}
	data, err := fixtureSecretData(stage)
	if err != nil {
		return nil, err
	}
	if len(data) != 1 || len(data["documents"]) > 65536 || stringValue(intent["leaseUID"]) != item.Metadata.UID ||
		stringValue(intent["namespace"]) != namespace || stringValue(intent["requestDigest"]) != fixtureSecretDigest(request) ||
		stringValue(intent["digest"]) != fixtureSecretDigest(data["documents"]) {
		return nil, errors.New("fixture secret journal intent mismatch")
	}
	source := map[string]interface{}{"name": name, "uid": objectValue(stage["metadata"])["uid"], "digest": intent["digest"]}
	prior := objectValue(item.Status["fixtureSecretSource"])
	if len(prior) > 0 && !reflect.DeepEqual(source, prior) {
		return nil, errors.New("fixture secret journal source changed")
	}
	if err = c.fixtureSecretStatus(ctx, item, namespace, "fixtureSecretSource", source); err != nil {
		return nil, err
	}
	var documents []map[string]interface{}
	if json.Unmarshal([]byte(data["documents"]), &documents) != nil || len(documents) != len(request.Secrets) {
		return nil, errors.New("fixture secret journal invalid")
	}
	return documents, nil
}

func (c *controller) ensureFixtureSecretChild(ctx context.Context, item *lease, namespace string, document map[string]interface{}) error {
	name := stringValue(objectValue(document["metadata"])["name"])
	expected := stringMap(document["stringData"])
	proofs := cloneObject(objectValue(item.Status["fixtureSecretSecrets"]))
	prior := objectValue(proofs[name])
	actual, err := c.readFixtureSecretSecret(ctx, item, namespace, name)
	if err != nil {
		return err
	}
	if actual == nil {
		if len(prior) > 0 {
			return errors.New("fixture secret recorded child missing")
		}
		actual, err = c.createFixtureSecretSecret(ctx, item, namespace, name, document)
		if err != nil {
			return err
		}
	}
	values, err := fixtureSecretData(actual)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(values, expected) {
		return errors.New("fixture secret child data mismatch")
	}
	proof := map[string]interface{}{"uid": objectValue(actual["metadata"])["uid"], "digest": fixtureSecretDigest(values)}
	if len(prior) > 0 && !reflect.DeepEqual(prior, proof) {
		return errors.New("fixture secret child source changed")
	}
	proofs[name] = proof
	return c.fixtureSecretStatus(ctx, item, namespace, "fixtureSecretSecrets", proofs)
}
