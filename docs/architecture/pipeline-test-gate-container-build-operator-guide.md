# Container Build Operator Guide

Status: current

Audience: Buster operators and platform maintainers

## Responsibilities

The operator owns BuildKit, the image registry, credentials, resource limits,
allowed platforms, and allowed build-argument names. Projects cannot change
these controls.

BuildKit is the service that executes container builds. Rootless BuildKit runs
without host root privileges. The registry stores pushed images and serves the
manifest bytes that Buster verifies.

## Host Requirements

Provide:

- Linux host or pod for Buster;
- executable `buildctl` client;
- reachable rootless BuildKit daemon;
- reachable Open Container Initiative registry;
- writable Buster runtime storage;
- registry transport security; and
- DNS that resolves the configured registry reference.

The BuildKit daemon needs network access to base-image registries and the push
registry. The provider process receives only the `container.build` capability.

## Installation

Install BuildKit and the registry with the platform-owned deployment system.
Pin their versions and image digests. Do not download an executable during a
pipeline run.

Install `buildctl` at the configured path. An absolute path is recommended. A
relative path is resolved from the Buster configuration directory. Start the
BuildKit daemon before Buster accepts container-build work.

The repository does not own one universal host installation command. Use the
approved operating-system or Kubernetes procedure for the target environment.

## Complete Configuration

Add `container.build` to `allowedCapabilities`. Add this object to the Buster
remote runtime configuration:

```json
{
  "containerBuild": {
    "buildctlExecutable": "/usr/local/bin/buildctl",
    "buildkitHost": "unix:///run/user/1000/buildkit/buildkitd.sock",
    "registryBaseUrl": "https://registry.kubeclaw.example",
    "registryReference": "registry.kubeclaw.example",
    "repositoryPrefix": "pipeline",
    "allowedPlatforms": ["linux/amd64"],
    "allowedBuildArguments": [],
    "maximumLogBytes": 16777216,
    "maximumExecutionMs": 900000,
    "maximumManifestBytes": 4194304,
    "registryUsernameEnvironmentVariable": "BUSTER_REGISTRY_USERNAME",
    "registryPasswordEnvironmentVariable": "BUSTER_REGISTRY_PASSWORD"
  }
}
```

Read the complete
[configuration reference](pipeline-test-gate-container-build-configuration-reference.md).

## Credentials and TLS

Store credential values in the named environment variables. Do not put values
in the JSON configuration.

Configure both username and password variables, or configure neither. Buster
rejects incomplete credentials.

Authenticated registries require HTTPS outside loopback. Buster rejects
credentials over cleartext remote HTTP.

The BuildKit push and the Buster manifest verification use the same registry
credentials. Buster checks that the registry URL host equals the image
reference host.

## Permissions

Grant Buster read and execute access to `buildctl`. Grant the BuildKit daemon
access to the build context through its configured transport.

Do not grant the provider direct registry credentials. The capability runtime
creates a temporary Docker configuration for the BuildKit client. It removes
that configuration after the attempt.

Keep `allowedBuildArguments` empty by default. Add only reviewed non-secret
metadata names. The provider also rejects names that contain secret terms.

## Capacity and Concurrency

Set `maximumExecutionMs` from measured build duration. Include time for base
image pulls and registry pushes.

Set `maximumLogBytes` high enough for useful diagnostics. Keep the value low
enough to protect Buster memory.

Set `maximumManifestBytes` above expected image-index size. The default example
uses 4 MiB.

Control simultaneous builds with the pipeline concurrency group and BuildKit
worker limits. Monitor disk, memory, CPU, and registry storage before you raise
concurrency.

## Preflight

Complete these checks before you enable the capability:

1. Confirm that `buildctl` exists and is executable.
2. Confirm that the BuildKit address is reachable.
3. Confirm that the registry URL uses the intended host.
4. Confirm that the registry reference uses the same host.
5. Confirm that credentials can push and read one test repository.
6. Confirm that the selected platforms have workers.
7. Confirm that Buster can write its runtime directory.
8. Run the contained contract verification.

Use this repository command for step 8:

```text
npm run verify:test-gate:container-build-cutover
```

## Start and Stop

Start BuildKit and the registry before Buster. Start Buster only after the
preflight checks pass.

Stop new pipeline intake before planned BuildKit maintenance. Allow active
attempts to finish or cancel them through the pipeline control path. Then stop
Buster, BuildKit, and the registry in that order.

## Verification

Run one committed test project that builds a small image. Verify these facts:

- BuildKit reports a pushed image.
- Buster downloads the registry manifest.
- The two digests match.
- Nova receives an immutable image output.
- A dependent node uses the digest reference.
- No legacy `build` suite executes.

The contained Nova pod has no BuildKit daemon. Its contract emulator exercises
the provider, capability checks, registry HTTP verification, result contract,
and gate route. It does not prove host BuildKit setup.

## Monitoring and Evidence

Monitor BuildKit worker saturation, build duration, registry errors, registry
storage, Buster attempt failures, and digest mismatches.

Each attempt stores bounded standard output and standard error. The provider
result stores the image identity, platform, definition identity, and digest.

## Troubleshooting

First identify whether the error comes from project configuration, operator
configuration, BuildKit, or the registry.

Use the [error reference](pipeline-test-gate-container-build-error-reference.md).
Do not retry a digest mismatch until the registry or transport fault is known.

## Upgrade

1. Stop new build intake.
2. Record the current BuildKit and registry versions.
3. Back up required registry data and configuration.
4. Upgrade one component at a time.
5. Repeat the preflight checks.
6. Run one digest-verified test build.
7. Resume intake.

Do not change a versioned provider template in place. Publish a new template
version when its Dockerfile or base-image identity changes.

## Rollback

1. Stop new build intake.
2. Restore the last approved BuildKit or registry version.
3. Restore its matching configuration.
4. Repeat the preflight checks.
5. Run one digest-verified test build.
6. Resume intake.

Do not restore the deleted legacy build suite. Roll back the platform service,
provider version, or project declaration instead.

## Final External Proof

The migration program defers the final external platform proof until every old
suite has one authority path. That proof must use the selected BuildKit daemon,
registry, credentials, service manager, recovery procedure, and rollback
procedure. It must not use the contained emulator.

## Operator Checklist

- [ ] BuildKit and registry versions are pinned.
- [ ] `buildctl` resolves to the approved executable.
- [ ] Registry hosts match.
- [ ] Remote credentials use HTTPS.
- [ ] Platform and argument allowlists are minimal.
- [ ] Resource limits are set.
- [ ] Preflight checks pass.
- [ ] One real build returns a verified digest.
- [ ] Monitoring and evidence are available.
- [ ] Upgrade and rollback procedures are tested.
