package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	serviceAccountNamespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
	serviceAccountTokenPath     = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	serviceAccountCAPath        = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
	leasePlural                 = "busternamespaceleases"
	runtimeSecurityRefreshAfter = 5 * time.Second
)

var errNamespaceOwnershipMismatch = errors.New("namespace ownership does not match lease")

type controller struct {
	namespace            string
	apiGroup             string
	apiVersion           string
	allowedAccess        map[serviceAccountRef]map[string]bool
	allowedSourceSecrets map[string]bool
	serviceAccountName   string
	secretRoleName       string
	deployerRoleName     string
	testerRoleName       string
	allowedPrefixes      []string
	defaultTTL           time.Duration
	maxTTL               time.Duration
	pollInterval         time.Duration
	finalizer            string
	apiURL               string
	token                string
	httpClient           *http.Client
}

type serviceAccountRef struct {
	Namespace string
	Name      string
}

type accessRequest struct {
	Subject serviceAccountRef
	Mode    string
}

type testCredentialRequest struct {
	Mode       string
	SecretName string
	Readers    []serviceAccountRef
	Writers    []serviceAccountRef
	Keys       []string
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
	UID               string            `json:"uid"`
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
	prefixes := splitCSV(env("BUSTER_ALLOWED_NAMESPACE_PREFIXES", "test"))
	if len(prefixes) == 0 {
		prefixes = []string{"test"}
	}

	ttlSeconds := envInt("BUSTER_DEFAULT_TTL_SECONDS", 7200)
	maxTTLSeconds := envInt("BUSTER_MAX_TTL_SECONDS", 86400)
	pollMs := envInt("BUSTER_CONTROLLER_POLL_MS", 3000)

	ctrl := &controller{
		namespace:          namespace,
		apiGroup:           apiGroup,
		apiVersion:         apiVersion,
		allowedPrefixes:    prefixes,
		defaultTTL:         time.Duration(ttlSeconds) * time.Second,
		maxTTL:             time.Duration(maxTTLSeconds) * time.Second,
		pollInterval:       time.Duration(pollMs) * time.Millisecond,
		finalizer:          apiGroup + "/buster-namespace-cleanup",
		apiURL:             "https://" + host + ":" + port,
		token:              token,
		serviceAccountName: env("BUSTER_CONTROLLER_SERVICE_ACCOUNT", "agent-buster-namespace-controller"),
		secretRoleName:     env("BUSTER_SECRET_ROLE_NAME", "buster-controller-secrets"),
		deployerRoleName:   env("BUSTER_DEPLOYER_ROLE_NAME", "buster-namespace-deployer"),
		testerRoleName:     env("BUSTER_TESTER_ROLE_NAME", "buster-namespace-tester"),
	}

	access, err := parseAllowedAccess(env("BUSTER_ALLOWED_ACCESS_JSON", `[{"subject":"kubeclaw/agent-buster","modes":["tester"]}]`))
	if err != nil {
		return nil, err
	}
	ctrl.allowedAccess = access
	ctrl.allowedSourceSecrets = map[string]bool{}
	for _, name := range splitCSV(os.Getenv("BUSTER_ALLOWED_SOURCE_SECRETS")) {
		if !validSecretRefName(name) {
			return nil, fmt.Errorf("invalid BUSTER_ALLOWED_SOURCE_SECRETS entry: %s", name)
		}
		ctrl.allowedSourceSecrets[name] = true
	}

	client, err := kubernetesHTTPClient()
	if err != nil {
		return nil, err
	}
	ctrl.httpClient = client
	return ctrl, nil
}

func kubernetesHTTPClient() (*http.Client, error) {
	return kubernetesHTTPClientFromCA(serviceAccountCAPath)
}

