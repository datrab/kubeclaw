# Container Build User Guide

Status: current

Audience: project authors and pipeline maintainers

## Purpose

The container-build test creates one container image. It pushes the image to
the operator registry. It then verifies the image digest from registry bytes.

A digest is a content identifier such as `sha256:abc...`. The digest changes
when the image manifest changes. Consumers must use the digest reference.

Container build does not deploy, start, expose, or test the image. Declare a
separate fixture when a later test needs a running application.

## Smallest Working Declaration

Add this declaration to `.swarm/pipeline.json`:

```json
{
  "suites": {
    "container-build": {
      "uses": "kubeclaw.container-build-suite@1",
      "add": {
        "application-image": {
          "uses": "kubeclaw.container-build@1",
          "mode": "blocking",
          "concurrencyGroup": "container-build",
          "config": {
            "buildContext": ".",
            "definition": {
              "type": "dockerfile",
              "dockerfile": "Dockerfile"
            },
            "outputName": "application",
            "platform": "linux/amd64"
          }
        }
      }
    }
  }
}
```

The project must contain the selected Dockerfile in its committed source. The
operator must allow the selected platform.

## Project Fields

Read the complete
[configuration reference](pipeline-test-gate-container-build-configuration-reference.md).

The main fields are:

- `buildContext`: directory that BuildKit can read during the build.
- `definition`: Dockerfile or installed template selection.
- `outputName`: repository name below the operator registry prefix.
- `platform`: target operating system and CPU architecture.

All project paths are relative to the committed repository. Absolute paths,
parent traversal, and symbolic-link escapes are denied.

## Dockerfile Definition

Use a Dockerfile when the project owns its build procedure:

```json
{
  "buildContext": "services/api",
  "definition": {
    "type": "dockerfile",
    "dockerfile": "services/api/Dockerfile",
    "target": "runtime",
    "buildArgs": {
      "PUBLIC_VERSION": "2026.08.16"
    }
  },
  "outputName": "api",
  "platform": "linux/amd64"
}
```

The operator must approve each build-argument name. Do not put secrets in a
build argument. Build arguments can appear in build metadata and image layers.

## Versioned Template Definition

Use an installed template when the project follows a supported build layout:

```json
{
  "buildContext": ".",
  "definition": {
    "type": "template",
    "template": "node-static@1"
  },
  "outputName": "web",
  "platform": "linux/amd64"
}
```

`node-static@1` installs locked Node dependencies. It runs the project build.
It copies `dist/` into a pinned nginx image. A template change requires a new
template version.

## Gate Behavior

Use `mode: "blocking"` when image creation is required. A failed blocking node
can fail the pipeline gate.

Use `mode: "advisory"` only for an intentional experiment. An advisory failure
remains visible. It cannot fail the gate.

A build passes only after all of these events occur:

1. BuildKit completes the build.
2. BuildKit pushes the image.
3. BuildKit returns a SHA-256 digest.
4. Buster downloads the registry manifest with that digest.
5. Buster hashes the downloaded bytes.
6. The downloaded digest matches the BuildKit digest.

A mutable tag is never authoritative.

## Output

The provider returns one typed output named `image`. The output contains:

- immutable digest reference;
- pushed registry reference;
- image digest;
- platform; and
- Dockerfile or template identity.

Pass the immutable reference to deployment, exposure, health, or deployed-test
nodes. Do not reconstruct a tag from the project name.

## Evidence

Buster stores bounded standard output and standard error for each attempt. The
result also stores the definition identity, platform, registry reference, and
verified digest.

The registry bytes are verified during the attempt. They are not copied into
the test report. The digest records their verified identity.

## Timeout, Cancellation, Retry, and Restart

The node timeout cannot exceed the operator maximum. Cancellation stops the
BuildKit client request and records a cancelled attempt.

The shared test runner controls retries. Each retry creates a separate attempt.
A later successful retry does not delete the failed attempt.

Remote recovery uses the stored plan and attempt records. Duplicate delivery
does not create a second authoritative gate result.

## Disable or Remove the Build

Remove the `container-build` suite declaration to remove the build node. Remove
dependent fixtures or change their image dependency at the same time.

Do not request the deleted legacy suite name `build`. The legacy protocol
rejects that name.

## Local and CI Verification

Validate repository contracts with:

```text
npm run verify:test-gate:container-build-cutover
```

The command verifies the provider, parity ledger, old-path deletion, and sole
authority. A project pipeline still requires an operator BuildKit service and
registry.

## Common Corrections

- Keep the context and Dockerfile inside committed source.
- Select a platform from the operator allowlist.
- Ask the operator to approve a non-secret build-argument name.
- Inspect stored output when BuildKit fails.
- Treat a digest mismatch as an integrity failure.
- Declare deployment and health as separate nodes.

Read the complete [error reference](pipeline-test-gate-container-build-error-reference.md)
for each stable code and correction.

## Migration Result

The old build suite also deployed an image and opened a port. That coupling was
an accepted defect. The old runner and console parser are deleted.

Container build is now the only build authority. Deployment, exposure, and
health remain separate capabilities.
