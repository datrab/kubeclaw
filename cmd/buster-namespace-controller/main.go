package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	serviceAccountNamespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
	serviceAccountTokenPath     = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	serviceAccountCAPath        = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	leasePlural                 = "busternamespaceleases"
)

type controller struct {
	namespace                     string
	apiGroup                      string
	apiVersion                    string
	busterServiceAccountName      string
	busterServiceAccountNamespace string
	additionalRunnerAccounts      []serviceAccountRef
	allowedPrefixes               []string
	defaultTTL                    time.Duration
	pollInterval                  time.Duration
	finalizer                     string
	apiURL                        string
	token                         string
	httpClient                    *http.Client
}

type serviceAccountRef struct {
	Namespace string
	Name      string
}

type lease struct {
	Metadata metadata               `json:"metadata"`
	Spec     map[string]interface{} `json:"spec"`
	Status   map[string]interface{} `json:"status"`
}

type metadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Labels            map[string]string `json:"labels"`
	Finalizers        []string          `json:"finalizers"`
	CreationTimestamp string            `json:"creationTimestamp"`
	DeletionTimestamp string            `json:"deletionTimestamp"`
}

type leaseList struct {
	Items []lease `json:"items"`
}

type apiError struct {
	statusCode int
	message    string
}

func (e *apiError) Error() string {
	return e.message
}

func main() {
	ctrl, err := newController()
	if err != nil {
		panic(err)
	}

	logJSON("info", "controller started", map[string]interface{}{
		"namespace":       ctrl.namespace,
		"apiGroup":        ctrl.apiGroup,
		"apiVersion":      ctrl.apiVersion,
		"allowedPrefixes": ctrl.allowedPrefixes,
	})

	ctx := context.Background()
	for {
		if err := ctrl.reconcileAll(ctx); err != nil {
			logJSON("error", "controller loop failed", err.Error())
		}
		time.Sleep(ctrl.pollInterval)
	}
}

func newController() (*controller, error) {
	namespace := getenvFile("KUBECLAW_NAMESPACE", serviceAccountNamespacePath, "kubeclaw")
	token := readFile(serviceAccountTokenPath, "")
	host := os.Getenv("KUBERNETES_SERVICE_HOST")
	port := env("KUBERNETES_SERVICE_PORT", "443")
	if host == "" || token == "" {
		return nil, errors.New("kubernetes service host and ServiceAccount token are required")
	}

	apiGroup := env("BUSTER_LEASE_API_GROUP", "kubeclaw.forgestack.ai")
	apiVersion := env("BUSTER_LEASE_API_VERSION", "v1alpha1")
	busterSANamespace := env("BUSTER_SERVICE_ACCOUNT_NAMESPACE", namespace)
	prefixes := splitCSV(env("BUSTER_ALLOWED_NAMESPACE_PREFIXES", "test"))
	if len(prefixes) == 0 {
		prefixes = []string{"test"}
	}

	ttlSeconds := envInt("BUSTER_DEFAULT_TTL_SECONDS", 7200)
	pollMs := envInt("BUSTER_CONTROLLER_POLL_MS", 3000)

	ctrl := &controller{
		namespace:                     namespace,
		apiGroup:                      apiGroup,
		apiVersion:                    apiVersion,
		busterServiceAccountName:      env("BUSTER_SERVICE_ACCOUNT_NAME", "agent-buster"),
		busterServiceAccountNamespace: busterSANamespace,
		allowedPrefixes:               prefixes,
		defaultTTL:                    time.Duration(ttlSeconds) * time.Second,
		pollInterval:                  time.Duration(pollMs) * time.Millisecond,
		finalizer:                     apiGroup + "/buster-namespace-cleanup",
		apiURL:                        "https://" + host + ":" + port,
		token:                         token,
	}

	accounts, err := ctrl.parseServiceAccountRefs(os.Getenv("BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS"))
	if err != nil {
		return nil, err
	}
	ctrl.additionalRunnerAccounts = accounts

	client, err := kubernetesHTTPClient()
	if err != nil {
		return nil, err
	}
	ctrl.httpClient = client
	return ctrl, nil
}