func kubernetesHTTPClientFromCA(caPath string) (*http.Client, error) {
	caPEM, err := os.ReadFile(caPath)
	if err != nil {
		return nil, fmt.Errorf("read Kubernetes ServiceAccount CA: %w", err)
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
				"conditions":    []interface{}{leaseCondition("Ready", false, "ReconcileFailed")},
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
	if item.Metadata.DeletionTimestamp != "" {
		if !contains(item.Metadata.Finalizers, c.finalizer) {
			return nil
		}
		if stringValue(item.Status["phase"]) == "Rejected" && stringValue(item.Status["namespaceName"]) == "" {
			return c.removeFinalizer(ctx, item)
		}
		ownedNamespace := firstNonEmpty(stringValue(item.Status["namespaceName"]), namespaceName)
		return c.reconcileDeletedLease(ctx, item, ownedNamespace)
	}
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
	if len(interfaceSlice(item.Spec["access"])) == 0 {
		owned, err := c.legacyNamespaceOwned(ctx, item, namespaceName)
		if err != nil {
			return err
		}
		if owned {
			if err := c.deleteLegacyRunnerAccess(ctx, namespaceName); err != nil {
				return err
			}
		}
		if expired, err := c.expireLease(ctx, item, namespaceName); expired || err != nil {
			return err
		}
		return c.patchStatus(ctx, name, map[string]interface{}{
			"phase": "Failed", "namespaceName": namespaceName,
			"expiresAt": c.expiresAt(item).Format(time.RFC3339),
			"message":   "Legacy lease cannot provision new work; delete it or wait for TTL cleanup",
		})
	}
	if expired, err := c.expireLease(ctx, item, namespaceName); expired || err != nil {
		return err
	}

	if err := c.validateLeaseSpec(item); err != nil {
		if stringValue(item.Status["specDigest"]) != "" {
			if deleteErr := c.deleteOwnedNamespace(ctx, item, namespaceName); deleteErr != nil {
				return deleteErr
			}
		}
		return c.patchStatus(ctx, name, rejectedStatus(namespaceName, err.Error()))
	}
	if digest := stringValue(item.Status["specDigest"]); digest != "" && digest != leaseSpecDigest(item.Spec) {
		if stringValue(item.Status["phase"]) != "Ready" || !legacyMutableExposureDigest(digest, item.Spec) {
			return c.patchStatus(ctx, name, rejectedStatus(namespaceName, "lease spec is immutable after provisioning"))
		}
	}

	if stringValue(item.Status["phase"]) == "Ready" {
		return c.reconcileReadyLease(ctx, item, namespaceName)
	}
	return c.provisionLease(ctx, item, namespaceName)
}

func (c *controller) expireLease(ctx context.Context, item *lease, namespaceName string) (bool, error) {
	deadline := c.expiresAt(item)
	if !time.Now().After(deadline) {
		return false, nil
	}
	if stringValue(item.Status["phase"]) == "Expired" {
		return true, c.deleteOwnedNamespace(ctx, item, namespaceName)
	}
	if err := c.patchStatus(ctx, item.Metadata.Name, map[string]interface{}{
		"phase":         "Expired",
		"namespaceName": namespaceName,
		"message":       "Lease TTL expired; deleting broker-owned namespace",
	}); err != nil {
		return true, err
	}
	return true, c.deleteOwnedNamespace(ctx, item, namespaceName)
}

func (c *controller) reconcileReadyLease(ctx context.Context, item *lease, namespaceName string) error {
	if err := c.verifyNamespaceOwnership(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureBusterE2EEgressPolicy(ctx, item, namespaceName); err != nil {
		return err
	}
	credentials, err := c.ensureTestCredentials(ctx, item, namespaceName)
	if err != nil {
		return err
	}
	exposure, err := c.ensurePreviewExposure(ctx, item, namespaceName)
	if err != nil {
		return err
	}
	for key, value := range credentials {
		exposure[key] = value
	}
	runtimeSecurity := objectValue(item.Status["runtimeSecurity"])
	if runtimeSecurityRefreshDue(runtimeSecurity, time.Now().UTC()) {
		var err error
		runtimeSecurity, err = c.runtimeSecurityStatus(ctx, item, namespaceName)
		if err != nil {
			return err
		}
	}
	digest := leaseSpecDigest(item.Spec)
	if !exposureChanged(item.Status, exposure) && stringValue(item.Status["specDigest"]) == digest &&
		runtimeSecurityStatusEqual(item.Status["runtimeSecurity"], runtimeSecurity) {
		return nil
	}
	next := copyStatusWithoutCredentials(item.Status)
	next["specDigest"] = digest
	for key, value := range exposure {
		next[key] = value
	}
	next["runtimeSecurity"] = runtimeSecurity
	credentialsReady := boolValue(next["credentialsAvailable"]) || stringValue(next["credentialsRef"]) == ""
	exposureReady := stringValue(next["exposurePhase"]) == "Ready" || stringValue(next["exposurePhase"]) == "Off"
	next["conditions"] = []interface{}{
		leaseCondition("NamespaceReady", true, "Created"),
		leaseCondition("AccessReady", true, "Bound"),
		leaseCondition("SecretsReady", true, "Copied"),
		leaseCondition("CredentialsReady", credentialsReady, ternaryString(credentialsReady, "Available", "Pending")),
		leaseCondition("ExposureReady", exposureReady, ternaryString(exposureReady, "Available", "Pending")),
	}
	return c.patchStatus(ctx, item.Metadata.Name, next)
}

func runtimeSecurityRefreshDue(snapshot map[string]interface{}, now time.Time) bool {
	phase := stringValue(snapshot["phase"])
	if phase == "Unavailable" {
		return false
	}
	if phase != "Observed" {
		return true
	}
	observedAt, err := time.Parse(time.RFC3339, stringValue(snapshot["observedAt"]))
	if err != nil || observedAt.After(now.Add(5*time.Second)) {
		return true
	}
	return now.Sub(observedAt) >= runtimeSecurityRefreshAfter
}

func runtimeSecurityStatusEqual(left interface{}, right map[string]interface{}) bool {
	leftBytes, leftErr := json.Marshal(left)
	rightBytes, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func securityFinding(id string, severity string, message string, resource string) map[string]interface{} {
	if len(id) > 256 {
		digest := sha256.Sum256([]byte(id))
		id = id[:184] + ":sha256:" + hex.EncodeToString(digest[:])
	}
	return map[string]interface{}{"id": id, "severity": severity, "message": message, "resource": resource}
}

func boundedRuntimeSecurityFindings(findings []interface{}) ([]interface{}, int, int) {
	total := len(findings)
	ordered := append([]interface{}{}, findings...)
	sort.SliceStable(ordered, func(i, j int) bool {
		return stringValue(securityObject(ordered[i])["id"]) < stringValue(securityObject(ordered[j])["id"])
	})
	const maximumFindings = 4096
	const maximumSerializedBytes = 512 * 1024
	bounded := make([]interface{}, 0, min(total, maximumFindings))
	sizes := make([]int, 0, min(total, maximumFindings))
	serializedBytes := 2
	for _, finding := range ordered {
		encoded, err := json.Marshal(finding)
		if err != nil {
			break
		}
		separatorBytes := 0
		if len(bounded) > 0 {
			separatorBytes = 1
		}
		if len(bounded) >= maximumFindings || serializedBytes+separatorBytes+len(encoded) > maximumSerializedBytes {
			break
		}
		bounded = append(bounded, finding)
		sizes = append(sizes, len(encoded))
		serializedBytes += separatorBytes + len(encoded)
	}
	if len(bounded) == total {
		return bounded, total, 0
	}
	for {
		omitted := total - len(bounded)
		overflow := securityFinding("runtime:findings:overflow", "critical",
			fmt.Sprintf("Runtime security omitted %d findings after the bounded evidence limit.", omitted), "Namespace")
		encodedOverflow, _ := json.Marshal(overflow)
		separatorBytes := 0
		if len(bounded) > 0 {
			separatorBytes = 1
		}
		if len(bounded)+1 <= maximumFindings && serializedBytes+separatorBytes+len(encodedOverflow) <= maximumSerializedBytes {
			candidate := append(append([]interface{}{}, bounded...), overflow)
			return candidate, total, omitted
		}
		last := len(sizes) - 1
		serializedBytes -= sizes[last]
		if last > 0 {
			serializedBytes--
		}
		sizes = sizes[:last]
		bounded = bounded[:len(bounded)-1]
	}
}

func serializedFindingBytes(findings []interface{}) int {
	encoded, err := json.Marshal(findings)
	if err != nil {
		return int(^uint(0) >> 1)
	}
	return len(encoded)
}

func securityObject(value interface{}) map[string]interface{} {
	if object, ok := value.(map[string]interface{}); ok {
		return object
	}
	return map[string]interface{}{}
}

func securityItems(value map[string]interface{}) []interface{} {
	return interfaceSlice(value["items"])
}

func inspectRuntimeSecurityState(state map[string]map[string]interface{}, immutableImage string) ([]interface{}, int, int) {
	findings := []interface{}{}
	for _, rawPod := range securityItems(state["pods"]) {
		pod := securityObject(rawPod)
		metadata := securityObject(pod["metadata"])
		spec := securityObject(pod["spec"])
		podName := stringValueDefault(metadata["name"], "unknown")
		if boolValue(spec["hostNetwork"]) || boolValue(spec["hostPID"]) || boolValue(spec["hostIPC"]) {
			findings = append(findings, securityFinding("runtime:"+podName+":host-namespace", "critical", "Pod uses a host namespace.", "Pod/"+podName))
		}
		if value, exists := spec["automountServiceAccountToken"]; !exists || value != false {
			findings = append(findings, securityFinding("runtime:"+podName+":token", "high", "Pod does not disable automatic service-account token mounting.", "Pod/"+podName))
		}
		podSecurity := securityObject(spec["securityContext"])
		if podSecurity["runAsNonRoot"] != true || stringValue(securityObject(podSecurity["seccompProfile"])["type"]) != "RuntimeDefault" {
			findings = append(findings, securityFinding("runtime:"+podName+":pod-security", "high", "Pod runtime security context is incomplete.", "Pod/"+podName))
		}
		containers := append(interfaceSlice(spec["initContainers"]), interfaceSlice(spec["containers"])...)
		containers = append(containers, interfaceSlice(spec["ephemeralContainers"])...)
		for _, rawContainer := range containers {
			container := securityObject(rawContainer)
			containerName := stringValueDefault(container["name"], "unknown")
			if stringValue(container["image"]) != immutableImage {
				findings = append(findings, securityFinding("runtime:"+podName+":"+containerName+":image", "critical", "Runtime image differs from the verified immutable image.", "Pod/"+podName))
			}
			security := securityObject(container["securityContext"])
			capabilities := securityObject(security["capabilities"])
			dropsAll := false
			for _, value := range interfaceSlice(capabilities["drop"]) {
				if stringValue(value) == "ALL" {
					dropsAll = true
				}
			}
			addsCapabilities := len(interfaceSlice(capabilities["add"])) > 0
			if boolValue(security["privileged"]) || security["allowPrivilegeEscalation"] != false || security["runAsNonRoot"] != true || !dropsAll || addsCapabilities {
				findings = append(findings, securityFinding("runtime:"+podName+":"+containerName+":container-security", "high", "Container runtime security context is incomplete.", "Pod/"+podName))
			}
		}
	}
	for _, rawService := range securityItems(state["services"]) {
		service := securityObject(rawService)
		metadata := securityObject(service["metadata"])
		spec := securityObject(service["spec"])
		name := stringValueDefault(metadata["name"], "unknown")
		if stringValueDefault(spec["type"], "ClusterIP") != "ClusterIP" || len(interfaceSlice(spec["externalIPs"])) > 0 {
			findings = append(findings, securityFinding("runtime:service:"+name+":exposure", "critical", "Service has unexpected external exposure.", "Service/"+name))
		}
	}
	allowedRBAC := map[string]bool{"buster-controller-secrets": true, "buster-namespace-deployer": true, "buster-namespace-tester": true}
	for _, kind := range []string{"roles", "rolebindings"} {
		for _, rawResource := range securityItems(state[kind]) {
			name := stringValueDefault(securityObject(securityObject(rawResource)["metadata"])["name"], "unknown")
			if !allowedRBAC[name] {
				findings = append(findings, securityFinding("runtime:"+kind+":"+name, "high", "Test workload created namespace RBAC.", kind+"/"+name))
			}
		}
	}
	for _, rawIngress := range securityItems(state["ingresses"]) {
		name := stringValueDefault(securityObject(securityObject(rawIngress)["metadata"])["name"], "unknown")
		findings = append(findings, securityFinding("runtime:ingress:"+name, "critical", "Test workload created an Ingress.", "Ingress/"+name))
	}
	return findings, len(securityItems(state["pods"])), len(securityItems(state["services"]))
}

func (c *controller) runtimeSecurityStatus(ctx context.Context, item *lease, namespaceName string) (map[string]interface{}, error) {
	immutableImage := stringValue(item.Spec["verifiedImage"])
	manifestDigest := stringValue(item.Spec["manifestDigest"])
	if immutableImage == "" || manifestDigest == "" {
		return map[string]interface{}{"phase": "Unavailable", "message": "Lease has no verified security inputs"}, nil
	}
	resources := map[string]string{
		"pods":         "/api/v1/namespaces/" + namespaceName + "/pods",
		"services":     "/api/v1/namespaces/" + namespaceName + "/services",
		"roles":        "/apis/rbac.authorization.k8s.io/v1/namespaces/" + namespaceName + "/roles",
		"rolebindings": "/apis/rbac.authorization.k8s.io/v1/namespaces/" + namespaceName + "/rolebindings",
		"ingresses":    "/apis/networking.k8s.io/v1/namespaces/" + namespaceName + "/ingresses",
	}
	state := map[string]map[string]interface{}{}
	for name, resourcePath := range resources {
		var response map[string]interface{}
		if err := c.kube(ctx, http.MethodGet, resourcePath, nil, "application/json", &response); err != nil {
			return nil, err
		}
		state[name] = response
	}
	findings, podCount, serviceCount := inspectRuntimeSecurityState(state, immutableImage)
	findings, totalFindingCount, omittedFindingCount := boundedRuntimeSecurityFindings(findings)
	resultDigest := runtimeSecurityResultDigest(findings, totalFindingCount, omittedFindingCount, podCount, serviceCount)
	return map[string]interface{}{"phase": "Observed", "observedAt": time.Now().UTC().Format(time.RFC3339),
		"manifestDigest": manifestDigest, "immutableImage": immutableImage, "findings": findings,
		"totalFindingCount": totalFindingCount, "omittedFindingCount": omittedFindingCount,
		"podCount": podCount, "serviceCount": serviceCount,
		"resultDigest": resultDigest}, nil
}

func runtimeSecurityResultDigest(findings []interface{}, totalFindingCount, omittedFindingCount, podCount, serviceCount int) string {
	observedState := map[string]interface{}{
		"findings":            findings,
		"totalFindingCount":   totalFindingCount,
		"omittedFindingCount": omittedFindingCount,
		"podCount":            podCount,
		"serviceCount":        serviceCount,
	}
	encoded, _ := json.Marshal(observedState)
	digest := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(digest[:])
}

func (c *controller) provisionLease(ctx context.Context, item *lease, namespaceName string) error {
	if err := c.patchStatus(ctx, item.Metadata.Name, map[string]interface{}{
		"phase":         "Provisioning",
		"namespaceName": namespaceName,
		"expiresAt":     c.expiresAt(item).Format(time.RFC3339),
		"specDigest":    leaseSpecDigest(item.Spec),
		"message":       "Creating broker-owned namespace access",
		"conditions":    []interface{}{leaseCondition("NamespaceReady", false, "Provisioning")},
	}); err != nil {
		return err
	}
	if err := c.ensureNamespace(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureNamespaceResourceLimits(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureNamespaceNetworkPolicy(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureBusterE2EEgressPolicy(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.ensureControllerSecretAccess(ctx, namespaceName); err != nil {
		return err
	}
	if err := c.ensureNamespaceAccess(ctx, item, namespaceName); err != nil {
		return err
	}
	if err := c.copySecrets(ctx, stringSlice(item.Spec["secretsToCopy"]), namespaceName); err != nil {
		return err
	}
	credentials, err := c.ensureTestCredentials(ctx, item, namespaceName)
	if err != nil {
		return err
	}

	exposure, err := c.ensurePreviewExposure(ctx, item, namespaceName)
	if err != nil {
		return err
	}

	status := map[string]interface{}{
		"phase":         "Ready",
		"namespaceName": namespaceName,
		"internalUrl":   nil,
		"createdAt":     c.createdAt(item).Format(time.RFC3339),
		"expiresAt":     c.expiresAt(item).Format(time.RFC3339),
		"specDigest":    leaseSpecDigest(item.Spec),
		"message":       "Namespace ready",
	}
	if serviceName := stringValue(item.Spec["serviceName"]); serviceName != "" {
		port := intValue(item.Spec["servicePort"], intValue(objectValue(item.Spec["exposure"])["servicePort"], 80))
		path := stringValue(objectValue(item.Spec["exposure"])["path"])
		if path == "" || !strings.HasPrefix(path, "/") {
			path = "/"
		}
		status["internalUrl"] = fmt.Sprintf("http://%s.%s.svc.cluster.local:%d%s", serviceName, namespaceName, port, path)
	}
	for key, value := range credentials {
		status[key] = value
	}
	for key, value := range exposure {
		status[key] = value
	}
	if stringValue(exposure["previewUrl"]) != "" {
		status["message"] = exposure["message"]
	}
	credentialsReady := boolValue(status["credentialsAvailable"]) || stringValue(status["credentialsRef"]) == ""
	exposureReady := stringValue(status["exposurePhase"]) == "Ready" || stringValue(status["exposurePhase"]) == "Off"
	status["conditions"] = []interface{}{
		leaseCondition("NamespaceReady", true, "Created"),
		leaseCondition("AccessReady", true, "Bound"),
		leaseCondition("SecretsReady", true, "Copied"),
		leaseCondition("CredentialsReady", credentialsReady, ternaryString(credentialsReady, "Available", "Pending")),
		leaseCondition("ExposureReady", exposureReady, ternaryString(exposureReady, "Available", "Pending")),
	}
	return c.patchStatus(ctx, item.Metadata.Name, status)
}

func (c *controller) createdAt(item *lease) time.Time {
	createdAt, err := time.Parse(time.RFC3339, item.Metadata.CreationTimestamp)
	if err != nil {
		return time.Now().UTC()
	}
	return createdAt.UTC()
}

// ensureControllerSecretAccess gives only this controller access to Secrets in
// the one broker-owned target namespace. Source Secret reads use a separate
// namespaced Role in the controller namespace.
func (c *controller) ensureControllerSecretAccess(ctx context.Context, namespaceName string) error {
	roleName := c.secretRoleName
	binding := c.controllerSecretRoleBinding(namespaceName, roleName)
	return c.createOrPatch(ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings/"+roleName, binding, nil)
}

func (c *controller) controllerSecretRoleBinding(namespaceName string, roleName string) map[string]interface{} {
	return map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1", "kind": "RoleBinding",
		"metadata": map[string]interface{}{"name": roleName, "namespace": namespaceName},
		"roleRef":  map[string]interface{}{"apiGroup": "rbac.authorization.k8s.io", "kind": "ClusterRole", "name": roleName},
		"subjects": []interface{}{map[string]interface{}{
			"kind": "ServiceAccount", "name": c.serviceAccountName, "namespace": c.namespace,
		}},
	}
}

func (c *controller) reconcileDeletedLease(ctx context.Context, item *lease, namespaceName string) error {
	if err := c.patchStatus(ctx, item.Metadata.Name, map[string]interface{}{
		"phase":         "Deleting",
		"namespaceName": namespaceName,
		"message":       "Lease deleted; deleting broker-owned namespace",
	}); err != nil {
		return err
	}
	if err := c.deleteOwnedNamespace(ctx, item, namespaceName); err != nil {
		if !errors.Is(err, errNamespaceOwnershipMismatch) {
			return err
		}
	}
	return c.removeFinalizer(ctx, item)
}

func (c *controller) legacyNamespaceOwned(ctx context.Context, item *lease, namespaceName string) (bool, error) {
	if namespaceName == "" || !c.hasAllowedPrefix(namespaceName) {
		return false, nil
	}
	var namespace map[string]interface{}
	err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName, nil, "application/json", &namespace)
	if err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
			return false, nil
		}
		return false, err
	}
	labels := stringMap(objectValue(namespace["metadata"])["labels"])
	return labels["kubeclaw/managed-by"] == "buster-namespace-controller" &&
		labels["kubeclaw/buster-lease"] == item.Metadata.Name, nil
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
	var existing map[string]interface{}
	err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName, nil, "application/json", &existing)
	if err == nil {
		return verifyNamespaceLabels(item, namespaceName, existing)
	}
	var apiErr *apiError
	if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
		return err
	}
	manifest := map[string]interface{}{
		"apiVersion": "v1",
		"kind":       "Namespace",
		"metadata": map[string]interface{}{
			"name":   namespaceName,
			"labels": ownerLabels(item, namespaceName),
		},
	}
	return c.kube(ctx, http.MethodPost, "/api/v1/namespaces", manifest, "application/json", nil)
}

func (c *controller) verifyNamespaceOwnership(ctx context.Context, item *lease, namespaceName string) error {
	if namespaceName == "" || !c.hasAllowedPrefix(namespaceName) {
		return fmt.Errorf("refusing to mutate invalid broker namespace %q", namespaceName)
	}
	var existing map[string]interface{}
	if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName, nil, "application/json", &existing); err != nil {
		return err
	}
	return verifyNamespaceLabels(item, namespaceName, existing)
}

func verifyNamespaceLabels(item *lease, namespaceName string, namespace map[string]interface{}) error {
	labels := stringMap(objectValue(namespace["metadata"])["labels"])
	if labels["kubeclaw/managed-by"] != "buster-namespace-controller" ||
		labels["kubeclaw/buster-lease"] != item.Metadata.Name ||
		labels["kubeclaw/buster-lease-uid"] != item.Metadata.UID {
		return fmt.Errorf("namespace %s exists but is not owned by this lease", namespaceName)
	}
	return nil
}

// ensureNamespaceNetworkPolicy blocks arbitrary egress before any Secret is
// copied. Workloads can use cluster DNS and can reach only pods in this lease.
func (c *controller) ensureNamespaceNetworkPolicy(ctx context.Context, item *lease, namespaceName string) error {
	name := "buster-default-egress"
	manifest := map[string]interface{}{
		"apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
		"metadata": map[string]interface{}{"name": name, "namespace": namespaceName, "labels": ownerLabels(item, namespaceName)},
		"spec": map[string]interface{}{
			"podSelector": map[string]interface{}{}, "policyTypes": []interface{}{"Ingress", "Egress"},
			"ingress": []interface{}{map[string]interface{}{
				"from": []interface{}{
					map[string]interface{}{"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": namespaceName}}},
					map[string]interface{}{
						"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": c.namespace}},
						"podSelector":       map[string]interface{}{"matchExpressions": []interface{}{map[string]interface{}{"key": "kubeclaw/role", "operator": "In", "values": []interface{}{"nova", "buster"}}}},
					},
					map[string]interface{}{
						"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": "tailscale"}},
						"podSelector":       map[string]interface{}{"matchLabels": map[string]interface{}{"tailscale.com/managed": "true", "tailscale.com/parent-resource-ns": namespaceName}},
					},
				},
			}},
			"egress": []interface{}{
				map[string]interface{}{
					"to": []interface{}{map[string]interface{}{"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": namespaceName}}}},
				},
				map[string]interface{}{
					"to": []interface{}{map[string]interface{}{
						"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": "kube-system"}},
						"podSelector":       map[string]interface{}{"matchLabels": map[string]interface{}{"k8s-app": "kube-dns"}},
					}},
					"ports": []interface{}{
						map[string]interface{}{"protocol": "UDP", "port": 53},
						map[string]interface{}{"protocol": "TCP", "port": 53},
					},
				},
			},
		},
	}
	return c.createOrPatch(ctx,
		"/apis/networking.k8s.io/v1/namespaces/"+namespaceName+"/networkpolicies",
		"/apis/networking.k8s.io/v1/namespaces/"+namespaceName+"/networkpolicies/"+name, manifest, nil)
}

