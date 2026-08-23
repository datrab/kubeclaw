# Container Build Configuration Reference

Status: current

This reference defines project-owned and operator-owned fields. A project
cannot override an operator field.

## Project Fields

### `buildContext`

- Owner: project.
- Type: repository-relative path.
- Required: yes.
- Default: none.
- Limit: 1 to 1,024 characters.
- Meaning: directory that BuildKit receives as the build context.
- Failure: invalid, escaped, missing, or non-directory paths fail the attempt.

### `definition.type`

- Owner: project.
- Type: `dockerfile` or `template`.
- Required: yes.
- Default: none.
- Meaning: selects a project Dockerfile or installed template.
- Failure: an unknown value fails configuration validation.

### `definition.dockerfile`

- Owner: project.
- Type: repository-relative path.
- Required: for `dockerfile`.
- Default: none.
- Limit: 1 to 1,024 characters.
- Meaning: Dockerfile path in committed source.
- Failure: escaped, symbolic-link, missing, or non-file paths fail the attempt.

### `definition.target`

- Owner: project.
- Type: target-stage name.
- Required: no.
- Default: final Dockerfile stage.
- Limit: 1 to 128 safe name characters.
- Meaning: selects one named Dockerfile stage.
- Failure: an invalid name fails configuration validation.

### `definition.buildArgs`

- Owner: project and operator.
- Type: string map.
- Required: no.
- Default: empty map.
- Limit: 32 names and 4,096 characters per value.
- Meaning: supplies reviewed non-secret Dockerfile build arguments.
- Security: the operator must allow each exact name.
- Failure: invalid, protected, or unapproved names fail the attempt.

### `definition.template`

- Owner: project selects; provider package installs.
- Type: versioned template identifier.
- Required: for `template`.
- Default: none.
- Allowed value: `node-static@1`.
- Meaning: selects an immutable provider Dockerfile.
- Failure: an unknown template fails configuration validation.

### `outputName`

- Owner: project.
- Type: safe repository name.
- Required: no.
- Default: normalized module or node identifier.
- Limit: 1 to 128 characters.
- Meaning: repository name below the operator prefix.
- Failure: an invalid name fails configuration validation.

### `platform`

- Owner: project selects; operator allows.
- Type: Open Container Initiative platform string.
- Required: no.
- Default: `linux/amd64`.
- Limit: 64 characters.
- Meaning: target operating system and CPU architecture.
- Failure: invalid or unapproved platforms fail the attempt.

## Project Example

```json
{
  "buildContext": ".",
  "definition": {
    "type": "dockerfile",
    "dockerfile": "Dockerfile"
  },
  "outputName": "application",
  "platform": "linux/amd64"
}
```

## Operator Fields

All operator fields are below `containerBuild` in the Buster remote runtime
configuration.

### `buildctlExecutable`

- Type: path, resolved from the configuration directory.
- Required: yes.
- Default: none.
- Meaning: executable BuildKit client.
- Failure: missing or non-executable files prevent capability startup.

### `buildkitHost`

- Type: BuildKit address string.
- Required: yes.
- Default: none.
- Meaning: address passed to `buildctl --addr`.
- Failure: an empty or invalid value prevents capability startup.

### `registryBaseUrl`

- Type: HTTP or HTTPS URL without a path or embedded credentials.
- Required: yes.
- Default: none.
- Meaning: registry endpoint used for manifest verification.
- Failure: invalid URLs prevent capability startup.

### `registryReference`

- Type: registry host with optional port.
- Required: yes.
- Default: none.
- Meaning: registry host used in pushed image references.
- Failure: it must equal the host in `registryBaseUrl`.

### `repositoryPrefix`

- Type: lowercase repository path.
- Required: yes.
- Default: none.
- Meaning: operator namespace for pipeline images.
- Failure: an invalid path prevents capability startup.

### `allowedPlatforms`

- Type: non-empty string array.
- Required: yes.
- Default: none.
- Meaning: platforms that projects can select.
- Failure: invalid configuration prevents startup; denied selection fails the attempt.

### `allowedBuildArguments`

- Type: unique string array.
- Required: no.
- Default: empty array.
- Limit: 32 names.
- Meaning: exact non-secret build-argument names projects can use.
- Failure: invalid configuration prevents startup; denied selection fails the attempt.

### `maximumLogBytes`

- Type: positive safe integer.
- Required: yes.
- Default: none.
- Meaning: maximum buffered BuildKit output per attempt.
- Failure: invalid values prevent capability startup.

### `maximumExecutionMs`

- Type: positive safe integer.
- Required: yes.
- Default: none.
- Meaning: operator ceiling for one BuildKit request.
- Failure: invalid values prevent capability startup.

### `maximumManifestBytes`

- Type: positive safe integer.
- Required: yes.
- Default: none.
- Meaning: maximum registry manifest response size.
- Failure: oversized responses fail verification.

### `registryUsernameEnvironmentVariable`

- Type: environment-variable name.
- Required: with registry password.
- Default: no registry authentication.
- Meaning: identifies the environment variable that stores the username.
- Security: the configuration stores the name, not the credential value.

### `registryPasswordEnvironmentVariable`

- Type: environment-variable name.
- Required: with registry username.
- Default: no registry authentication.
- Meaning: identifies the environment variable that stores the password.
- Security: authenticated remote registries require HTTPS.

## Operator Example

```json
{
  "buildctlExecutable": "/usr/local/bin/buildctl",
  "buildkitHost": "unix:///run/user/1000/buildkit/buildkitd.sock",
  "registryBaseUrl": "https://registry.kubeclaw.example",
  "registryReference": "registry.kubeclaw.example",
  "repositoryPrefix": "pipeline",
  "allowedPlatforms": ["linux/amd64"],
  "allowedBuildArguments": ["PUBLIC_VERSION"],
  "maximumLogBytes": 16777216,
  "maximumExecutionMs": 900000,
  "maximumManifestBytes": 4194304,
  "registryUsernameEnvironmentVariable": "BUSTER_REGISTRY_USERNAME",
  "registryPasswordEnvironmentVariable": "BUSTER_REGISTRY_PASSWORD"
}
```