func kubernetesHTTPClient() (*http.Client, error) {
	caPEM, err := os.ReadFile(serviceAccountCAPath)
	if err != nil {
		return &http.Client{Timeout: 60 * time.Second}, nil
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("failed to parse Kubernetes ServiceAccount CA")
	}
	return &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12},
		},
	}, nil
}

func (c *controller) reconcileAll(ctx context.Context) error {
	var list leaseList
	if err := c.kube(ctx, http.MethodGet, c.leasePath(""), nil, "application/json", &list); err != nil {
		return err
	}

	for _, item := range list.Items {
		current := item
		if err := c.reconcileLease(ctx, &current); err != nil {
			logJSON("error", "lease reconcile failed: "+current.Metadata.Name, err.Error())
			if current.Metadata.Name == "" {
				continue
			}
			namespaceName := c.normalizeLeaseNamespaceName(stringValue(current.Spec["namespaceName"]))
			if namespaceName == "" {
				namespaceName = stringValue(current.Spec["namespaceName"])
			}
			statusErr := c.patchStatus(ctx, current.Metadata.Name, map[string]interface{}{
				"phase":         "Failed",
				"namespaceName": nullableString(namespaceName),
				"message":       err.Error(),
			})
			if statusErr != nil {
				logJSON("error", "status patch failed: "+current.Metadata.Name, statusErr.Error())
			}
		}
	}
	return nil
}

