package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

func (c *controller) ensureTestCredentials(ctx context.Context, item *lease, namespaceName string) (map[string]interface{}, error) {
	request, err := c.credentialRequest(item)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return map[string]interface{}{"credentialsRef": nil, "credentialsAvailable": false}, nil
	}
	if request.Mode == "generate" {
		if item.Metadata.UID == "" {
			return nil, errors.New("generated credentials require a lease UID")
		}
		for _, copied := range stringSlice(item.Spec["secretsToCopy"]) {
			if copied == request.SecretName {
				return nil, errors.New("generated credentials cannot reuse a copied Secret")
			}
		}
	}
	if err := c.ensureCredentialAccess(ctx, namespaceName, request); err != nil {
		return nil, err
	}
	var credentialLease map[string]interface{}
	if request.Mode == "generate" {
		if err := c.kube(ctx, http.MethodGet, c.statusPath(item.Metadata.Name), nil, "application/json", &credentialLease); err != nil {
			return nil, err
		}
		meta := objectValue(credentialLease["metadata"])
		if stringValue(meta["uid"]) != item.Metadata.UID || stringValue(meta["resourceVersion"]) == "" {
			return nil, errors.New("credential lease identity is not established")
		}
		item.Status = objectValue(credentialLease["status"])
	}
	path := "/api/v1/namespaces/" + namespaceName + "/secrets/" + request.SecretName
	var secret map[string]interface{}
	err = c.kube(ctx, http.MethodGet, path, nil, "application/json", &secret)
	if err != nil {
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return nil, err
		}
		if request.Mode == "existing" {
			placeholder := map[string]interface{}{
				"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
				"metadata": map[string]interface{}{
					"name": request.SecretName, "namespace": namespaceName,
					"labels": mergeStringMaps(ownerLabels(item, namespaceName), map[string]string{"kubeclaw/user-deliverable": "true"}),
				},
			}
			if err := c.kube(ctx, http.MethodPost, "/api/v1/namespaces/"+namespaceName+"/secrets", placeholder, "application/json", nil); err != nil {
				return nil, err
			}
			return map[string]interface{}{"credentialsRef": "secret/" + request.SecretName, "credentialsAvailable": false}, nil
		}
		if len(objectValue(item.Status["generatedCredentialIntent"])) != 0 || len(objectValue(item.Status["generatedCredentials"])) != 0 {
			return nil, errors.New("generated credential creation is unresolved: committed source Secret is missing")
		}
		password := make([]byte, 24)
		if _, err := rand.Read(password); err != nil {
			return nil, fmt.Errorf("generate preview credential: %w", err)
		}
		values := map[string]string{"username": "preview", "password": base64.RawURLEncoding.EncodeToString(password)}
		intent := map[string]interface{}{"leaseUID": item.Metadata.UID, "namespace": namespaceName, "secretName": request.SecretName, "credentialDigest": demoCredentialDigest(values)}
		patch := map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": objectValue(credentialLease["metadata"])["resourceVersion"]}, "status": map[string]interface{}{"generatedCredentialIntent": intent}}
		if err := c.kube(ctx, http.MethodPatch, c.statusPath(item.Metadata.Name), patch, "application/merge-patch+json", nil); err != nil {
			return nil, err
		}
		item.Status["generatedCredentialIntent"] = intent
		manifest := map[string]interface{}{
			"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
			"immutable": true,
			"metadata": map[string]interface{}{
				"name": request.SecretName, "namespace": namespaceName,
				"labels":      mergeStringMaps(ownerLabels(item, namespaceName), map[string]string{"kubeclaw/user-deliverable": "true"}),
				"annotations": map[string]interface{}{"kubeclaw.forgestack.ai/generated-demo-credentials": "v1", "kubeclaw.forgestack.ai/credential-lease-uid": item.Metadata.UID},
			},
			"stringData": map[string]interface{}{
				"username": values["username"], "password": values["password"],
			},
		}
		if err := c.kube(ctx, http.MethodPost, "/api/v1/namespaces/"+namespaceName+"/secrets", manifest, "application/json", &secret); err != nil {
			return nil, err
		}
	}
	available, err := deliverableCredentialAvailable(secret, request)
	if err != nil {
		return nil, err
	}
	if !available {
		if request.Mode == "existing" {
			return map[string]interface{}{"credentialsRef": "secret/" + request.SecretName, "credentialsAvailable": false}, nil
		}
		return nil, fmt.Errorf("generated test credential Secret %s is incomplete", request.SecretName)
	}
	result := map[string]interface{}{"credentialsRef": "secret/" + request.SecretName, "credentialsAvailable": true}
	if request.Mode == "generate" {
		proof, err := generatedCredentialProof(item, namespaceName, request.SecretName, secret)
		if err != nil {
			return nil, err
		}
		result["generatedCredentials"] = proof
	}
	return result, nil
}