func busterE2EEgressPolicyName(item *lease) string {
	digest := sha256.Sum256([]byte(item.Metadata.Name + "|" + item.Metadata.UID))
	return "buster-e2e-" + hex.EncodeToString(digest[:8])
}

func busterE2EEgressPolicy(item *lease, controllerNamespace, namespaceName string) (map[string]interface{}, error) {
	servicePort := intValue(item.Spec["servicePort"], 0)
	if servicePort < 1 || servicePort > 65535 {
		return nil, fmt.Errorf("invalid E2E service port %d", servicePort)
	}
	serviceTargetPort := intValue(item.Spec["serviceTargetPort"], servicePort)
	if serviceTargetPort < 1 || serviceTargetPort > 65535 {
		return nil, fmt.Errorf("invalid E2E service target port %d", serviceTargetPort)
	}
	allowedPorts := []interface{}{map[string]interface{}{"protocol": "TCP", "port": serviceTargetPort}}
	if servicePort != serviceTargetPort {
		allowedPorts = append(allowedPorts, map[string]interface{}{"protocol": "TCP", "port": servicePort})
	}
	return map[string]interface{}{
		"apiVersion": "networking.k8s.io/v1", "kind": "NetworkPolicy",
		"metadata": map[string]interface{}{"name": busterE2EEgressPolicyName(item), "namespace": controllerNamespace, "labels": ownerLabels(item, namespaceName)},
		"spec": map[string]interface{}{
			"podSelector": map[string]interface{}{"matchLabels": map[string]interface{}{
				"app.kubernetes.io/name": "kubeclaw", "app.kubernetes.io/component": "buster",
			}},
			"policyTypes": []interface{}{"Egress"},
			"egress": []interface{}{
				map[string]interface{}{
					"to": []interface{}{map[string]interface{}{
						"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": "kube-system"}},
						"podSelector":       map[string]interface{}{"matchLabels": map[string]interface{}{"k8s-app": "kube-dns"}},
					}},
					"ports": []interface{}{map[string]interface{}{"protocol": "UDP", "port": 53}, map[string]interface{}{"protocol": "TCP", "port": 53}},
				},
				map[string]interface{}{
					"to": []interface{}{map[string]interface{}{
						"namespaceSelector": map[string]interface{}{"matchLabels": map[string]interface{}{
							"kubeclaw/buster-lease":     leaseLabelValue(item),
							"kubeclaw/buster-lease-uid": sanitizeLabelValue(item.Metadata.UID, "uid-missing"),
						}},
						"podSelector": map[string]interface{}{"matchLabels": map[string]interface{}{
							"kubeclaw/e2e-target": "true",
						}},
					}},
					"ports": allowedPorts,
				},
			},
		},
	}, nil
}