func (c *controller) reconcileLease(ctx context.Context, item *lease) error {
	name := item.Metadata.Name
	requestedNamespace := stringValue(item.Spec["namespaceName"])
	namespaceName := c.normalizeLeaseNamespaceName(requestedNamespace)
	if namespaceName == "" || !c.hasAllowedPrefix(namespaceName) {
		return c.patchStatus(ctx, name, map[string]interface{}{
			"phase":         "Rejected",
			"namespaceName": nullableString(requestedNamespace),
			"message":       "namespaceName must normalize to a valid broker-owned namespace",
		})
	}

	current, err := c.ensureFinalizer(ctx, item)
	if err != nil {
		return err
	}
	item = current

	if item.Metadata.DeletionTimestamp != "" {
		return c.reconcileDeletedLease(ctx, item, namespaceName)
	}

	if stringValueDefault(item.Spec["cleanupPolicy"], "delete") == "delete" && stringValue(item.Status["phase"]) == "Ready" {
		expiresAt := stringValue(item.Status["expiresAt"])
		if expiresAt != "" {
			deadline, err := time.Parse(time.RFC3339, expiresAt)
			if err == nil && time.Now().After(deadline) {
				if err := c.patchStatus(ctx, name, map[string]interface{}{
					"phase":         "Expired",
					"namespaceName": namespaceName,
					"message":       "Lease TTL expired; deleting broker-owned namespace",
				}); err != nil {
					return err
				}
				return c.deleteNamespace(ctx, namespaceName)
			}
		}
	}

	if stringValue(item.Status["phase"]) == "Ready" {
		exposure, err := c.ensurePreviewExposure(ctx, item, namespaceName)
		if err != nil {
			return err
		}
		if exposureChanged(item.Status, exposure) {
			next := copyStatusWithoutCredentials(item.Status)
			for key, value := range exposure {
				next[key] = value
			}
			return c.patchStatus(ctx, name, next)
		}
		return nil
	}

	if err := c.patchStatus(ctx, name, map[string]interface{}{
		"phase":         "Provisioning",
		"namespaceName": namespaceName,
		"message":       "Creating broker-owned namespace access",
	}); err != nil {
		return err
	}
	if err := c.ensureNamespace(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureNamespaceAccess(ctx, namespaceName); err != nil {
		return err
	}
	if err := c.copySecrets(ctx, stringSlice(item.Spec["secretsToCopy"]), namespaceName); err != nil {
		return err
	}

	exposure, err := c.ensurePreviewExposure(ctx, item, namespaceName)
	if err != nil {
		return err
	}

	status := map[string]interface{}{
		"phase":              "Ready",
		"namespaceName":      namespaceName,
		"serviceAccountName": c.busterServiceAccountNamespace + "/" + c.busterServiceAccountName,
		"internalUrl":        nil,
		"expiresAt":          c.expiresAt(item).Format(time.RFC3339),
		"message":            "Namespace ready",
	}
	if serviceName := stringValue(item.Spec["serviceName"]); serviceName != "" {
		status["internalUrl"] = "http://" + serviceName + "." + namespaceName + ".svc.cluster.local"
	}
	for key, value := range exposure {
		status[key] = value
	}
	if stringValue(exposure["previewUrl"]) != "" {
		status["message"] = exposure["message"]
	}
	return c.patchStatus(ctx, name, status)
}

func (c *controller) reconcileDeletedLease(ctx context.Context, item *lease, namespaceName string) error {
	if stringValueDefault(item.Spec["cleanupPolicy"], "delete") != "keep" {
		if err := c.patchStatus(ctx, item.Metadata.Name, map[string]interface{}{
			"phase":         "Deleting",
			"namespaceName": namespaceName,
			"message":       "Lease deleted; deleting broker-owned namespace",
		}); err != nil {
			return err
		}
		if err := c.deleteNamespace(ctx, namespaceName); err != nil {
			return err
		}
	}
	return c.removeFinalizer(ctx, item)
}

func (c *controller) ensureFinalizer(ctx context.Context, item *lease) (*lease, error) {
	if contains(item.Metadata.Finalizers, c.finalizer) {
		return item, nil
	}
	finalizers := append([]string{}, item.Metadata.Finalizers...)
	finalizers = append(finalizers, c.finalizer)
	var updated lease
	err := c.kube(ctx, http.MethodPatch, c.leasePath(item.Metadata.Name), map[string]interface{}{
		"metadata": map[string]interface{}{"finalizers": finalizers},
	}, "application/merge-patch+json", &updated)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (c *controller) removeFinalizer(ctx context.Context, item *lease) error {
	finalizers := make([]string, 0, len(item.Metadata.Finalizers))
	for _, value := range item.Metadata.Finalizers {
		if value != c.finalizer {
			finalizers = append(finalizers, value)
		}
	}
	return c.kube(ctx, http.MethodPatch, c.leasePath(item.Metadata.Name), map[string]interface{}{
		"metadata": map[string]interface{}{"finalizers": finalizers},
	}, "application/merge-patch+json", nil)
}

func (c *controller) ensureNamespace(ctx context.Context, item *lease, namespaceName string) error {
	manifest := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "Namespace",
		"metadata": map[string]interface{}{
			"name":   namespaceName,
			"labels": ownerLabels(item, namespaceName),
		},
	}
	return c.createOrPatch(ctx, "/api/v1/namespaces", "/api/v1/namespaces/"+namespaceName, manifest, nil)
}

func (c *controller) ensureNamespaceAccess(ctx context.Context, namespaceName string) error {
	if err := c.createOrPatch(
		ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles/buster-namespace-runner",
		c.namespaceRole(namespaceName),
		nil,
	); err != nil {
		return err
	}
	return c.createOrPatch(
		ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings/buster-namespace-runner",
		c.namespaceRoleBinding(namespaceName),
		nil,
	)
}

func (c *controller) namespaceRole(namespaceName string) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1",
		"kind":       "Role",
		"metadata": map[string]interface{}{
			"name":      "buster-namespace-runner",
			"namespace": namespaceName,
		},
		"rules": []interface{}{
			map[string]interface{}{
				"apiGroups": []string{""},
				"resources": []string{
					"pods", "pods/log", "services", "endpoints", "configmaps", "persistentvolumeclaims",
				},
				"verbs": []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
			map[string]interface{}{
				"apiGroups": []string{""},
				"resources": []string{"pods/portforward"},
				"verbs":     []string{"create"},
			},
			map[string]interface{}{
				"apiGroups": []string{""},
				"resources": []string{"secrets"},
				"verbs":     []string{"get"},
			},
			map[string]interface{}{
				"apiGroups": []string{"apps"},
				"resources": []string{"deployments", "replicasets", "statefulsets"},
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
			map[string]interface{}{
				"apiGroups": []string{"batch"},
				"resources": []string{"jobs", "cronjobs"},
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
			map[string]interface{}{
				"apiGroups": []string{"networking.k8s.io"},
				"resources": []string{"ingresses"},
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
		},
	}
}

func (c *controller) namespaceRoleBinding(namespaceName string) map[string]interface{} {
	subjects := []interface{}{
		map[string]interface{}{
			"kind":      "ServiceAccount",
			"name":      c.busterServiceAccountName,
			"namespace": c.busterServiceAccountNamespace,
		},
	}
	for _, account := range c.additionalRunnerAccounts {
		subjects = append(subjects, map[string]interface{}{
			"kind":      "ServiceAccount",
			"name":      account.Name,
			"namespace": account.Namespace,
		})
	}
	return map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1",
		"kind":       "RoleBinding",
		"metadata": map[string]interface{}{
			"name":      "buster-namespace-runner",
			"namespace": namespaceName,
		},
		"roleRef": map[string]interface{}{
			"apiGroup": "rbac.authorization.k8s.io",
			"kind":     "Role",
			"name":     "buster-namespace-runner",
		},
		"subjects": subjects,
	}
}

type previewExposure struct {
	IngressName           string
	Hostname              string
	ServiceName           string
	ServicePort           int
	Path                  string
	CredentialsRef        string
	CredentialsSecretName string
	CredentialsKeys       []string
	RevealCredentials     bool
}

func previewExposureSpec(item *lease, namespaceName string) (*previewExposure, error) {
	if stringValueDefault(item.Spec["purpose"], "pretest") != "final-preview" {
		return nil, nil
	}
	exposureMap := objectValue(item.Spec["exposure"])
	if stringValueDefault(exposureMap["provider"], "off") != "tailscale-ingress" {
		return nil, nil
	}

	servicePort := intValue(exposureMap["servicePort"], 80)
	if servicePort < 1 || servicePort > 65535 {
		return nil, fmt.Errorf("invalid final-preview servicePort: %v", exposureMap["servicePort"])
	}

	serviceName := sanitizeDNSLabel(firstString(exposureMap["serviceName"], item.Spec["serviceName"], "app"), "app")
	hostname := sanitizeDNSLabel(firstString(exposureMap["hostname"], namespaceName+"-"+serviceName), namespaceName+"-"+serviceName)
	path := stringValue(exposureMap["path"])
	if !strings.HasPrefix(path, "/") {
		path = "/"
	}
	credentialsRef := stringValue(exposureMap["credentialsRef"])
	credentialsSecretName := stringValue(exposureMap["credentialsSecretName"])
	if credentialsSecretName == "" {
		credentialsSecretName = parseSecretNameFromRef(credentialsRef)
	}

	return &previewExposure{
		IngressName:           "buster-final-preview",
		Hostname:              hostname,
		ServiceName:           serviceName,
		ServicePort:           servicePort,
		Path:                  path,
		CredentialsRef:        nullIfEmpty(credentialsRef),
		CredentialsSecretName: credentialsSecretName,
		CredentialsKeys:       stringSlice(exposureMap["credentialsKeys"]),
		RevealCredentials:     boolValue(exposureMap["revealCredentials"]) || stringValue(exposureMap["credentialsDelivery"]) == "discord",
	}, nil
}

func (c *controller) ensurePreviewExposure(ctx context.Context, item *lease, namespaceName string) (map[string]interface{}, error) {
	exposure, err := previewExposureSpec(item, namespaceName)
	if err != nil {
		return nil, err
	}
	if exposure == nil {
		return map[string]interface{}{
			"exposurePhase":        "Off",
			"previewUrl":           nil,
			"exposureHostname":     nil,
			"credentialsRef":       nil,
			"credentialsAvailable": false,
			"message":              "Preview exposure disabled",
		}, nil
	}

	credentialsAvailable := false
	err = c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName+"/services/"+exposure.ServiceName, nil, "application/json", nil)
	if err != nil {
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return nil, err
		}
		return map[string]interface{}{
			"exposurePhase":        "Pending",
			"previewUrl":           nil,
			"exposureHostname":     exposure.Hostname,
			"credentialsRef":       nullableString(exposure.CredentialsRef),
			"credentialsAvailable": credentialsAvailable,
			"message":              "Waiting for Service/" + exposure.ServiceName + " before creating Tailscale ingress",
		}, nil
	}

	if exposure.RevealCredentials {
		if exposure.CredentialsSecretName == "" {
			return nil, errors.New("preview credential reveal requested but no credentialsSecretName or credentialsRef secret was provided")
		}
		var secret map[string]interface{}
		if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName+"/secrets/"+exposure.CredentialsSecretName, nil, "application/json", &secret); err != nil {
			return nil, err
		}
		credentialsAvailable = secretHasCredentialKeys(secret, exposure.CredentialsKeys)
		if !credentialsAvailable {
			return nil, fmt.Errorf("preview credential secret %s did not contain any readable credential keys", exposure.CredentialsSecretName)
		}
	}

	var ingress map[string]interface{}
	if err := c.createOrPatch(
		ctx,
		"/apis/networking.k8s.io/v1/namespaces/"+namespaceName+"/ingresses",
		"/apis/networking.k8s.io/v1/namespaces/"+namespaceName+"/ingresses/"+exposure.IngressName,
		previewIngress(item, namespaceName, exposure),
		&ingress,
	); err != nil {
		return nil, err
	}

	previewURL := ingressPreviewURL(ingress, exposure)
	message := "Waiting for Tailscale ingress status"
	if previewURL != "" {
		message = "Tailscale preview URL ready"
	}
	return map[string]interface{}{
		"exposurePhase":        ternaryString(previewURL != "", "Ready", "Pending"),
		"previewUrl":           nullableString(previewURL),
		"exposureHostname":     exposure.Hostname,
		"credentialsRef":       nullableString(exposure.CredentialsRef),
		"credentialsAvailable": credentialsAvailable,
		"message":              message,
	}, nil
}

