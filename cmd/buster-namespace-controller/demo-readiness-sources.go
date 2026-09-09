package main

import (
	"context"
	"errors"
	"net/http"
	"time"
)

func (c *controller) verifyReadyNamespace(ctx context.Context, item *lease, namespace string) error {
	if namespace == "" || !c.hasAllowedPrefix(namespace) {
		return errors.New("DEMO_READY_NAMESPACE_CHANGED")
	}
	var current map[string]interface{}
	if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespace, nil, "application/json", &current); err != nil {
		return errors.New("DEMO_READY_NAMESPACE_UNAVAILABLE")
	}
	meta := objectValue(current["metadata"])
	if stringValue(meta["deletionTimestamp"]) != "" || stringValue(meta["uid"]) == "" || stringValue(meta["resourceVersion"]) == "" {
		return errors.New("DEMO_READY_NAMESPACE_TERMINATING")
	}
	if err := verifyNamespaceLabels(item, namespace, current); err != nil {
		return errors.New("DEMO_READY_NAMESPACE_CHANGED")
	}
	return nil
}

func (c *controller) verifyReadyIngress(ctx context.Context, item *lease, namespace, url string) error {
	exposure, err := previewExposureSpec(item, namespace)
	if err != nil || exposure == nil {
		return errors.New("DEMO_READY_EXPOSURE_CHANGED")
	}
	var ingress map[string]interface{}
	if err = c.kube(ctx, http.MethodGet, "/apis/networking.k8s.io/v1/namespaces/"+namespace+"/ingresses/"+exposure.IngressName, nil, "application/json", &ingress); err != nil {
		return errors.New("DEMO_READY_EXPOSURE_UNAVAILABLE")
	}
	meta := objectValue(ingress["metadata"])
	if stringValue(meta["deletionTimestamp"]) != "" || stringValue(meta["uid"]) == "" || stringValue(meta["resourceVersion"]) == "" {
		return errors.New("DEMO_READY_EXPOSURE_TERMINATING")
	}
	if err = authorizedExposureIngress(item, namespace, ingress); err != nil {
		return errors.New("DEMO_READY_EXPOSURE_OWNER_CHANGED")
	}
	// The live ingress must route the exact tested Service/port/path, not merely
	// retain a stale hostname in status after a changed route.
	desired := previewIngress(item, namespace, exposure)
	if fullLeaseSpecDigest(objectValue(ingress["spec"])) != fullLeaseSpecDigest(objectValue(desired["spec"])) || ingressPreviewURL(ingress, exposure) != url {
		return errors.New("DEMO_READY_EXPOSURE_CHANGED")
	}
	return nil
}

func (c *controller) verifyCommittedReady(ctx context.Context, item *lease) error {
	s := objectValue(item.Status["demoReadiness"])
	namespace := stringValue(s["namespace"])
	if namespace == "" || item.Spec["namespaceName"] != namespace || item.Status["namespaceName"] != namespace || item.Spec["verifiedImage"] != s["immutableImage"] || item.Spec["manifestDigest"] != s["manifestDigest"] || item.Metadata.UID != s["leaseUID"] {
		return errors.New("DEMO_READY_SOURCE_CHANGED")
	}
	if err := c.verifyReadyNamespace(ctx, item, namespace); err != nil {
		return err
	}
	if err := c.verifyReadyIngress(ctx, item, namespace, stringValue(s["url"])); err != nil {
		return err
	}
	if err := c.verifyReadySecret(ctx, item, namespace, stringValue(s["secretUID"]), stringValue(s["credentialDigest"])); err != nil {
		return err
	}
	var current lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &current); err != nil {
		return errors.New("DEMO_READY_LEASE_NOT_CURRENT")
	}
	if current.Metadata.UID != item.Metadata.UID || current.Metadata.ResourceVersion != item.Metadata.ResourceVersion || current.Metadata.DeletionTimestamp != "" || stringValue(current.Status["phase"]) != "Ready" {
		return errors.New("DEMO_READY_LEASE_NOT_CURRENT")
	}
	if !time.Now().Before(c.expiresAt(&current)) {
		return errors.New("DEMO_READY_EXPIRED")
	}
	if len(objectValue(current.Status["exposureMutation"])) > 0 {
		return errors.New("DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED")
	}
	return nil
}

func (c *controller) verifyReadySecret(ctx context.Context, item *lease, namespace, uid, digest string) error {
	name := stringValue(objectValue(item.Status["generatedCredentials"])["secretName"])
	if !readyName.MatchString(name) {
		return errors.New("DEMO_READY_CREDENTIALS_INVALID")
	}
	var secret map[string]interface{}
	if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespace+"/secrets/"+name, nil, "application/json", &secret); err != nil {
		return errors.New("DEMO_READY_CREDENTIALS_UNAVAILABLE")
	}
	if stringValue(objectValue(secret["metadata"])["deletionTimestamp"]) != "" {
		return errors.New("DEMO_READY_CREDENTIALS_TERMINATING")
	}
	actual, err := generatedCredentialProof(item, namespace, name, secret)
	if err != nil || actual["secretUID"] != uid || actual["credentialDigest"] != digest {
		return errors.New("DEMO_READY_CREDENTIALS_CHANGED")
	}
	return nil
}

func readyErrorCode(err error) string {
	// Only fixed application codes escape; API server bodies and credentials do not.
	codes := []string{"DEMO_READY_REQUEST_INVALID", "DEMO_READY_RECEIPT_CONFLICT", "DEMO_READY_NOT_CURRENT", "DEMO_READY_LEASE_NOT_CURRENT", "DEMO_READY_REPLAY_CHANGED", "DEMO_READY_OBSERVATION_STALE", "DEMO_READY_EXPIRED", "DEMO_READY_SOURCE_CHANGED", "DEMO_READY_HANDOFF_INVALID", "DEMO_READY_NAMESPACE_CHANGED", "DEMO_READY_NAMESPACE_UNAVAILABLE", "DEMO_READY_NAMESPACE_TERMINATING", "DEMO_READY_EXPOSURE_CHANGED", "DEMO_READY_EXPOSURE_UNAVAILABLE", "DEMO_READY_EXPOSURE_TERMINATING", "DEMO_READY_EXPOSURE_OWNER_CHANGED", "DEMO_READY_CREDENTIALS_INVALID", "DEMO_READY_CREDENTIALS_UNAVAILABLE", "DEMO_READY_CREDENTIALS_TERMINATING", "DEMO_READY_CREDENTIALS_CHANGED", "DEMO_READY_VERSION_CONFLICT", "DEMO_READY_COMMIT_UNCERTAIN", "DEMO_READY_LEASE_DELETING", "DEMO_READY_EXPOSURE_OPERATION_UNRESOLVED"}
	if contains(codes, err.Error()) {
		return err.Error()
	}
	return "DEMO_READY_EVIDENCE_UNAVAILABLE"
}