// ensureBusterE2EEgressPolicy grants the Buster pod only the declared Service
// port in this lease's namespace and only to the explicitly labelled E2E
// target pods. The source process has a matching Landlock TCP-port rule.
func (c *controller) ensureBusterE2EEgressPolicy(ctx context.Context, item *lease, namespaceName string) error {
	manifest, err := busterE2EEgressPolicy(item, c.namespace, namespaceName)
	if err != nil {
		return err
	}
	name := busterE2EEgressPolicyName(item)
	return c.createOrPatch(ctx,
		"/apis/networking.k8s.io/v1/namespaces/"+c.namespace+"/networkpolicies",
		"/apis/networking.k8s.io/v1/namespaces/"+c.namespace+"/networkpolicies/"+name, manifest, nil)
}

func (c *controller) deleteBusterE2EEgressPolicy(ctx context.Context, item *lease) error {
	err := c.kube(ctx, http.MethodDelete,
		"/apis/networking.k8s.io/v1/namespaces/"+c.namespace+"/networkpolicies/"+busterE2EEgressPolicyName(item),
		map[string]interface{}{"gracePeriodSeconds": 0}, "application/json", nil)
	if err != nil {
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return err
		}
	}
	return nil
}

// ensureNamespaceResourceLimits puts an enforced ceiling below the cluster
// scheduler. Default requests and limits also cover manifests that omit them.
func (c *controller) ensureNamespaceResourceLimits(ctx context.Context, item *lease, namespaceName string) error {
	labels := ownerLabels(item, namespaceName)
	quotaName := "buster-resource-quota"
	quota := map[string]interface{}{
		"apiVersion": "v1", "kind": "ResourceQuota",
		"metadata": map[string]interface{}{"name": quotaName, "namespace": namespaceName, "labels": labels},
		"spec": map[string]interface{}{"hard": map[string]interface{}{
			"pods": "32", "requests.cpu": "8", "requests.memory": "16Gi", "limits.cpu": "16", "limits.memory": "32Gi",
			"requests.ephemeral-storage": "16Gi", "limits.ephemeral-storage": "32Gi",
			"persistentvolumeclaims": "8", "requests.storage": "100Gi",
		}},
	}
	if err := c.createOrPatch(ctx, "/api/v1/namespaces/"+namespaceName+"/resourcequotas",
		"/api/v1/namespaces/"+namespaceName+"/resourcequotas/"+quotaName, quota, nil); err != nil {
		return err
	}
	limitName := "buster-default-limits"
	limit := map[string]interface{}{
		"apiVersion": "v1", "kind": "LimitRange",
		"metadata": map[string]interface{}{"name": limitName, "namespace": namespaceName, "labels": labels},
		"spec": map[string]interface{}{"limits": []interface{}{map[string]interface{}{
			"type":           "Container",
			"defaultRequest": map[string]interface{}{"cpu": "100m", "memory": "128Mi", "ephemeral-storage": "128Mi"},
			"default":        map[string]interface{}{"cpu": "1", "memory": "1Gi", "ephemeral-storage": "2Gi"},
			"max":            map[string]interface{}{"cpu": "4", "memory": "8Gi", "ephemeral-storage": "8Gi"},
		}}},
	}
	return c.createOrPatch(ctx, "/api/v1/namespaces/"+namespaceName+"/limitranges",
		"/api/v1/namespaces/"+namespaceName+"/limitranges/"+limitName, limit, nil)
}

