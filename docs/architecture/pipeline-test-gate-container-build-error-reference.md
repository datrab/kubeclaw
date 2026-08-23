# Container Build Error Reference

Status: current

The effect column states whether Buster rejects startup or fails one attempt.
Attempt errors appear in the provider result and stored logs. Startup errors
appear in Buster service logs.

| Code | Cause | Effect | Correction | Retry | Evidence |
| --- | --- | --- | --- | --- | --- |
| `BUSTER_CONTAINER_BUILD_CONFIG_REQUIRED` | The capability is allowed without operator configuration. | Buster startup fails. | Add `containerBuild` or remove the capability. | Restart after correction. | Service log. |
| `BUSTER_CONTAINER_BUILD_REGISTRY_CREDENTIALS_INCOMPLETE` | Only one credential variable has a value. | Buster startup fails. | Set both values or remove both names. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_CONFIG_INVALID` | Project configuration is not an object. | The attempt fails before BuildKit. | Use the documented JSON object. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_DEFINITION_INVALID` | The definition type is missing or unknown. | The attempt fails before BuildKit. | Select `dockerfile` or `template`. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_TEMPLATE_UNKNOWN` | The template is not installed. | The attempt fails before BuildKit. | Select an installed versioned template. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_TARGET_INVALID` | The Dockerfile target name is invalid. | The attempt fails before BuildKit. | Use a safe stage name. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_OUTPUT_NAME_INVALID` | The output repository name is invalid. | The attempt fails before BuildKit. | Use a lowercase safe name. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_PLATFORM_INVALID` | The project platform syntax is invalid. | The attempt fails before BuildKit. | Use a value such as `linux/amd64`. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_PLATFORM_DENIED` | The operator did not allow the platform. | The attempt fails. | Select an allowed platform or change operator policy. | Retry after correction. | Attempt result. |
| `CONTAINER_BUILD_PLATFORMS_INVALID` | The operator platform list is empty or invalid. | Capability startup fails. | Add at least one valid platform. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_ARGUMENT_INVALID` | A project argument name or value is invalid. | The attempt fails before BuildKit. | Use a safe non-secret name and bounded string value. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_ARGUMENTS_INVALID` | The capability request has invalid arguments. | The attempt fails. | Fix provider and capability contract versions. | Do not retry unchanged input. | Attempt result. |
| `CONTAINER_BUILD_ARGUMENT_DENIED` | The operator did not allow an argument name. | The attempt fails. | Remove the argument or approve its non-secret name. | Retry after correction. | Attempt result. |
| `CONTAINER_BUILD_ARGUMENT_ALLOWLIST_INVALID` | The operator argument list is invalid or duplicated. | Capability startup fails. | Use unique safe names and no more than 32 entries. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_PATH_INVALID` | A path is empty, absolute when relative is required, or malformed. | Startup or the attempt fails. | Use the required path form. | Retry after correction. | Service log or attempt result. |
| `CONTAINER_BUILD_PATH_ESCAPE` | A project path contains parent traversal. | The attempt fails before BuildKit. | Keep the path inside committed source. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_SYMLINK_DENIED` | A project symbolic link leaves the repository. | The attempt fails before BuildKit. | Replace the link with contained source. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_PATH_DENIED` | A capability path leaves its allowed root. | The attempt fails. | Fix the provider workspace contract. | Do not retry unchanged input. | Attempt result. |
| `CONTAINER_BUILD_PATH_TYPE_INVALID` | A required file is a directory, or a directory is a file. | The attempt fails. | Correct the selected path type. | Retry after correction. | Attempt result. |
| `CONTAINER_BUILD_CONTEXT_NOT_DIRECTORY` | `buildContext` is not a directory. | The attempt fails before BuildKit. | Select a committed directory. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_DOCKERFILE_NOT_FILE` | The Dockerfile path is not a file. | The attempt fails before BuildKit. | Select a committed Dockerfile. | Retry after a commit change. | Attempt result. |
| `CONTAINER_BUILD_CONTEXT_OUTSIDE_REPOSITORY` | The capability context is outside the repository. | The attempt fails. | Fix the provider workspace contract. | Do not retry unchanged input. | Attempt result. |
| `CONTAINER_BUILD_DOCKERFILE_OUTSIDE_PROVIDER_ROOTS` | The Dockerfile is outside repository and scratch roots. | The attempt fails. | Use project source or an installed template. | Retry after correction. | Attempt result. |
| `CONTAINER_BUILD_DEFINITION_IDENTITY_INVALID` | The immutable build-definition identity is invalid. | The attempt fails. | Fix the provider package or contract version. | Do not retry unchanged input. | Attempt result. |
| `CONTAINER_BUILD_CAPABILITY_REQUEST_INVALID` | The provider requested an unsupported operation or resource. | The attempt fails. | Fix provider installation and version lock. | Do not retry unchanged input. | Attempt result. |
| `CONTAINER_BUILD_BUILDKIT_HOST_INVALID` | The BuildKit address is empty or malformed. | Capability startup fails. | Configure a valid daemon address. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_URL_INVALID` | The registry URL has invalid protocol, credentials, or path. | Capability startup fails. | Use one HTTP or HTTPS origin without embedded credentials. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_REFERENCE_INVALID` | The image registry host is invalid. | Capability startup fails. | Use a valid host and optional port. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_ENDPOINT_MISMATCH` | Registry URL and image-reference hosts differ. | Capability startup fails. | Configure the same host in both fields. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REPOSITORY_PREFIX_INVALID` | The operator repository prefix is invalid. | Capability startup fails. | Use a lowercase repository path. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_CREDENTIALS_INCOMPLETE` | The runtime received only one credential value. | Capability startup fails. | Supply both values or neither. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_CREDENTIALS_REQUIRE_TLS` | Remote credentials use cleartext HTTP. | Capability startup fails. | Configure HTTPS. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_REGISTRY_READ_FAILED` | Registry manifest download returned an error status. | The attempt fails verification. | Check registry access, credentials, and manifest availability. | Retry after infrastructure correction. | Attempt result and logs. |
| `CONTAINER_BUILD_REGISTRY_MANIFEST_TOO_LARGE` | Registry bytes exceed the operator limit. | The attempt fails verification. | Inspect the response or raise the reviewed limit. | Retry after correction. | Attempt result. |
| `CONTAINER_BUILD_REGISTRY_MANIFEST_SIZE_INVALID` | The registry returned no usable manifest body. | The attempt fails verification. | Correct registry or proxy behavior. | Retry after infrastructure correction. | Attempt result. |
| `CONTAINER_BUILD_REGISTRY_DIGEST_MISMATCH` | Registry bytes do not match the expected digest. | The attempt fails integrity verification. | Investigate registry, proxy, and transport integrity. | Do not retry until the cause is known. | Attempt result. |
| `CONTAINER_BUILD_DIGEST_MISSING` | BuildKit metadata has no valid image digest. | The attempt fails. | Inspect BuildKit output and exporter configuration. | Retry after infrastructure correction. | Attempt result and logs. |
| `CONTAINER_BUILD_LIMIT_INVALID` | Attempt limits are missing or outside operator ceilings. | The attempt fails. | Use positive bounded limits. | Retry after configuration correction. | Attempt result. |
| `CONTAINER_BUILD_LOG_LIMIT_INVALID` | The operator log limit is invalid. | Capability startup fails. | Set a positive safe integer. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_TIME_LIMIT_INVALID` | The operator time limit is invalid. | Capability startup fails. | Set a positive safe integer. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_MANIFEST_LIMIT_INVALID` | The operator manifest limit is invalid. | Capability startup fails. | Set a positive safe integer. | Restart after correction. | Service log. |
| `CONTAINER_BUILD_CANCELLED` | Nova or the runner cancelled the attempt. | The attempt records cancellation. | Inspect the cancellation source. | Retry only when policy requests it. | Attempt result and event record. |
| `CONTAINER_BUILD_FAILED` | BuildKit or an unclassified runtime operation failed. | The attempt fails. | Inspect stored standard output and standard error. | Retry after the cause is corrected. | Attempt result and logs. |

## Escalation

Escalate a repeated digest mismatch, capability-contract error, or path-boundary
error. Include the attempt identifier, provider version, error code, and bounded
logs. Do not include registry credential values.
