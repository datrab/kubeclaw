package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

const replacementAnnotation = "kubeclaw.forgestack.ai/replace-pod"

type podReplacementRequest struct {
	RequestID string `json:"requestId"`
	LeaseUID  string `json:"leaseUID"`
	Namespace string `json:"namespace"`
	PodName   string `json:"podName"`
	PodUID    string `json:"podUID"`
}

func (c *controller) reconcilePodReplacement(ctx context.Context, item *lease, namespace string) (bool, error) {
	raw := item.Metadata.Annotations[replacementAnnotation]
	if raw == "" {
		return false, nil
	}
	var request podReplacementRequest
	if len(raw) > 4096 || json.Unmarshal([]byte(raw), &request) != nil {
		return false, errors.New("invalid pod replacement request")
	}
	previous := securityObject(item.Status["podReplacement"])
	if previous["requestId"] == request.RequestID {
		return false, nil
	}
	if item.Spec["fullStack"] != true || item.Spec["purpose"] != "gate" || item.Status["phase"] != "Ready" || item.Metadata.DeletionTimestamp != "" ||
		!time.Now().UTC().Before(c.expiresAt(item)) || request.LeaseUID != item.Metadata.UID || request.Namespace != namespace ||
		request.RequestID == "" || len(request.RequestID) > 128 || request.PodUID == "" || len(request.PodUID) > 128 ||
		request.PodName == "" || len(request.PodName) > 63 || sanitizeDNSLabel(request.PodName, "") != request.PodName {
		return false, errors.New("pod replacement ownership or live lease mismatch")
	}
	if err := c.verifyNamespaceOwnership(ctx, item, namespace); err != nil {
		return false, err
	}
	path := "/api/v1/namespaces/" + namespace + "/pods/" + request.PodName
	var pod map[string]interface{}
	err := c.kube(ctx, http.MethodGet, path, nil, "application/json", &pod)
	if err != nil {
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return false, err
		}
	} else {
		metadata := securityObject(pod["metadata"])
		if metadata["uid"] != request.PodUID {
			return false, errors.New("pod replacement UID mismatch")
		}
		owned := false
		for _, rawOwner := range interfaceSlice(metadata["ownerReferences"]) {
			owner := securityObject(rawOwner)
			if owner["controller"] == true && (owner["kind"] == "ReplicaSet" || owner["kind"] == "StatefulSet") {
				owned = true
			}
		}
		if !owned {
			return false, errors.New("pod replacement requires a Deployment or StatefulSet pod")
		}
		// Refresh authority after potentially slow namespace and pod observations.
		var current lease
		if err := c.kube(ctx, http.MethodGet, c.leasePath(item.Metadata.Name), nil, "application/json", &current); err != nil {
			return false, err
		}
		if current.Metadata.UID != item.Metadata.UID || current.Metadata.Generation != item.Metadata.Generation ||
			current.Metadata.DeletionTimestamp != "" || current.Status["phase"] != "Ready" ||
			current.Spec["namespaceName"] != namespace || current.Spec["fullStack"] != true || current.Spec["purpose"] != "gate" ||
			current.Metadata.Annotations[replacementAnnotation] != raw || !time.Now().UTC().Before(c.expiresAt(&current)) {
			return false, errors.New("pod replacement lease authority expired or changed before deletion")
		}
		// Kubernetes enforces this precondition atomically, including the GET/delete race.
		options := map[string]interface{}{"apiVersion": "v1", "kind": "DeleteOptions", "preconditions": map[string]interface{}{"uid": request.PodUID}}
		if err := c.kube(ctx, http.MethodDelete, path, options, "application/json", nil); err != nil {
			return false, err
		}
	}
	next := copyStatusWithoutCredentials(item.Status)
	next["podReplacement"] = map[string]interface{}{"requestId": request.RequestID, "leaseUID": request.LeaseUID, "namespace": namespace, "podName": request.PodName, "podUID": request.PodUID, "phase": "DeletionRequested", "observedAt": time.Now().UTC().Format(time.RFC3339)}
	return true, c.patchLeaseStatus(ctx, item, next)
}