func (c *controller) ensureNamespaceAccess(ctx context.Context, item *lease, namespaceName string) error {
	if err := c.deleteLegacyRunnerAccess(ctx, namespaceName); err != nil {
		return err
	}
	requests, err := c.accessRequests(item)
	if err != nil {
		return err
	}
	byMode := map[string][]serviceAccountRef{}
	for _, request := range requests {
		byMode[request.Mode] = append(byMode[request.Mode], request.Subject)
	}
	for _, mode := range []string{"deployer", "tester"} {
		if len(byMode[mode]) == 0 {
			continue
		}
		roleName := c.testerRoleName
		if mode == "deployer" {
			roleName = c.deployerRoleName
		}
		if err := c.createOrPatch(ctx,
			"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings",
			"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings/"+roleName,
			c.namespaceRoleBinding(namespaceName, roleName, byMode[mode]), nil); err != nil {
			return err
		}
	}
	return nil
}

func (c *controller) deleteLegacyRunnerAccess(ctx context.Context, namespaceName string) error {
	for _, resource := range []string{"rolebindings", "roles"} {
		path := "/apis/rbac.authorization.k8s.io/v1/namespaces/" + namespaceName + "/" + resource + "/buster-namespace-runner"
		err := c.kube(ctx, http.MethodDelete, path, map[string]interface{}{}, "application/json", nil)
		if err == nil {
			continue
		}
		var apiErr *apiError
		if !errors.As(err, &apiErr) || apiErr.statusCode != http.StatusNotFound {
			return err
		}
	}
	return nil
}

