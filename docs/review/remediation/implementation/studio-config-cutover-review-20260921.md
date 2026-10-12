# Studio configuration cutover: independent source inventory

Read-only review; no runtime changes or new acceptance claims. The root author
owns the shared schema/loader proposal. This document identifies the production
consumers and packaging edges that proposal must cover.

## Settings and boundaries

| Current input | Current author/consumer | Cutover classification |
| --- | --- | --- |
| `PORT` | Docker default and Helm `8080`; Studio loader validates 1–65535; `studio.ts` listens once on `0.0.0.0` | Operator listener setting. Retire the Studio override, preserve other roles' legitimate `PORT`. |
| `PRISM_CONTROL_TIMEOUT_MS` | Loader default 30,000; service test supplies 250; request proxy owns one timer through response streaming | Operator timeout, positive safe integer up to 2,147,483,647. Preserve streaming/cancellation timing. |
| `PRISM_CONTROL_URL` | Loader default and Helm `http://prism-control:8080`; request proxy constructs upstream URL | Operator upstream endpoint. Retire only Studio's environment read; Agent/plugin/production acceptance uses remain separate consumers. |
| `STUDIO_ROOT` | Module-relative `../dist-studio` default, Docker `/app/prism/dist-studio`, service test temporary static fixture | Packaged asset location / test fixture path. Do not move automatically into operator JSON. Preserve tested path behavior or explicitly bind a fixed image path and migrate the fixture boundary without losing the actual-child static test. |
| `PRISM_INGRESS_SECRET` | Helm Secret reference; loader allows empty; proxy returns 503 if absent and replaces untrusted client header | Secret material, remains outside operator JSON. Preserve missing-secret and trusted-header behavior. |

`studio.ts` loads once before listen. `studio-request.ts` is the actual timeout,
proxy and static-file consumer. It should require no behavior rewrite for this
migration. An upstream base URL's pathname is currently replaced by the request's
absolute pathname; migration should not silently invent path-prefix semantics.

## Minimal coherent file set

1. `skills/prism/server/studio-config.ts`: use existing shared loader for the
   three operator settings, role-local retirement checks, one startup snapshot.
   `studio.ts` can remain unchanged if the existing options shape is preserved.
2. Root-owned canonical `charts/kubeclaw/files/config/swarm.config.json`, schema,
   shared `skills/common/plugin-runtime/foundation/config/swarm.ts` and applicable
   settings type/validation helpers; update the existing canonical aliases and
   renderer through their maintained generators rather than create another file.
3. `charts/prism/templates/_swarm-config.tpl`: validate the new exact object and
   value bounds consistently. `workloads.yaml`: give Studio `SWARM_CONFIG`, its
   read-only ConfigMap mount/volume and checksum; remove Studio-only retired env
   authors; bind both probes to the authored listener. Preserve Worker envs.
4. `charts/prism/templates/services.yaml`: Studio Service stays port 80 but its
   target is the authored listener. `networkpolicy.yaml`: Studio entry ingress
   uses that same listener. Its Control egress already uses the Control backend
   listener. Control Service stays port 8080 even with a custom Control target,
   so the Studio URL must not be rewritten to `control.port`.
5. `docker/Dockerfile.prism-studio`: retire its `PORT` default and package the
   real shared loader, schema and Ajv dependency closure. Present final layout
   copies only `/app/prism/server` and `dist-studio`; that layout cannot resolve
   the shared loader's repository-relative imports. Prefer the existing Prism
   image repository layout instead of copying an alternate loader. Preserve
   runtime UID 1000 and actual packaged Studio HTTP test execution.
6. `scripts/check-built-runtime-image.sh` and
   `tests/verification/deployment/prism-swarm-image.mjs`: add an explicit Studio
   role that actually loads packaged settings with inherited image environment.
   Studio currently receives only `docker image inspect`. Avoid unconditional
   imports of Control/Worker modules if the Studio image does not ship them;
   role-specific loading keeps the required dependency closure honest. Unknown
   or missing roles must still fail.
7. `skills/prism/tests/studio-service.test.mts`: author temporary canonical
   settings for its actual child instead of retired envs. Preserve all seven
   original cases, assertions and five-second startup/two-second timeout bounds.
   If a shared fixture helper is introduced, include it in the Docker build test
   closure. Add focused config/image-env tests to the maintained original gate.
8. `tests/verification/deployment/prism-swarm-config.test.mjs`: expand actual Helm
   rendering tests for Studio. Its existing Worker+Studio `PORT=8080` loop must
   be split, preserving Worker's original assertions. Update
   `check-deployment-truth.mjs` to assert the final image layout and unchanged
   actual-user build acceptance gate; its current regex assumes flat `server/`.
9. Operator/architecture configuration docs and the CONFIG inventory/report:
   document required authored settings, retired Studio envs, retained secret and
   asset-path classifications, fixed Service-facing URL semantics, and measured
   validation. Update generated configuration documentation through its generator.

`.dockerignore` already admits `skills/**`, `contracts/**`, package metadata and
Prism test helpers. It excludes deployment values and local `node_modules`, so a
new Docker build test must not rely on an unavailable repository config file or
host-installed dependencies. Use its own fixture or an explicitly mounted build
input; final image verification already mounts the canonical authored file.

An arbitrary external `controlUrl` is not automatically supported by the current
Helm NetworkPolicy: egress is restricted to Prism Control Pods. The author must
state whether arbitrary endpoints are standalone-only, or implement an explicit
bounded deployment destination policy. Do not render a selectable URL while
claiming the unchanged egress policy supports every value.

## Acceptance criteria for the author's preimplementation contract

- Strict JSON/loader/Helm agreement for missing, unknown, boolean, fractional,
  zero/negative/overflow values and malformed upstream URLs; no old env fallback.
  Conflicting retired Studio envs reject before listening. Secret values never
  enter authored JSON or diagnostics.
- Two distinct nondefault listener/upstream/timeout profiles reach the actual
  Studio child: selected endpoint receives requests, selected port listens, and
  all original byte/header/cookie/status/timeout/disconnect assertions survive.
- Snapshot behavior is explicit: file/env changes after startup do not mutate
  the running options. Missing ingress secret retains its established behavior.
- Actual Helm renders, with SPIFFE both enabled and disabled, agree across
  Studio probes, Service target, entry NetworkPolicy, config mount and checksum.
  Control Service-facing URL and backend listener remain distinct. Worker and
  Agent uses of similarly named envs remain valid.
- Production Docker `ENV` is passed to the actual loader in an original test;
  restoring the old Studio `PORT` default is detected. Packaged loader/schema/
  dependency omissions fail the built-image gate. No image-build claim from
  source-only tests.
- Semantic negative controls restore env fallback, hard-code listener/timeout,
  or restore stale Service/NetworkPolicy target; maintained assertions detect
  each relevant miswiring. Full touched-source lint/types and original relevant
  suites pass without deadline inflation or skipped cases.
- Documentation and CONFIG inventory reflect the final settings and exclusions;
  standalone, packaged-image and rendered-deployment proof scopes are separate.

Relevant preserved regressions include the seven actual Studio service cases,
`product-decisions.test.mts`'s directly supplied Studio options, the Helm swarm
and product-decisions suites, deployment truth, and image/release role mapping.
No need to rewrite frontend Studio modules for this server configuration cutover.
