# Studio configuration migration: preimplementation contract

Status: implementation and bounded host checks complete; fresh independent review
and real image execution remain pending. This slice belongs to CONFIG F1–F5 and F-DOC;
it does not close the cross-role inventory or physical capacity criterion F6.

## Original preimplementation contract

At contract declaration, the [Studio loader](../../../../skills/prism/server/studio-config.ts)
authored three operator settings through environment variables and local defaults.
The [production entrypoint](../../../../skills/prism/server/studio.ts) loads once
before opening the listener. The existing shared
[swarm loader](../../../../skills/common/plugin-runtime/foundation/config/swarm.ts)
validates the whole authored document and freezes its selected settings. Extend
that path rather than introduce a Studio-only document, default or fallback.

| Current source | Classification and intended authority | Actual consumer |
| --- | --- | --- |
| `PORT`, default 8080 | Required `operator.prism.studio.port`, integer 1–65535 | Actual HTTP listener, rendered container port, probes, Service target and corresponding network policy |
| `PRISM_CONTROL_TIMEOUT_MS`, default 30000 | Required `operator.prism.studio.controlTimeoutMs`, integer milliseconds 1–2147483647 | Existing proxy deadline spanning headers and body; preserve disconnect/timeout behavior |
| `PRISM_CONTROL_URL`, default `http://prism-control:8080` | Required `operator.prism.studio.controlUrl`, validated absolute HTTP(S) endpoint | Existing proxy's upstream URL resolution; author endpoint changes must affect actual requests |
| `STUDIO_ROOT`, default module-relative `../dist-studio` | Packaged asset location, not an operator performance/network setting; preserve real asset delivery and settle its installation contract before removing this override | Static file selection, containment checks and SPA fallback |
| `PRISM_INGRESS_SECRET`, default empty string | Secret material remains external; do not place its value in swarm, reports or rendered effective settings | Existing replacement of untrusted client ingress header on Control requests |

Reject the three migrated environment authors, including empty or same-value
strings. `PORT` rejection must be role-specific: other roles still use it. The
existing `STUDIO_ROOT` behavior cannot simply disappear without migrating the
packaged-service tests and image installation layout. Any decision to retain an
installation override must be explicitly classified, documented and checked for
its actual consumers; it must not conceal a second operator settings file.

## Delivery scope

The [Studio image](../../../../docker/Dockerfile.prism-studio) currently ships only
the server and static assets and runs the original service test in the build.
Importing the shared loader additionally requires its actual schema and runtime
Ajv dependencies in the final image at the path used by the installed import.
Copying a loader in a unit fixture is not proof of this image delivery.

Update the existing canonical author, shared types/schema/loader, generated Prism
chart inputs and render validation together. Deliver the same mounted author and
checksum rollout trigger to Studio, then bind its listener, probes, Service and
ingress policy to the authored port. Preserve stable public Service discovery
ports. Remove the image's and chart's competing listener/Control environment
authors. Do not silently rewrite arbitrary external upstreams into the existing
in-cluster egress grant: document supported topology and test the actual render.

Extend the existing built-image gate to exercise the shipped Studio loader with
the real image environment. Keep the original packaged HTTP service acceptance
gate. This is an addition to the existing Control/Worker delivery proofs, not a
replacement or a claim that a source test built an image.

## Required cases fixed before implementation

| ID | Required evidence |
| --- | --- |
| CS01 | Canonical document and a second complete authored profile load through the production entrypoint; every one of the three differing settings reaches its actual listener/proxy consumer. |
| CS02 | Missing/unknown Studio keys, wrong types, nulls, fractional/out-of-range numbers and invalid/non-HTTP(S) upstream URLs fail before listener activation. Preserve all existing whole-document validation. |
| CS03 | Each removed environment author, including empty and same-value strings, is rejected. Other role-specific `PORT` contracts remain valid. |
| CS04 | After startup, changing the source file does not change the running process snapshot. A new startup consumes the new valid document; invalid startup does not expose a ready listener. |
| CS05 | Run the complete original `studio-service.test.mts` with all assertions and deadlines intact: errors, cookies/status/UTF-8, forwarding/idempotency, headers/body deadlines, disconnects and continued static/health serving. Adapt configuration delivery only; do not substitute a copied former service. Run the remaining original Studio proxy/flow/adapter/roundtrip tests too. |
| CS06 | Normal Helm render with both complete profiles delivers the exact author, checksum, volume and all affected listener/probe/Service/network-policy references. Wrong types, unknown keys and competing Helm authors reject before any partial render is accepted. |
| CS07 | Final image contains the real shared loader/schema/dependency closure. Its shipped environment passes; each stale author fails visibly. Run the original packaged service tests against the installed production layout. Actual image build/run evidence remains separate from source checks. |
| CS08 | Mutation checks catch a restored local fallback, an environment override and a hardcoded consumer port/timeout/upstream. Keep all failures and source identities. |
| CS-DOC | Update operator instructions, installation/asset contract, image checks and obsolete examples; document units, URL/topology support, secret separation, rejection errors and rollout behavior. Check links and generated configuration drift. |