func (c *controller) namespaceRole(namespaceName string, roleName string, mode string) map[string]interface{} {
	coreResources := []string{"pods", "pods/log", "services", "endpoints", "configmaps"}
	appResources := []string{"deployments", "replicasets"}
	if mode == "deployer" {
		coreResources = append(coreResources, "persistentvolumeclaims")
		appResources = append(appResources, "statefulsets")
	}
	return map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1",
		"kind":       "Role",
		"metadata": map[string]interface{}{
			"name":      roleName,
			"namespace": namespaceName,
		},
		"rules": []interface{}{
			map[string]interface{}{
				"apiGroups": []string{""},
				"resources": coreResources,
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
			map[string]interface{}{
				"apiGroups": []string{"apps"},
				"resources": appResources,
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
			map[string]interface{}{
				"apiGroups": []string{"batch"},
				"resources": []string{"jobs", "cronjobs"},
				"verbs":     []string{"create", "get", "list", "watch", "delete", "patch", "update"},
			},
		},
	}
}

func (c *controller) namespaceRoleBinding(namespaceName string, roleName string, accounts []serviceAccountRef, roleKinds ...string) map[string]interface{} {
	roleKind := "ClusterRole"
	if len(roleKinds) > 0 && roleKinds[0] == "Role" {
		roleKind = "Role"
	}
	subjects := []interface{}{}
	for _, account := range accounts {
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
			"name":      roleName,
			"namespace": namespaceName,
		},
		"roleRef": map[string]interface{}{
			"apiGroup": "rbac.authorization.k8s.io",
			"kind":     roleKind,
			"name":     roleName,
		},
		"subjects": subjects,
	}
}

func (c *controller) accessRequests(item *lease) ([]accessRequest, error) {
	values := interfaceSlice(item.Spec["access"])
	if len(values) == 0 {
		return nil, errors.New("at least one access request is required")
	}
	requests := make([]accessRequest, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		entry := objectValue(value)
		subject, err := parseServiceAccountRef(stringValue(entry["subject"]), c.namespace)
		if err != nil {
			return nil, err
		}
		mode := stringValue(entry["mode"])
		if mode != "deployer" && mode != "tester" {
			return nil, fmt.Errorf("unsupported access mode %q", mode)
		}
		if !c.allowedAccess[subject][mode] {
			return nil, fmt.Errorf("access denied for %s/%s in mode %s", subject.Namespace, subject.Name, mode)
		}
		key := subject.Namespace + "/" + subject.Name + ":" + mode
		if !seen[key] {
			requests = append(requests, accessRequest{Subject: subject, Mode: mode})
			seen[key] = true
		}
	}
	return requests, nil
}

func (c *controller) credentialRequest(item *lease) (*testCredentialRequest, error) {
	entry := objectValue(item.Spec["testCredentials"])
	if len(entry) == 0 {
		return nil, nil
	}
	mode := stringValue(entry["mode"])
	if mode != "generate" && mode != "existing" {
		return nil, fmt.Errorf("testCredentials.mode must be generate or existing")
	}
	secretName := sanitizeDNSLabel(stringValue(entry["secretName"]), "")
	if secretName == "" || secretName != stringValue(entry["secretName"]) {
		return nil, errors.New("testCredentials.secretName must be a valid DNS label")
	}
	for _, copiedName := range stringSlice(item.Spec["secretsToCopy"]) {
		if copiedName == secretName {
			return nil, errors.New("testCredentials.secretName must not match a copied source Secret")
		}
	}
	readers := []serviceAccountRef{}
	seen := map[serviceAccountRef]bool{}
	leaseSubjects := map[serviceAccountRef]bool{}
	writers := []serviceAccountRef{}
	for _, value := range interfaceSlice(item.Spec["access"]) {
		access := objectValue(value)
		subject, err := parseServiceAccountRef(stringValue(access["subject"]), c.namespace)
		if err == nil {
			leaseSubjects[subject] = true
			if mode == "existing" && stringValue(access["mode"]) == "deployer" {
				writers = append(writers, subject)
			}
		}
	}
	for _, raw := range stringSlice(entry["readers"]) {
		reader, err := parseServiceAccountRef(raw, c.namespace)
		if err != nil {
			return nil, err
		}
		if _, allowed := c.allowedAccess[reader]; !allowed {
			return nil, fmt.Errorf("credential reader %s/%s is not allowed", reader.Namespace, reader.Name)
		}
		if !seen[reader] {
			readers = append(readers, reader)
			seen[reader] = true
		}
	}
	if len(readers) == 0 {
		return nil, errors.New("testCredentials requires at least one reader")
	}
	for subject := range leaseSubjects {
		if !seen[subject] {
			return nil, fmt.Errorf("credential reader list must include workload-capable lease subject %s/%s", subject.Namespace, subject.Name)
		}
	}
	keys := stringSlice(entry["keys"])
	if len(keys) == 0 && mode == "generate" {
		keys = []string{"username", "password"}
	}
	if len(keys) == 0 {
		return nil, errors.New("existing testCredentials requires at least one deliverable key")
	}
	seenKeys := map[string]bool{}
	for _, key := range keys {
		if !validSecretRefName(key) || seenKeys[key] {
			return nil, fmt.Errorf("invalid or duplicate test credential key %q", key)
		}
		seenKeys[key] = true
	}
	if mode == "generate" && (len(keys) != 2 || !seenKeys["username"] || !seenKeys["password"]) {
		return nil, errors.New("generated testCredentials keys must be username and password")
	}
	if mode == "existing" && len(writers) == 0 {
		return nil, errors.New("existing testCredentials requires a deployer to populate the dedicated Secret")
	}
	return &testCredentialRequest{Mode: mode, SecretName: secretName, Readers: readers, Writers: writers, Keys: keys}, nil
}

