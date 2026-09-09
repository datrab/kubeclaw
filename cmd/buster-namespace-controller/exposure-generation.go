package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

const exposureOwnerAnnotation = "kubeclaw.forgestack.ai/exposure-owner"
const exposurePredecessorsAnnotation = "kubeclaw.forgestack.ai/exposure-predecessors"

func exposureStatus(item *lease, status map[string]interface{}) map[string]interface{} {
	status["exposureOwner"] = item.Metadata.Annotations[exposureOwnerAnnotation]
	status["exposureGeneration"] = item.Metadata.Generation
	return status
}

func (c *controller) assertExposureCurrent(ctx context.Context, item *lease) error {
	var current lease
	if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &current); err != nil {
		return err
	}
	if current.Metadata.UID != item.Metadata.UID || current.Metadata.Generation != item.Metadata.Generation ||
		current.Metadata.Annotations[exposureOwnerAnnotation] != item.Metadata.Annotations[exposureOwnerAnnotation] ||
		current.Metadata.Annotations[exposurePredecessorsAnnotation] != item.Metadata.Annotations[exposurePredecessorsAnnotation] {
		return errors.New("exposure lease generation has changed")
	}
	return nil
}

func (c *controller) ensureOwnedExposure(ctx context.Context, item *lease, namespace string, exposure *previewExposure, out interface{}) error {
	base := "/apis/networking.k8s.io/v1/namespaces/" + namespace + "/ingresses"
	resource := base + "/" + exposure.IngressName
	var existing map[string]interface{}
	err := c.kube(ctx, http.MethodGet, resource, nil, "application/json", &existing)
	var apiErr *apiError
	absent := errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound
	if err != nil && !absent {
		return err
	}
	if err := c.assertExposureCurrent(ctx, item); err != nil {
		return err
	}
	desired := previewIngress(item, namespace, exposure)
	if absent {
		return c.kube(ctx, http.MethodPost, base, desired, "application/json", out)
	}
	metadata := objectValue(existing["metadata"])
	if err := authorizedExposureIngress(item, namespace, existing); err != nil {
		return err
	}
	version := stringValue(metadata["resourceVersion"])
	if version == "" {
		return errors.New("exposure ingress resource version is missing")
	}
	objectValue(desired["metadata"])["resourceVersion"] = version
	return c.kube(ctx, http.MethodPatch, resource, desired, "application/merge-patch+json", out)
}

// Current intent may retire only its own ingress or an explicitly transferred predecessor.
func (c *controller) deleteOwnedExposure(ctx context.Context, item *lease, namespace, name string) error {
	resource := "/apis/networking.k8s.io/v1/namespaces/" + namespace + "/ingresses/" + name
	var ingress map[string]interface{}
	if err := c.kube(ctx, http.MethodGet, resource, nil, "application/json", &ingress); err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
			return nil
		}
		return err
	}
	metadata := objectValue(ingress["metadata"])
	if err := authorizedExposureIngress(item, namespace, ingress); err != nil {
		return err
	}
	uid, version := stringValue(metadata["uid"]), stringValue(metadata["resourceVersion"])
	if uid == "" || version == "" {
		return errors.New("exposure ingress identity is missing")
	}
	if err := c.assertExposureCurrent(ctx, item); err != nil {
		return err
	}
	err := c.kube(ctx, http.MethodDelete, resource, map[string]interface{}{
		"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": map[string]interface{}{"uid": uid, "resourceVersion": version},
	}, "application/json", nil)
	if err != nil {
		return fmt.Errorf("delete owned exposure: %w", err)
	}
	return nil
}

func authorizedExposureIngress(item *lease, namespace string, ingress map[string]interface{}) error {
	metadata := objectValue(ingress["metadata"])
	if stringValue(metadata["namespace"]) != namespace || item.Metadata.UID == "" {
		return errors.New("exposure ingress lease identity is missing")
	}
	if err := verifyNamespaceLabels(item, namespace, ingress); err != nil {
		return err
	}
	predecessors := []string{}
	if encoded, exists := item.Metadata.Annotations[exposurePredecessorsAnnotation]; exists {
		if err := json.Unmarshal([]byte(encoded), &predecessors); err != nil || predecessors == nil {
			return errors.New("exposure predecessor lineage is invalid")
		}
	}
	if len(predecessors) > 64 {
		return errors.New("exposure predecessor lineage is too large")
	}
	for _, owner := range predecessors {
		if len(owner) > 256 || strings.ContainsRune(owner, '\x00') {
			return errors.New("exposure predecessor owner is invalid")
		}
	}
	owner := stringMap(metadata["annotations"])[exposureOwnerAnnotation]
	if owner != item.Metadata.Annotations[exposureOwnerAnnotation] && !contains(predecessors, owner) {
		return errors.New("exposure ingress owner has changed")
	}
	return nil
}
