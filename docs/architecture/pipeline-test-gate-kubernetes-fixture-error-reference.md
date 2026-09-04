# Kubernetes Fixture Error Reference

Status: authoritative error catalogue

Audience: project authors and operators
Purpose: identify stable fixture failures and corrective actions

## Configuration Errors

- `KUBERNETES_FIXTURE_CONFIG_INVALID`: correct the project object type.
- `KUBERNETES_FIXTURE_IMAGE_INVALID`: use one matching immutable image and digest.
- `KUBERNETES_FIXTURE_IMAGE_REQUIRED`: configure or link one immutable image.
- `KUBERNETES_FIXTURE_IMAGE_AMBIGUOUS`: use one image source.
- `KUBERNETES_FIXTURE_NAMESPACE_PREFIX_INVALID`: use a DNS-label prefix with 42 characters or fewer.
- `KUBERNETES_FIXTURE_RETENTION_INVALID`: use a supported mode and bounded lifetime.
- `KUBERNETES_FIXTURE_READINESS_TIMEOUT_INVALID`: use a supported timeout.
- `KUBERNETES_FIXTURE_SECRET_REFERENCES_INVALID`: correct the Secret name list.
- `KUBERNETES_FIXTURE_SERVICE_NAME_INVALID`: use a DNS-label Service name.
- `KUBERNETES_FIXTURE_SERVICE_PORT_INVALID`: use a port from 1 through 65535.
- `KUBERNETES_FIXTURE_SERVICE_TARGET_PORT_INVALID`: use a backend port from 1 through 65535.

## Input Errors

- `KUBERNETES_FIXTURE_INPUT_REQUIRED`: link one checked-manifest artifact.
- `KUBERNETES_FIXTURE_INPUT_UNKNOWN`: remove undeclared inputs.
- `KUBERNETES_FIXTURE_IMAGE_INPUT_INVALID`: link one container-image value.
- `KUBERNETES_FIXTURE_INPUT_MEDIA_TYPE_INVALID`: use the checked-YAML media type.
- `KUBERNETES_FIXTURE_INPUT_METADATA_INVALID`: correct artifact size or digest metadata.
- `KUBERNETES_FIXTURE_INPUT_NOT_FILE`: provide a regular artifact file.
- `KUBERNETES_FIXTURE_INPUT_URL_INVALID`: use a runner-managed local artifact URL.

## Operator Configuration Errors

- `KUBERNETES_FIXTURE_API_GROUP_INVALID`: correct the lease API group.
- `KUBERNETES_FIXTURE_API_VERSION_INVALID`: correct the lease API version.
- `KUBERNETES_FIXTURE_CONTROLLER_NAMESPACE_INVALID`: correct the controller namespace.
- `KUBERNETES_FIXTURE_NAMESPACE_PREFIXES_INVALID`: configure allowed DNS labels.
- `KUBERNETES_FIXTURE_REGISTRY_PREFIXES_INVALID`: configure allowed registry repositories.
- `KUBERNETES_FIXTURE_SECRET_REFERENCES_INVALID`: configure valid approved Secret names.
- `KUBERNETES_FIXTURE_STORAGE_CLASSES_INVALID`: configure valid Kubernetes storage class names.
- `KUBERNETES_FIXTURE_DEFAULT_STORAGE_CLASS_POLICY_INVALID`: configure an explicit boolean default-class policy.
- `KUBERNETES_FIXTURE_PVC_SIZE_LIMIT_INVALID`: configure a positive safe-integer per-claim byte limit.
- `KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_LIMIT_INVALID`: configure an aggregate byte limit at least as large as the per-claim limit.
- `KUBERNETES_FIXTURE_SUBJECT_INVALID`: configure valid namespace and ServiceAccount names.
- `KUBERNETES_FIXTURE_POLL_INTERVAL_INVALID`: configure 50 through 10000 milliseconds.

## Capability Request Errors

- `KUBERNETES_FIXTURE_CAPABILITY_REQUEST_INVALID`: correct the capability identity.
- `KUBERNETES_FIXTURE_OPERATION_INVALID`: use prepare or release.
- `KUBERNETES_FIXTURE_REQUEST_INVALID`: correct the named request field.
- `KUBERNETES_FIXTURE_LEASE_NAME_INVALID`: use the generated lease name.
- `KUBERNETES_FIXTURE_NAMESPACE_NAME_INVALID`: use the generated namespace name.
- `KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED`: select an allowed prefix.
- `KUBERNETES_FIXTURE_IMAGE_DENIED`: select an allowed local-registry repository.
- `KUBERNETES_FIXTURE_IMAGE_DIGEST_INVALID`: make both image digests match.
- `KUBERNETES_FIXTURE_RETENTION_MODE_INVALID`: use delete or retain.
- `KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED`: request an approved test Secret.
- `KUBERNETES_FIXTURE_TEST_CREDENTIALS_INVALID`: request one generated credential Secret with a valid name.
- `KUBERNETES_FIXTURE_CREATED_AT_INVALID`: inspect the lease creation timestamp.

## Manifest Errors