func (c *controller) ensureTestCredentials(ctx context.Context, item *lease, namespaceName string) (map[string]interface{}, error) {
	request, err := c.credentialRequest(item)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return map[string]interface{}{"credentialsRef": nil, "credentialsAvailable": false}, nil
	}
	if err := c.ensureCredentialAccess(ctx, namespaceName, request); err != nil {
		return nil, err
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
		password := make([]byte, 24)
		if _, err := rand.Read(password); err != nil {
			return nil, fmt.Errorf("generate preview credential: %w", err)
		}
		manifest := map[string]interface{}{
			"apiVersion": "v1", "kind": "Secret", "type": "Opaque",
			"metadata": map[string]interface{}{
				"name": request.SecretName, "namespace": namespaceName,
				"labels": mergeStringMaps(ownerLabels(item, namespaceName), map[string]string{"kubeclaw/user-deliverable": "true"}),
			},
			"stringData": map[string]interface{}{
				"username": "preview", "password": base64.RawURLEncoding.EncodeToString(password),
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
	return map[string]interface{}{"credentialsRef": "secret/" + request.SecretName, "credentialsAvailable": true}, nil
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

func (c *controller) ensureCredentialAccess(ctx context.Context, namespaceName string, request *testCredentialRequest) error {
	roleName := "buster-preview-credentials-reader"
	role := map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1", "kind": "Role",
		"metadata": map[string]interface{}{"name": roleName, "namespace": namespaceName},
		"rules": []interface{}{map[string]interface{}{
			"apiGroups": []string{""}, "resources": []string{"secrets"},
			"resourceNames": []string{request.SecretName}, "verbs": []string{"get"},
		}},
	}
	if err := c.createOrPatch(ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles/"+roleName,
		role, nil); err != nil {
		return err
	}
	if err := c.createOrPatch(ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings/"+roleName,
		c.namespaceRoleBinding(namespaceName, roleName, request.Readers, "Role"), nil); err != nil {
		return err
	}
	if request.Mode != "existing" {
		return nil
	}
	writerRoleName := "buster-preview-credentials-writer"
	writerRole := map[string]interface{}{
		"apiVersion": "rbac.authorization.k8s.io/v1", "kind": "Role",
		"metadata": map[string]interface{}{"name": writerRoleName, "namespace": namespaceName},
		"rules": []interface{}{map[string]interface{}{
			"apiGroups": []string{""}, "resources": []string{"secrets"},
			"resourceNames": []string{request.SecretName}, "verbs": []string{"patch"},
		}},
	}
	if err := c.createOrPatch(ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/roles/"+writerRoleName,
		writerRole, nil); err != nil {
		return err
	}
	return c.createOrPatch(ctx,
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings",
		"/apis/rbac.authorization.k8s.io/v1/namespaces/"+namespaceName+"/rolebindings/"+writerRoleName,
		c.namespaceRoleBinding(namespaceName, writerRoleName, request.Writers, "Role"), nil)
}

type previewExposure struct {
	IngressName string
	Hostname    string
	ServiceName string
	ServicePort int
	Path        string
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
	if path == "" {
		path = "/"
	} else if len(path) > 1024 || !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.ContainsAny(path, "\x00\r\n?#") {
		return nil, errors.New("invalid final-preview path")
	}
	return &previewExposure{
		IngressName: "buster-final-preview",
		Hostname:    hostname,
		ServiceName: serviceName,
		ServicePort: servicePort,
		Path:        path,
	}, nil
}

func (c *controller) ensurePreviewExposure(ctx context.Context, item *lease, namespaceName string) (map[string]interface{}, error) {
	exposure, err := previewExposureSpec(item, namespaceName)
	if err != nil {
		return nil, err
	}
	if exposure == nil {
		if err := c.deleteIngress(ctx, namespaceName, "buster-final-preview"); err != nil {
			return nil, err
		}
		return map[string]interface{}{
			"exposurePhase":    "Off",
			"previewUrl":       nil,
			"exposureHostname": nil,
			"message":          "Preview exposure disabled",
		}, nil
	}

	serviceReady, err := c.previewServiceReady(ctx, namespaceName, exposure.ServiceName, exposure.ServicePort)
	if err != nil {
		return nil, err
	}
	if !serviceReady {
		return map[string]interface{}{
			"exposurePhase":    "Pending",
			"previewUrl":       nil,
			"exposureHostname": exposure.Hostname,
			"message":          "Waiting for Service/" + exposure.ServiceName + " before creating Tailscale ingress",
		}, nil
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
	exposureHostname := exposure.Hostname
	if previewURL != "" {
		message = "Tailscale preview URL ready"
		parsed, err := url.Parse(previewURL)
		if err != nil || parsed.Hostname() == "" {
			return nil, errors.New("Tailscale ingress returned an invalid preview URL")
		}
		exposureHostname = parsed.Hostname()
	}
	return map[string]interface{}{
		"exposurePhase":    ternaryString(previewURL != "", "Ready", "Pending"),
		"previewUrl":       nullableString(previewURL),
		"exposureHostname": exposureHostname,
		"message":          message,
	}, nil
}

func (c *controller) previewServiceReady(ctx context.Context, namespaceName string, serviceName string, servicePort int) (bool, error) {
	var service map[string]interface{}
	err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName+"/services/"+serviceName, nil, "application/json", &service)
	if err == nil {
		var endpoints map[string]interface{}
		if err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName+"/endpoints/"+serviceName, nil, "application/json", &endpoints); err != nil {
			var endpointErr *apiError
			if errors.As(err, &endpointErr) && endpointErr.statusCode == http.StatusNotFound {
				return false, nil
			}
			return false, err
		}
		return serviceEndpointReady(service, endpoints, servicePort), nil
	}
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
		return false, nil
	}
	return false, err
}

func serviceEndpointReady(service map[string]interface{}, endpoints map[string]interface{}, requestedPort int) bool {
	var portName string
	var targetPort interface{}
	servicePorts := interfaceSlice(objectValue(service["spec"])["ports"])
	for _, value := range servicePorts {
		port := objectValue(value)
		if intValue(port["port"], 0) == requestedPort {
			portName, targetPort = stringValue(port["name"]), port["targetPort"]
			if targetPort == nil {
				targetPort = requestedPort
			}
			break
		}
	}
	if targetPort == nil {
		return false
	}
	for _, value := range interfaceSlice(endpoints["subsets"]) {
		subset := objectValue(value)
		if len(interfaceSlice(subset["addresses"])) == 0 {
			continue
		}
		endpointPorts := interfaceSlice(subset["ports"])
		if len(servicePorts) == 1 && portName == "" && len(endpointPorts) == 1 {
			return true
		}
		for _, endpointValue := range endpointPorts {
			endpointPort := objectValue(endpointValue)
			if (stringValue(targetPort) != "" && stringValue(endpointPort["name"]) == stringValue(targetPort)) ||
				(stringValue(targetPort) == "" && intValue(endpointPort["port"], 0) == intValue(targetPort, requestedPort)) ||
				(portName != "" && stringValue(endpointPort["name"]) == portName) {
				return true
			}
		}
	}
	return false
}

func (c *controller) deleteIngress(ctx context.Context, namespaceName string, ingressName string) error {
	err := c.kube(ctx, http.MethodDelete,
		"/apis/networking.k8s.io/v1/namespaces/"+namespaceName+"/ingresses/"+ingressName,
		map[string]interface{}{}, "application/json", nil)
	if err == nil {
		return nil
	}
	var apiErr *apiError
	if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
		return nil
	}
	return err
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
				return "https://" + host + "/"
			}
			return "https://" + host + exposure.Path
		}
	}
	return ""
}

