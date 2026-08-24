# Kubernetes Fixture Configuration Reference

Status: authoritative field reference

Audience: project authors and operators
Purpose: define every fixture configuration field

## Project Fields

### `image.reference`

Required when the `image` input is absent. Set an immutable local-registry image reference. End the value with
`@sha256:` and 64 lowercase hexadecimal characters.

### `image.digest`

Required when `image.reference` is present. Set its SHA-256 digest. The two values must
match.

### `serviceName`

Required. Set the Kubernetes Service DNS label.

### `servicePort`

Required. Set an integer from 1 through 65535.

### `namespacePrefix`

Optional. The default is `test`. Use a DNS-label prefix with 42 characters or
fewer. The operator must allow the selected prefix.

### `retention.mode`

Optional. Use `delete` or `retain`. The default is `delete`.

### `retention.seconds`

Optional. Set an integer from 60 through 604800. The default is 1800.

The operator maximum can reduce this range.

### `readinessTimeoutSeconds`

Optional. Set an integer from 1 through 3600. The default is 120.

### `secretReferences`

Optional. Set up to 32 unique test Secret names. The operator must approve each
name. The broker copies only approved Secrets. The fixture does not read their values.

### `testCredentials.mode`

Optional. Use `generate`. The broker creates one dedicated preview credential
Secret before it starts the workload. The Secret contains only a generated
username and password.

### `testCredentials.secretName`

Required when `testCredentials.mode` is present. Set the DNS name of the
dedicated preview credential Secret. The workload can mount this Secret. Nova
can read this exact Secret for private delivery to the user.

## Input Port

`image` is optional when project fields supply the image. It consumes
`kubeclaw.container-image@1`. Do not configure both image sources.

`checked-manifest` is required. It must use media type
`application/vnd.kubeclaw.checked-kubernetes-yaml`.

## Output Port

`deployment` is required. It uses schema
`kubeclaw.kubernetes-deployment-fixture@1`.

## Operator Fields

### `kubectlExecutable`

Set the absolute path to the trusted `kubectl` executable.

### `controllerNamespace`

Set the namespace that contains BusterNamespaceLease resources.

### `leaseApiGroup`

Set the installed lease API group.

### `leaseApiVersion`

Set the installed lease API version.

### `allowedNamespacePrefixes`

Set one or more allowed DNS-label prefixes. Each prefix can contain up to 42
characters.

### `allowedRegistryPrefixes`

Set one or more allowed local-registry repository prefixes.

### `allowedSecretReferences`

Set the approved test Secret names. An empty list denies all Secret copying.

### `maximumManifestBytes`

Set the maximum checked-manifest size.

### `maximumResources`

Set the maximum number of YAML resources.

### `maximumRetentionSeconds`

Set the maximum lease lifetime.

### `maximumExecutionMs`

Set the maximum capability execution time.

### `pollIntervalMs`

Optional. Set the lease and pod polling interval. Use 50 through 10000
milliseconds.