A fresh nonauthor must review the full production and image/Helm cutover, original
test preservation, source-bound results and documentation. Live rollout remains
separate; this contract authorizes no deployment or external upstream access.

## Implementation checkpoint

The three Studio settings now use the canonical swarm author and shared loader.
`STUDIO_ROOT` remains an explicit installation/test asset-path override with the
same module-relative default; `PRISM_INGRESS_SECRET` remains an external Secret.
The upstream setting is an HTTP(S) origin, optionally ending in `/`, without
credentials, path prefix, query, fragment, backslash or ASCII control characters.
Standalone Studio may use another origin; Helm accepts only the release's Prism
Control HTTP Service on port 8080, consistent with its existing egress grant.

The image now uses the repository-relative server layout and copies Ajv plus its
four actual dependency packages instead of all workspace dependencies. The
canonical author is a read-only build-test input, not a baked fallback. The
built-image dispatcher now has an explicit Studio loader case. No actual Docker
build or execution is claimed: the local `docker version` attempt reports that
Docker is unavailable.

Initial source validation passed 291 tests with no skips or cancellations,
including all seven original actual Studio HTTP cases and two added live timeout
and startup-snapshot profiles. The first fixture-path failure remains recorded.
An independent root probe then found that a backslash in an upstream URL could
be normalized into a path. That initial checkpoint was not final acceptance:
raw-character/schema and parsed-URL checks were corrected, and new backslash /
control-character regressions passed. The final bounded host rerun below supersedes that checkpoint; fresh review
remains required.

Four private loader mutations (retired-env acceptance and hardcoded listener,
timeout and upstream) produced intended assertion failures. No production file
was mutated for those controls. Canonical lint initially exposed an existing
complexity violation in `validateBusterPreparationSettings`; with root approval,
its unchanged source-reservation block was extracted into a private helper.
The Buster author subsequently reran its maintained 14-case preparation gate and plugin-runtime typecheck on this helper extraction; both passed. Final Studio lint passed, as recorded below.

A separate documentation finding was corrected in the operator guide: pipeline
preference identity previously described retired Helm/environment authors. It
now points to `operator.prism.control.pipelinePreferenceSubject`, the `null`
default and explicit rejection of the old authors. This is a legacy-documentation
correction, not a new Control runtime change.

The broader subsequent run recorded 345 cases: 340 passed and five failed. One
new canonical-profile startup hit an existing host listener on port 8080; that
listener was not modified. With root approval, the unchanged canonical case is
now a separate maintained `studio-canonical-image.mts`, mandatory in both the
Docker build acceptance step and the built-image dispatcher. It is not skipped
or environment-disabled. CS01's exact canonical startup and CS07's real image
execution remain open until that isolated gate actually runs. The host suite
retains all seven original cases and the additional behavioral profiles.

The other four failures were actual Buster binding failures in the complete
release-image/GitOps suites and were handed to their author for integration
repair; they remain recorded, not counted as passed. Deployment truth also found
an obsolete Control listener regex, which was updated to require the authored
backend port while preserving the SPIFFE port distinction, then stopped on a
separate Buster image CLI assertion. Its repair belongs to the Buster integration
work and is not disguised as a successful full deployment check here.

The shared HTTP fixture extraction preserves all seven original test bodies,
assertions and deadlines byte-for-byte and as TypeScript AST nodes. The exact
comparison is recorded in `original-cases.json` under this slice's evidence.


## Final bounded author handoff

The final maintained host run passed **337/337**, with zero failures, skips or
cancellations. Prism typecheck, canonical lint for every changed TypeScript /
JavaScript source and test (including the extracted fixture and canonical image
case), and Helm lint all exited zero. Recorded before/after hashes show no source
drift during this run. This final command intentionally lists the Studio/Control
configuration, original proxy/flow/adapter/roundtrip, Helm and release-config
modules; the complete release-images/GitOps failures from the earlier broad run
remain assigned to their Buster integration author and are not counted here.

The independent review handoff manifest is
[source-identities.json](../../evidence/config-studio-20260921/source-identities.json);
[final commands and hashes](../../evidence/config-studio-20260921/studio-final-commands.json)
bind the tests to their source. Original-case byte/AST equivalence and retained
negative-control logs are in the same evidence directory. No Docker image or
live deployment was built or run. The mandatory isolated canonical-port case and
real packaged-image proof remain explicitly outstanding under CS01/CS07.

A further private hook was inherited by the actual Studio child: restoring a
hardcoded 250 ms deadline caused the maintained 600 ms HTTP profile to fail its
elapsed-time assertion. This exercises the real listener/proxy rather than only
the configuration return value (`mutant-live-timeout.json`).