func (c *controller) copySecrets(ctx context.Context, names []string, targetNamespace string) error {
	for _, name := range names {
		if !c.allowedSourceSecrets[name] {
			return fmt.Errorf("source secret %s is not approved for test namespace copying", name)
		}
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
	delete(meta, "ownerReferences")
	delete(meta, "finalizers")
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

func (c *controller) deleteOwnedNamespace(ctx context.Context, item *lease, namespaceName string) error {
	if namespaceName == "" || !c.hasAllowedPrefix(namespaceName) {
		return fmt.Errorf("refusing to delete invalid broker namespace %q", namespaceName)
	}
	var namespace map[string]interface{}
	err := c.kube(ctx, http.MethodGet, "/api/v1/namespaces/"+namespaceName, nil, "application/json", &namespace)
	if err != nil {
		var apiErr *apiError
		if errors.As(err, &apiErr) && apiErr.statusCode == http.StatusNotFound {
			return c.deleteBusterE2EEgressPolicy(ctx, item)
		}
		return err
	}
	labels := stringMap(objectValue(namespace["metadata"])["labels"])
	legacyOwned := len(interfaceSlice(item.Spec["access"])) == 0 &&
		labels["kubeclaw/buster-lease-uid"] == ""
	if labels["kubeclaw/managed-by"] != "buster-namespace-controller" ||
		labels["kubeclaw/buster-lease"] != item.Metadata.Name ||
		(!legacyOwned && labels["kubeclaw/buster-lease-uid"] != item.Metadata.UID) {
		return fmt.Errorf("%w: refusing to delete namespace %s", errNamespaceOwnershipMismatch, namespaceName)
	}
	if err := c.deleteBusterE2EEgressPolicy(ctx, item); err != nil {
		return err
	}
	return c.deleteNamespace(ctx, namespaceName)
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
	payload, err := requestPayload(body)
	if err != nil {
		return err
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
	if err := kubeResponseError(resp.StatusCode, responseBody); err != nil {
		return err
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	return json.Unmarshal(responseBody, out)
}

func requestPayload(body interface{}) (io.Reader, error) {
	if body == nil {
		return nil, nil
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func kubeResponseError(statusCode int, responseBody []byte) error {
	if statusCode >= 200 && statusCode < 300 {
		return nil
	}
	message := string(responseBody)
	var parsed map[string]interface{}
	if json.Unmarshal(responseBody, &parsed) == nil && stringValue(parsed["message"]) != "" {
		message = stringValue(parsed["message"])
	}
	if message == "" {
		message = fmt.Sprintf("HTTP %d", statusCode)
	}
	return &apiError{statusCode: statusCode, message: message}
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
	if c.maxTTL > 0 && ttl > c.maxTTL {
		ttl = c.maxTTL
	}
	createdAt, err := time.Parse(time.RFC3339, item.Metadata.CreationTimestamp)
	if err != nil {
		createdAt = time.Now()
	}
	return createdAt.Add(ttl)
}

func (c *controller) validateLeaseSpec(item *lease) error {
	ttlSeconds := intValue(item.Spec["ttlSeconds"], int(c.defaultTTL/time.Second))
	if ttlSeconds < 60 {
		return errors.New("ttlSeconds must be at least 60")
	}
	if time.Duration(ttlSeconds)*time.Second > c.maxTTL {
		return fmt.Errorf("ttlSeconds exceeds maximum %d", int(c.maxTTL/time.Second))
	}
	cleanup := stringValueDefault(item.Spec["cleanupPolicy"], "delete")
	if cleanup != "delete" && cleanup != "retain" {
		return errors.New("cleanupPolicy must be delete or retain")
	}
	if _, err := c.accessRequests(item); err != nil {
		return err
	}
	if _, err := c.credentialRequest(item); err != nil {
		return err
	}
	for _, name := range stringSlice(item.Spec["secretsToCopy"]) {
		if !c.allowedSourceSecrets[name] {
			return fmt.Errorf("source secret %s is not approved for test namespace copying", name)
		}
	}
	return nil
}

func leaseSpecDigest(spec map[string]interface{}) string {
	copy := cloneObject(spec)
	delete(copy, "purpose")
	delete(copy, "exposure")
	return fullLeaseSpecDigest(copy)
}

func fullLeaseSpecDigest(spec map[string]interface{}) string {
	data, _ := json.Marshal(spec)
	digest := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(digest[:])
}

func cloneObject(value map[string]interface{}) map[string]interface{} {
	data, _ := json.Marshal(value)
	copy := map[string]interface{}{}
	_ = json.Unmarshal(data, &copy)
	return copy
}

// legacyMutableExposureDigest permits one migration from the former full-spec
// digest. The CRD keeps all other fields immutable during this transition.
func legacyMutableExposureDigest(stored string, spec map[string]interface{}) bool {
	if stored == fullLeaseSpecDigest(spec) {
		return true
	}
	initial := cloneObject(spec)
	initial["purpose"] = "gate"
	initial["exposure"] = map[string]interface{}{"provider": "off"}
	return stored == fullLeaseSpecDigest(initial)
}

func rejectedStatus(namespaceName string, message string) map[string]interface{} {
	return map[string]interface{}{
		"phase": "Rejected", "namespaceName": nullableString(namespaceName), "message": message,
		"conditions": []interface{}{leaseCondition("Ready", false, "Rejected")},
	}
}

func leaseCondition(conditionType string, ready bool, reason string) map[string]interface{} {
	status := "False"
	if ready {
		status = "True"
	}
	return map[string]interface{}{
		"type": conditionType, "status": status, "reason": reason,
		"lastTransitionTime": time.Now().UTC().Format(time.RFC3339),
	}
}

func parseServiceAccountRef(value string, defaultNamespace string) (serviceAccountRef, error) {
	parts := strings.Split(value, "/")
	if len(parts) == 1 {
		parts = []string{defaultNamespace, parts[0]}
	}
	if len(parts) != 2 || sanitizeDNSLabel(parts[0], "") != parts[0] || sanitizeDNSLabel(parts[1], "") != parts[1] {
		return serviceAccountRef{}, fmt.Errorf("invalid service account reference %q", value)
	}
	return serviceAccountRef{Namespace: parts[0], Name: parts[1]}, nil
}

func parseAllowedAccess(value string) (map[serviceAccountRef]map[string]bool, error) {
	var entries []map[string]interface{}
	if err := json.Unmarshal([]byte(value), &entries); err != nil {
		return nil, fmt.Errorf("invalid BUSTER_ALLOWED_ACCESS_JSON: %w", err)
	}
	allowed := map[serviceAccountRef]map[string]bool{}
	for _, entry := range entries {
		subject, err := parseServiceAccountRef(stringValue(entry["subject"]), "kubeclaw")
		if err != nil {
			return nil, err
		}
		if allowed[subject] == nil {
			allowed[subject] = map[string]bool{}
		}
		for _, mode := range stringSlice(entry["modes"]) {
			if mode != "deployer" && mode != "tester" {
				return nil, fmt.Errorf("invalid access mode %q for %s", mode, stringValue(entry["subject"]))
			}
			allowed[subject][mode] = true
		}
	}
	if len(allowed) == 0 {
		return nil, errors.New("BUSTER_ALLOWED_ACCESS_JSON must allow at least one subject")
	}
	return allowed, nil
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
		"app.kubernetes.io/name":                     "kubeclaw",
		"kubeclaw/managed-by":                        "buster-namespace-controller",
		"kubeclaw/buster-lease":                      leaseLabelValue(item),
		"kubeclaw/buster-lease-uid":                  sanitizeLabelValue(item.Metadata.UID, "uid-missing"),
		"kubeclaw/buster-purpose":                    sanitizeLabelValue(stringValueDefault(item.Spec["purpose"], "pretest"), "pretest"),
		"openclaw.io/buster-scope":                   sanitizeLabelValue(firstNonEmpty(labels["openclaw.io/buster-scope"], item.Metadata.Name), "unknown"),
		"pod-security.kubernetes.io/enforce":         "restricted",
		"pod-security.kubernetes.io/enforce-version": "latest",
		"pod-security.kubernetes.io/audit":           "restricted",
		"pod-security.kubernetes.io/warn":            "restricted",
	}
}

func leaseLabelValue(item *lease) string {
	return sanitizeLabelValue(item.Metadata.Name, "lease-missing")
}

func exposureChanged(status map[string]interface{}, exposure map[string]interface{}) bool {
	for _, key := range []string{"exposurePhase", "previewUrl", "exposureHostname", "message", "credentialsRef"} {
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

func interfaceSlice(value interface{}) []interface{} {
	if values, ok := value.([]interface{}); ok {
		return values
	}
	return nil
}

func stringMap(value interface{}) map[string]string {
	result := map[string]string{}
	switch values := value.(type) {
	case map[string]string:
		return values
	case map[string]interface{}:
		for key, raw := range values {
			if text, ok := raw.(string); ok {
				result[key] = text
			}
		}
	}
	return result
}

func mergeStringMaps(values ...map[string]string) map[string]string {
	result := map[string]string{}
	for _, value := range values {
		for key, item := range value {
			result[key] = item
		}
	}
	return result
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