func previewIngress(item *lease, namespaceName string, exposure *previewExposure) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": "networking.k8s.io/v1",
		"kind":       "Ingress",
		"metadata": map[string]interface{}{
			"name":      exposure.IngressName,
			"namespace": namespaceName,
			"labels":    ownerLabels(item, namespaceName),
		},
		"spec": map[string]interface{}{
			"ingressClassName": "tailscale",
			"tls": []interface{}{
				map[string]interface{}{"hosts": []string{exposure.Hostname}},
			},
			"rules": []interface{}{
				map[string]interface{}{
					"host": exposure.Hostname,
					"http": map[string]interface{}{
						"paths": []interface{}{
							map[string]interface{}{
								"path":     exposure.Path,
								"pathType": "Prefix",
								"backend": map[string]interface{}{
									"service": map[string]interface{}{
										"name": exposure.ServiceName,
										"port": map[string]interface{}{"number": exposure.ServicePort},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func ingressPreviewURL(ingress map[string]interface{}, exposure *previewExposure) string {
	status := objectValue(ingress["status"])
	loadBalancer := objectValue(status["loadBalancer"])
	entries, _ := loadBalancer["ingress"].([]interface{})
	for _, entry := range entries {
		item := objectValue(entry)
		host := firstString(item["hostname"], item["ip"])
		if host != "" {
			if exposure.Path == "/" {
				return "https://" + host
			}
			return "https://" + host + exposure.Path
		}
	}
	return ""
}

func (c *controller) copySecrets(ctx context.Context, names []string, targetNamespace string) error {
	for _, name := range names {
		var source map[string]interface{}
		if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+c.namespace+"/secrets/"+name, nil, "application/json", &source); err != nil {
			return err
		}
		secret := sanitizeSecret(source, targetNamespace)
		if err := c.createOrPatch(ctx, "/api/v1/namespaces/"+targetNamespace+"/secrets", "/api/v1/namespaces/"+targetNamespace+"/secrets/"+name, secret, nil); err != nil {
			return err
		}
	}
	return nil
}

func sanitizeSecret(secret map[string]interface{}, targetNamespace string) map[string]interface{} {
	copy := deepCopyMap(secret)
	meta := objectValue(copy["metadata"])
	meta["namespace"] = targetNamespace
	for _, field := range []string{"resourceVersion", "uid", "creationTimestamp", "managedFields", "selfLink", "generation"} {
		delete(meta, field)
	}
	copy["metadata"] = meta
	return copy
}

func (c *controller) deleteNamespace(ctx context.Context, namespaceName string) error {
	err := c.kube(ctx, http.MethodDelete, "/api/v1/namespaces/"+namespaceName, map[string]interface{}{"gracePeriodSeconds": 0}, "application/json", nil)
	if err != nil {
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return err
		}
	}
	return c.waitForNamespaceDeleted(ctx, namespaceName)
}

func (c *controller) waitForNamespaceDeleted(ctx context.Context, namespaceName string) error {
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName, nil, "application/json", nil)
		if err != nil {
			var apiErr *apiError
			if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
				return nil
			}
			return err
		}
		time.Sleep(c.pollInterval)
	}
	return fmt.Errorf("namespace %s was not deleted before cleanup timeout", namespaceName)
}

func (c *controller) createOrPatch(ctx context.Context, createPath string, patchPath string, manifest map[string]interface{}, out interface{}) error {
	err := c.kube(ctx, http.MethodPost, createPath, manifest, "application/json", out)
	if err == nil {
		return nil
	}
	var apiErr *apiError
	if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusConflict {
		return err
	}
	return c.kube(ctx, http.MethodPatch, patchPath, manifest, "application/merge-patch+json", out)
}

func (c *controller) patchStatus(ctx context.Context, name string, status map[string]interface{}) error {
	return c.kube(ctx, http.MethodPatch, c.statusPath(name), map[string]interface{}{"status": status}, "application/merge-patch+json", nil)
}

func (c *controller) kube(ctx context.Context, method string, path string, body interface{}, contentType string, out interface{}) error {
	var payload io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.apiURL+kubePath(path), payload)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := string(responseBody)
		var parsed map[string]interface{}
		if json.Unmarshal(responseBody, &parsed) == nil {
			if parsedMessage := stringValue(parsed["message"]); parsedMessage != "" {
				message = parsedMessage
			}
		}
		if message == "" {
			message = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return &apiError{statusCode: resp.StatusCode, message: message}
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	return json.Unmarshal(responseBody, out)
}

func (c *controller) leasePath(name string) string {
	base := "/apis/" + c.apiGroup + "/" + c.apiVersion + "/namespaces/" + c.namespace + "/" + leasePlural
	if name == "" {
		return base
	}
	return base + "/" + name
}

func (c *controller) statusPath(name string) string {
	return c.leasePath(name) + "/status"
}

func (c *controller) expiresAt(item *lease) time.Time {
	ttl := c.defaultTTL
	if value := intValue(item.Spec["ttlSeconds"], 0); value > 0 {
		ttl = time.Duration(value) * time.Second
	}
	createdAt, err := time.Parse(time.RFC3339, item.Metadata.CreationTimestamp)
	if err != nil {
		createdAt = time.Now()
	}
	return createdAt.Add(ttl)
}

func (c *controller) parseServiceAccountRefs(value string) ([]serviceAccountRef, error) {
	entries := splitCSV(value)
	accounts := make([]serviceAccountRef, 0, len(entries))
	for _, entry := range entries {
		namespaceName := c.busterServiceAccountNamespace
		name := entry
		if strings.Contains(entry, "/") {
			parts := strings.SplitN(entry, "/", 2)
			namespaceName = parts[0]
			name = parts[1]
		}
		namespaceName = sanitizeDNSLabel(namespaceName, "")
		name = sanitizeDNSLabel(name, "")
		if namespaceName == "" || name == "" {
			return nil, fmt.Errorf("invalid BUSTER_ADDITIONAL_RUNNER_SERVICE_ACCOUNTS entry: %s", entry)
		}
		accounts = append(accounts, serviceAccountRef{Namespace: namespaceName, Name: name})
	}
	return accounts, nil
}

func (c *controller) normalizeLeaseNamespaceName(requestedName string) string {
	sanitized := sanitizeDNSLabel(requestedName, "")
	if sanitized == "" {
		return ""
	}
	matchedPrefix := ""
	for _, prefix := range c.allowedPrefixes {
		if sanitized == prefix || strings.HasPrefix(sanitized, prefix+"-") {
			matchedPrefix = prefix
			break
		}
	}
	prefix := matchedPrefix
	if prefix == "" {
		prefix = c.preferredNamespacePrefix()
	}
	rawSegment := sanitized
	if matchedPrefix != "" {
		rawSegment = strings.TrimPrefix(sanitized, matchedPrefix)
		rawSegment = strings.TrimLeft(rawSegment, "-")
	}
	maxSegmentLength := 63 - len(prefix) - 1
	if maxSegmentLength < 1 {
		maxSegmentLength = 1
	}
	segment := trimTrailingDashes(sliceString(rawSegment, maxSegmentLength))
	if segment == "" {
		segment = "namespace"
	}
	return prefix + "-" + segment
}

func (c *controller) hasAllowedPrefix(namespaceName string) bool {
	for _, prefix := range c.allowedPrefixes {
		if namespaceName == prefix || strings.HasPrefix(namespaceName, prefix+"-") {
			return true
		}
	}
	return false
}

func (c *controller) preferredNamespacePrefix() string {
	for _, prefix := range c.allowedPrefixes {
		if prefix == "test" {
			return "test"
		}
	}
	if len(c.allowedPrefixes) > 0 {
		return c.allowedPrefixes[0]
	}
	return "test"
}

func ownerLabels(item *lease, namespaceName string) map[string]string {
	labels := item.Metadata.Labels
	if labels == nil {
		labels = map[string]string{}
	}
	return map[string]string{
		"app.kubernetes.io/name":   "kubeclaw",
		"kubeclaw/managed-by":      "buster-namespace-controller",
		"kubeclaw/buster-lease":    item.Metadata.Name,
		"kubeclaw/buster-purpose":  sanitizeLabelValue(stringValueDefault(item.Spec["purpose"], "pretest"), "pretest"),
		"openclaw.io/buster-scope": sanitizeLabelValue(firstNonEmpty(labels["openclaw.io/buster-scope"], item.Metadata.Name), "unknown"),
	}
}

func exposureChanged(status map[string]interface{}, exposure map[string]interface{}) bool {
	for _, key := range []string{"exposurePhase", "previewUrl", "message", "credentialsRef"} {
		if stringValue(status[key]) != stringValue(exposure[key]) {
			return true
		}
	}
	return boolValue(status["credentialsAvailable"]) != boolValue(exposure["credentialsAvailable"])
}

func copyStatusWithoutCredentials(status map[string]interface{}) map[string]interface{} {
	next := map[string]interface{}{}
	for key, value := range status {
		if key != "credentials" {
			next[key] = value
		}
	}
	return next
}

func secretHasCredentialKeys(secret map[string]interface{}, keys []string) bool {
	allowed := map[string]bool{}
	for _, key := range keys {
		if key != "" {
			allowed[key] = true
		}
	}
	for key, value := range objectValue(secret["data"]) {
		if len(allowed) > 0 && !allowed[key] {
			continue
		}
		if stringValue(value) != "" {
			return true
		}
	}
	for key, value := range objectValue(secret["stringData"]) {
		if len(allowed) > 0 && !allowed[key] {
			continue
		}
		if stringValue(value) != "" {
			return true
		}
	}
	return false
}

func parseSecretNameFromRef(ref string) string {
	trimmed := strings.TrimSpace(ref)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "secret/") {
		name := strings.TrimPrefix(trimmed, "secret/")
		if validSecretRefName(name) {
			return name
		}
		return ""
	}
	if validSecretRefName(trimmed) {
		return trimmed
	}
	return ""
}

func sanitizeDNSLabel(value string, fallback string) string {
	normalized := strings.ToLower(value)
	normalized = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	normalized = regexp.MustCompile(`-+`).ReplaceAllString(normalized, "-")
	normalized = sliceString(normalized, 63)
	normalized = trimTrailingDashes(normalized)
	if normalized == "" {
		return fallback
	}
	return normalized
}

func sanitizeLabelValue(value string, fallback string) string {
	normalized := strings.ToLower(value)
	normalized = regexp.MustCompile(`[^a-z0-9._-]+`).ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	normalized = sliceString(normalized, 63)
	if normalized == "" {
		return fallback
	}
	return normalized
}

func validSecretRefName(value string) bool {
	return regexp.MustCompile(`^[A-Za-z0-9._-]+$`).MatchString(value)
}

func kubePath(path string) string {
	if strings.HasPrefix(path, "/") {
		return path
	}
	return "/" + path
}

func readFile(path string, fallback string) string {
	content, err := os.ReadFile(path)
	if err != nil {
		return fallback
	}
	trimmed := strings.TrimSpace(string(content))
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func getenvFile(envName string, filePath string, fallback string) string {
	if value := os.Getenv(envName); strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return readFile(filePath, fallback)
}

func env(name string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := []string{}
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func stringValue(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func stringValueDefault(value interface{}, fallback string) string {
	if result := stringValue(value); result != "" {
		return result
	}
	return fallback
}

func firstString(values ...interface{}) string {
	for _, value := range values {
		if result := stringValue(value); result != "" {
			return result
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func intValue(value interface{}, fallback int) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	case string:
		parsed, err := strconv.Atoi(typed)
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func boolValue(value interface{}) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func objectValue(value interface{}) map[string]interface{} {
	typed, ok := value.(map[string]interface{})
	if !ok || typed == nil {
		return map[string]interface{}{}
	}
	return typed
}

func stringSlice(value interface{}) []string {
	items, ok := value.([]interface{})
	if !ok {
		if stringsValue, ok := value.([]string); ok {
			return stringsValue
		}
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if value := stringValue(item); value != "" {
			out = append(out, value)
		}
	}
	return out
}

func nullableString(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}

func nullIfEmpty(value string) string {
	if value == "" {
		return ""
	}
	return value
}

func ternaryString(condition bool, whenTrue string, whenFalse string) string {
	if condition {
		return whenTrue
	}
	return whenFalse
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func sliceString(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}
	return value[:maxLength]
}

func trimTrailingDashes(value string) string {
	return strings.TrimRight(value, "-")
}

func deepCopyMap(value map[string]interface{}) map[string]interface{} {
	data, err := json.Marshal(value)
	if err != nil {
		return map[string]interface{}{}
	}
	var out map[string]interface{}
	if err := json.Unmarshal(data, &out); err != nil {
		return map[string]interface{}{}
	}
	return out
}

func logJSON(level string, message string, detail interface{}) {
	record := map[string]interface{}{
		"ts":        time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"component": "buster-namespace-controller",
		"message":   message,
	}
	if detail != nil {
		record["detail"] = detail
	}
	data, err := json.Marshal(record)
	if err != nil {
		fmt.Println(`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}`)
		return
	}
	fmt.Println(string(data))
}
