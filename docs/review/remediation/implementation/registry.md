# WP01 — Registry, manifest and installer remediation

Implementation for PCR-CONTRACT-PLUGIN-001, PCR-PACKAGES-001,
PCR-REGISTRY-001 and PCR-REGISTRY-002. Baseline product source:
`85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. This record describes local
verification, not deployment, external isolation or live pipeline success.

## Changes

- Every manifest `anyOf` surface requires the nonempty array it tests. An absent
  optional array cannot make an empty package valid. All five standalone
  registration surfaces remain accepted by the original parser.
- Each registry snapshot owns a frozen map of referenced-schema validators.
  Each schema document compiles in its own Ajv namespace, retaining `$id`, local
  references and references to the canonical plugin contract. Identical `$id`
  values in separate package documents deliberately do not conflict or supply
  cross-package references. An unresolved external reference still fails build.
  No mutable referenced-validator cache remains at process scope. The fixed
  canonical protocol validators still use the process-wide canonical Ajv.
- Configuration, default resolution, stage results and observer checkpoints
  explicitly use their snapshot's validators. Later builds cannot replace an
  older snapshot's schema bytes or defaults. Runtime path resolution still
  assumes the original immutable package files remain available; this is not
  a package removal or hot-reload guarantee.
- Installation enumerates all executable registration surfaces and syntax-checks
  every bundled JavaScript/TypeScript file, including transitive and dynamic
  imports, before copying and again before publishing. It never executes the
  files. Existing operator/digest policy, script and node_modules prohibitions,
  and external capability-adapter rejection remain in force. Bundled `.cjs` and
  `.cts` dependencies use CommonJS parsing; entrypoint formats retain the
  existing ESM registration restriction. This is syntax validation, not import
  resolution or runtime export/linkage validation. Invalid unused bundled
  executable files are rejected too.
- The capability-security ambiguity case supplies the existing real
  `artifacts.read` provider before varying `artifacts.write`; all subsequent
  security assertions execute. Capability-runtime setup now retains its actual
  built snapshot instead of discarding it to warm the removed global cache.
  No authorization or lifecycle assertions were removed.

## Before evidence

Historical review evidence remains unchanged in `docs/review/evidence/`:
`registry-schema-reload.mjs`, `plugin-contract-sdk-repro.mjs`,
`install-report-syntax.mjs`, `registry-tests.txt` and `package-install-tests.txt`.
Those reports distinguish original passes from cases never reached.

During this implementation, the original registry-schema-reload reproduction
was rerun from the untouched review checkout: it observed
`REGISTRY_MANIFEST_INVALID` with duplicate `$id` error, as expected.
The original empty-manifest and report-adapter-syntax reproductions also reran
and confirmed acceptance of the defective inputs. The original security gate
reran and failed before its later assertions with missing `artifacts.read`
provider, matching PCR-REGISTRY-002. The new
regression is checked against the actual parser, registry and installer; it
contains no replacement implementations or additional dummy registration to
make a report-only package valid.

## Current verification

Passed locally on Node v24.19.0:

- `node tests/verification/contracts/check-plugin-system-v2-registry-remediation.mjs`:
  four absent/empty manifest combinations rejected, five standalone surfaces
  accepted; repeated discovery/build with `$id`, same snapshot digest, changed
  version/schema isolation, cloned defaults and canonical contract references;
  same-ID peer schemas with distinct contents; all four permitted installation
  surfaces with valid and invalid entrypoint and transitive syntax; no installed
  target after rejection; actual shipped JUnit report-adapter source installed,
  then its corrupted module rejected. The real adapter copy omits its development
  package.json because installer policy intentionally forbids lifecycle scripts.
- Original `check-plugin-system-v2-contracts.mjs`, `check-plugin-system-v2-registry.mjs`,
  `check-plugin-system-v2-installation.mjs`, `check-pipeline-test-provider-registry.mts`,
  `check-pipeline-report-adapter-registry.mts` passed.
- Full `check-plugin-system-v2-capability-security.mjs` passed all 24 capability
  cases; full `check-plugin-system-v2-capability-runtime.mjs` passed.
- The boundary gate's obsolete ban on any root `plugins/` directory now
  recognizes the tracked Codex operations plugin's `.codex-plugin/plugin.json`
  contract while still rejecting root pipeline/OpenClaw registrations and
  non-Codex scaffolding, including negative fixtures. An initial run failed on
  missing generated observer sources; the coordinator ran their canonical sync
  command. The rerun now fails because the stage import policy does not approve
  `@kubeclaw/pipeline-test-gate-contract`, imported by the existing
  `skills/nova/plugins/buster-quality-gate/src/stage.ts`. No complete boundary
  pass is claimed; no runtime-package allowlist was broadened here.
- Plugin-runtime and Nova TypeScript checks and SDK generation `--check` passed. The canonical
  ESLint configuration is used for every changed TypeScript/JavaScript file;
  existing oversized registry helpers were split without suppressing rules.

These claims do not mean the cumulative repository gate, live isolation tests,
remote services, deployment or operator acceptance have passed. Those are
separate integration gates owned by the coordinating task.