// Provenance is established from the actual immutable Secret and owning lease,
// never from user-deliverable labels or the presence of username/password keys.
func generatedCredentialProof(item *lease, namespace, name string, secret map[string]interface{}) (map[string]interface{}, error) {
	metadata := objectValue(secret["metadata"])
	annotations := objectValue(metadata["annotations"])
	labels := objectValue(metadata["labels"])
	uid, resourceVersion := stringValue(metadata["uid"]), stringValue(metadata["resourceVersion"])
	if item.Metadata.UID == "" || uid == "" || resourceVersion == "" || !boolValue(secret["immutable"]) ||
		stringValue(metadata["name"]) != name || stringValue(metadata["namespace"]) != namespace ||
		stringValue(annotations["kubeclaw.forgestack.ai/generated-demo-credentials"]) != "v1" ||
		stringValue(annotations["kubeclaw.forgestack.ai/credential-lease-uid"]) != item.Metadata.UID ||
		stringValue(labels["kubeclaw/managed-by"]) != "buster-namespace-controller" ||
		stringValue(labels["kubeclaw/buster-lease-uid"]) != item.Metadata.UID {
		return nil, errors.New("generated credential Secret provenance is not established")
	}
	values := map[string]string{}
	data := objectValue(secret["data"])
	if len(data) != 2 {
		return nil, errors.New("generated credential Secret must contain exactly two encoded keys")
	}
	for _, key := range []string{"username", "password"} {
		decoded, err := base64.StdEncoding.Strict().DecodeString(stringValue(data[key]))
		if err != nil || len(decoded) == 0 {
			return nil, errors.New("generated credential Secret data is invalid")
		}
		values[key] = string(decoded)
	}
	credentialDigest := demoCredentialDigest(values)
	intent := objectValue(item.Status["generatedCredentialIntent"])
	if stringValue(intent["leaseUID"]) != item.Metadata.UID || stringValue(intent["namespace"]) != namespace || stringValue(intent["secretName"]) != name || stringValue(intent["credentialDigest"]) != credentialDigest {
		return nil, errors.New("generated credential Secret does not match controller creation intent")
	}
	prior := objectValue(item.Status["generatedCredentials"])
	if len(prior) > 0 && (stringValue(prior["secretUID"]) != uid || stringValue(prior["leaseUID"]) != item.Metadata.UID || stringValue(prior["credentialDigest"]) != credentialDigest) {
		return nil, errors.New("generated credential Secret no longer matches the recorded source")
	}
	return map[string]interface{}{"schemaVersion": "generated-demo-credential-source.v1", "leaseUID": item.Metadata.UID,
		"secretUID": uid, "secretResourceVersion": resourceVersion, "namespace": namespace, "secretName": name,
		"credentialDigest": credentialDigest}, nil
}

func validateDeliverableCredentialSecret(secret map[string]interface{}, request *testCredentialRequest) error {
	available, err := deliverableCredentialAvailable(secret, request)
	if err != nil {
		return err
	}
	if !available {
		return fmt.Errorf("test credential Secret %s is missing a declared key", request.SecretName)
	}
	return nil
}

func deliverableCredentialAvailable(secret map[string]interface{}, request *testCredentialRequest) (bool, error) {
	allowed := map[string]bool{}
	for _, key := range request.Keys {
		allowed[key] = true
	}
	found := map[string]bool{}
	for _, field := range []string{"data", "stringData"} {
		for key, value := range objectValue(secret[field]) {
			if !allowed[key] {
				return false, fmt.Errorf("test credential Secret %s contains undeclared key %s", request.SecretName, key)
			}
			if stringValue(value) != "" {
				found[key] = true
			}
		}
	}
	for _, key := range request.Keys {
		if !found[key] {
			return false, nil
		}
	}
	return true, nil
}

func demoCredentialDigest(values map[string]string) string {
	encoded, _ := json.Marshal(values)
	digest := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(digest[:])
}
