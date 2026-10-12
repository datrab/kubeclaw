# Registry ownership

This directory owns the canonical `pipeline-plugin-v2` registry substrate:

- operator-controlled installation roots and trust policy
- inert `plugin.json` discovery without executable imports
- canonical real paths, package digests, provenance, and trust evidence
- manifest, referenced-schema, module-path, and package-completeness validation
- globally unique package IDs, registration IDs, and stage-type ownership
- observer subscription and adapter-provider indexes
- independently selectable test-provider registrations and contract indexes
- independently selectable report-adapter registrations and format indexes
- test-provider configuration-schema digests and validation
- a deterministic registry snapshot digest for resolved test plans
- registration-specific grant resolution and provider selection
- registration-owned configuration validation
- deeply frozen registry snapshots
- integrity revalidation and permission-bounded side-effect auditing before
  trusted host imports
- fail-closed activation

The registry does not schedule stages, interpret plugin configuration, grant
capabilities, or commit lifecycle transitions.

## Authority boundary

`pipeline-platform.v2` is operator-owned. It may select installation roots,
trusted roots, package digests or attestations, capability providers, grants,
adapter configuration, and observer configuration.

`pipeline-definition.v2` is project/pipeline-owned. It may select installed
stage types and provide configuration accepted by those registrations. It
cannot install code, add roots, establish trust, select providers, or expand
grants.

## Startup sequence

1. Canonicalize installation and trusted roots and reject aliases.
2. Parse inert manifests and compute trusted package provenance.
3. Validate every registration and referenced file, then freeze the complete
   registry.
4. Resolve all enabled registrations, required grants, and exactly selected
   providers.
5. Validate stage, observer, and adapter configuration through registration
   schemas.
6. Recompute package digests, audit trusted imports in a Node permission
   boundary with filesystem writes, subprocesses, workers, and native addons
   denied plus explicit network, timer, and process-global guards, then
   recompute digests.
7. Import enabled registrations. Adapter instances then start through the
   transactional adapter runtime, including readiness and rollback.

Any failure aborts startup. Discovery never imports executable registration
modules, and activation never returns a partial registry.

More than one installed report adapter can support one report format. The
registry preserves all candidates. A resolved plan must select one exact
package, registration, contract version, and content digest. Discovery order
never selects the adapter.

## Schema lifetime and consumers

Nova runtime preparation and Buster production use this registry. Nova activates
stages, observers and capability adapters; Buster's separate isolated loaders
execute test providers and report adapters.

Referenced validators belong to each immutable registry snapshot. Builds retain
schema `$id` values and compile each document in its own namespace, including
canonical contract references. Same-ID documents in separate packages are
independent; arbitrary cross-package `$ref` resolution is not supported.
Configuration, defaults, result and checkpoint validation use the owning
snapshot. Rebuilding does not replace prior validators. Runtime path resolution
still requires the original immutable package files to remain available.