- `KUBERNETES_FIXTURE_MANIFEST_PATH_INVALID`: provide an absolute managed path.
- `KUBERNETES_FIXTURE_MANIFEST_PATH_DENIED`: keep the path inside the run root.
- `KUBERNETES_FIXTURE_MANIFEST_NOT_FILE`: provide a regular manifest file.
- `KUBERNETES_FIXTURE_MANIFEST_SIZE_INVALID`: reduce the manifest size.
- `KUBERNETES_FIXTURE_MANIFEST_READ_INCOMPLETE`: replace the unstable file.
- `KUBERNETES_FIXTURE_MANIFEST_CHANGED`: stop changing the checked artifact.
- `KUBERNETES_FIXTURE_MANIFEST_DIGEST_INVALID`: provide a SHA-256 digest.
- `KUBERNETES_FIXTURE_MANIFEST_DIGEST_MISMATCH`: use the checked artifact bytes.
- `KUBERNETES_FIXTURE_MANIFEST_PARSE_FAILED`: correct the YAML syntax.
- `KUBERNETES_FIXTURE_MANIFEST_LIST_INVALID`: provide valid List items.
- `KUBERNETES_FIXTURE_RESOURCE_COUNT_INVALID`: reduce or add resources.
- `KUBERNETES_FIXTURE_CLUSTER_SCOPE_DENIED`: remove cluster-scoped resources.
- `KUBERNETES_FIXTURE_RESOURCE_KIND_DENIED`: use an approved namespaced resource kind.
- `KUBERNETES_FIXTURE_NAMESPACE_FIELD_DENIED`: remove explicit namespaces.
- `KUBERNETES_FIXTURE_DEFAULT_STORAGE_CLASS_DENIED`: select an approved storage class instead of the cluster default.
- `KUBERNETES_FIXTURE_STORAGE_CLASS_DENIED`: select an operator-approved storage class.
- `KUBERNETES_FIXTURE_STORAGE_QUANTITY_INVALID`: request a positive, whole-byte Kubernetes storage quantity.
- `KUBERNETES_FIXTURE_PVC_SIZE_DENIED`: reduce the individual persistent-volume claim request.
- `KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_DENIED`: reduce aggregate persistent-volume claim requests.
- `KUBERNETES_FIXTURE_PVC_SOURCE_DENIED`: remove pre-binding, selectors, and cross-resource data sources.
- `KUBERNETES_FIXTURE_PVC_VOLUME_MODE_DENIED`: use the filesystem volume mode.
- `KUBERNETES_FIXTURE_PVC_TEMPLATES_INVALID`: provide a valid StatefulSet volume-claim-template list.
- `KUBERNETES_FIXTURE_STATEFULSET_REPLICAS_INVALID`: use a non-negative safe-integer replica count.
- `KUBERNETES_FIXTURE_CONTAINERS_INVALID`: correct the pod container list.
- `KUBERNETES_FIXTURE_MUTABLE_IMAGE_DENIED`: use immutable images.
- `KUBERNETES_FIXTURE_IMAGE_REGISTRY_DENIED`: use an approved image repository for every container.
- `KUBERNETES_FIXTURE_IMAGE_NOT_USED`: use the selected image in a workload.
- `KUBERNETES_FIXTURE_WORKLOAD_REQUIRED`: add a namespaced workload.
- `KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED`: use an internal ClusterIP Service.
- `KUBERNETES_FIXTURE_HOST_NAMESPACE_DENIED`: remove host network, PID, and IPC access.
- `KUBERNETES_FIXTURE_HOST_PATH_DENIED`: remove hostPath volumes.
- `KUBERNETES_FIXTURE_GENERIC_EPHEMERAL_VOLUME_DENIED`: use an explicitly bounded PersistentVolumeClaim instead.
- `KUBERNETES_FIXTURE_HOST_PORT_DENIED`: remove host ports.
- `KUBERNETES_FIXTURE_RUN_AS_NON_ROOT_REQUIRED`: set pod and container non-root controls.
- `KUBERNETES_FIXTURE_SECCOMP_REQUIRED`: set a supported seccomp profile.
- `KUBERNETES_FIXTURE_CONTAINER_SECURITY_INVALID`: remove privilege and privilege escalation.
- `KUBERNETES_FIXTURE_CAPABILITY_DROP_REQUIRED`: drop all Linux capabilities.

## Kubernetes Errors

- `KUBERNETES_FIXTURE_RBAC_DENIED`: correct lease-client or controller RBAC.
- `KUBERNETES_FIXTURE_KUBECTL_FAILED`: inspect the attached Kubernetes error.
- `KUBERNETES_FIXTURE_KUBECTL_OUTPUT_LIMIT`: reduce command output.
- `KUBERNETES_FIXTURE_LEASE_TIMEOUT`: inspect the namespace controller.
- `KUBERNETES_FIXTURE_LEASE_FAILED`: inspect the lease status message.
- `KUBERNETES_FIXTURE_LEASE_REJECTED`: correct the lease request.
- `KUBERNETES_FIXTURE_NAMESPACE_MISMATCH`: inspect controller normalization.
- `KUBERNETES_FIXTURE_READINESS_TIMEOUT`: inspect pods and events.
- `KUBERNETES_FIXTURE_SERVICE_PORT_MISMATCH`: expose the configured Service port.
- `KUBERNETES_FIXTURE_SERVICE_REQUIRED`: include exactly one Service with the configured name.
- `KUBERNETES_FIXTURE_SERVICE_DUPLICATE`: remove the duplicate Service with the configured name.
- `KUBERNETES_FIXTURE_SERVICE_TARGET_PORT_MISMATCH`: make the selected Service port resolve to one numeric backend container port. If `serviceTargetPort` is set, it must match that port.
- `KUBERNETES_FIXTURE_SERVICE_READINESS_TIMEOUT`: inspect the Service endpoints.
- `KUBERNETES_FIXTURE_CANCELLED`: inspect the pipeline cancellation.
- `KUBERNETES_FIXTURE_PREPARATION_FAILED`: inspect the capability result.
- `KUBERNETES_FIXTURE_RELEASE_FAILED`: inspect the lease release result and controller events.
- `TEST_PROVIDER_FIXTURE_CLEANUP_REQUIRED`: implement provider cleanup.
