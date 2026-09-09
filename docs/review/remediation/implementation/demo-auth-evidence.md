# Demo authentication and verified output projection — D01/D02 prerequisite

This standalone slice adds a genuine authentication provider and a read-only
projection of an already verified final result. It does not create Ready,
CredentialsDelivered, acceptance or a seven-day lease, and does not yet extend
the project compiler's graph. No external app, model, cluster, CI or deployment
was invoked.

## Authentication protocol and producer

The new `kubeclaw.demo-auth-smoke@1` provider implements only the explicitly
project-declared `json-session.v1` protocol: JSON login paths/body field names,
expected session cookie, protected JSON path, username JSON pointer and at least
one separate business assertion. Missing/unsupported protocols fail. It requires
an actual unauthenticated 401/403, login with the verified generated values, and
an authenticated 200 JSON response with the expected user and business facts.
A generic successful HTTP status is insufficient.

The three typed inputs must agree on lease/name/UID, namespace, immutable image,
manifest digest, generated Secret provenance/digest, pending exposure owner and
unexpired URL. The output binds the actual provider invocation identity, protocol
digest, observation time, deployment source and response digests. Request work,
parsing and final result share the invocation/fixture expiry deadline. The
provider is declared not retry-safe; no default unsafe retry is introduced.

The original NetworkHttpCapabilityInvoker handles all actual requests. It retains
exact-origin/fixture authority, explicit method/header grants, byte bounds,
cancellation and unconditional redirect denial. Cookies are held only in the
provider's local operation: one host-only HttpOnly session cookie with an explicit
covering Path, Secure for HTTPS, positive Max-Age if supplied. Foreign domains,
wrong paths, expired/insecure cookies and unsupported attributes fail. Neither
cookie values nor response bodies are logged or returned; malformed protected
JSON produces a fixed diagnostic to avoid reflecting session material.

The Buster entrypoint adds only `cookie` to its existing allowed request headers.
The ordinary HTTP provider and network runtime are unchanged. Existing Docker
COPY/discovery and the root workspace lock include the real new package. The
lock update contains only its package entry/link; unrelated npm normalization
was removed. No image build is claimed.

## Projection authority

A separate `kubeclaw.remote-test-gate:evidence` registration provides read-only
`test.plan.evidence` (`demo`, `artifact.object`). Its namespace constraint is
registered in the actual capability vocabulary and uses Core's existing artifact
namespace authorization. The existing plan adapter/secret grants are unchanged.
The evidence registration requires `artifacts.read` and explicit operator config
for stateRoot and qualified manifest/gate producers. No default role grant was
added; compiler/source-contract integration must supply those expected ancestors.

The adapter takes the run from Core's invocation, reads the original latest
current-run artifact (including the store's actual ArtifactRef), and verifies the
qualified producer, namespace, canonical bytes/digest/size against the selected
technical `delivery-manifest.v2`. It similarly verifies the manifest's exact
final decision reference and cumulative source/coverage binding. Caller run/stage
strings or copied producer fields cannot establish authority.

Core's generic import-store reader exposes only a complete stored import under
an exact job/run/stage/source/decision/result binding. It validates the stored
result/decision identity and digest relations; Core contains no product stage
names. Product semantics remain in the evidence adapter helpers: the selected
auth node must be a passed blocking native attempt covered by mandatory final
checks, with its original typed links to passed credential/deployment/exposure
producers. Credentials and deployment must come from the same fixture attempt,
and exposure must link to that deployment. The image must link from an actual
container-build output in the same source-bound plan; the checked manifest must
link from a passed producer artifact with the exact deployment digest. Static
unrelated image configuration cannot become final-source demo evidence.

The projection preserves the imported outputs and their native result binding.
It does not invent an execution receipt or promote a failed, skipped, reviewed-
only, incomplete or foreign result into readiness. A later candidate stage must
write its own immutable artifact, then consume the committed Discord receipt
and perform the separately authorized controller Ready transition.

## Verification and honest limits

- Original Go controller suite passes. Added native Go test uses the original
  random credential helper, actual local HTTP requests, durable intent-before-
  Secret creation and a private temporary result file. Its Kubernetes API is
  explicitly a wire fixture, not a deployed API server.
- New provider tests pass: real controller-generated credentials authenticate
  against a real local session application through the original network runtime;
  unauthenticated bypass, wrong business response, malformed JSON, redirect,
  missing method permission, cancellation and foreign source reject. Separate
  protocol/cookie vectors reject unsupported contracts and unsafe cookie scope.
  The local runtime consumes the actual Buster entrypoint header policy.
- Original HTTP provider test remains passing. New import projection test passes
  through the original HTTP importer, FileNovaGateImportStore, original artifact
  store and new adapter, including reopening, replay, run/source/result mismatch,
  missing native links and swapped images. Actual all-role registry discovery,
  capability resolution and namespace authorization/denial are exercised.
- **The projection test's remote terminal/source/build/deployment envelopes are
  explicitly contract vectors.** Its auth payload comes from the actual local
  app test. Their computed hashes test protocol integrity, not provenance of a
  native worker/image/cluster execution. No vector is presented as such proof.
- Both source package builds, Nova, shared runtime and owning Buster engine
  typechecks pass. New sources/tests and narrow capability additions pass
  canonical lint; existing import monolith lint debt remains. Entrypoint shell
  syntax and scoped whitespace checks pass.
- The unchanged original `check-pipeline-phase10-vertical.mts` was attempted:
  actual native sandbox attempts return `write EPIPE`, and the imported decision
  is correctly `execution_error`. It does not pass. No executor, host isolation
  or outcome was replaced to obtain a green result. Full native auth-provider
  execution, live image/namespace/exposure, compiled graph ancestry, Discord
  delivery, controller Ready authority and seven-day expiry remain open gates.

Commands:

```sh
go test -count=1 ./cmd/buster-namespace-controller
npm test --workspace=@kubeclaw/plugin-demo-auth-smoke
npm test --workspace=@kubeclaw/plugin-remote-test-gate
npm test --workspace=@kubeclaw/plugin-http-test-provider
npm run build --workspace=@kubeclaw/plugin-demo-auth-smoke
npm run build --workspace=@kubeclaw/plugin-remote-test-gate
node_modules/.bin/tsc --noEmit -p skills/nova/tsconfig.json
node_modules/.bin/tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json
node_modules/.bin/tsc --noEmit -p skills/buster/engine/tsconfig.json
```

## Exact scope

- New `skills/buster/plugins/demo-auth-smoke/`: plugin.json, package.json,
  tsconfig.json, schemas/config.schema.json, src/protocol.js, src/provider.js,
  tests/live-function.test.ts, README.md.
- New `cmd/buster-namespace-controller/demo-auth-credentials_test.go`.
- New `skills/nova/core/test-gates/verified-output.ts`; narrow method/import in
  `remote-result-import.ts`.
- New remote-test-gate `src/evidence-adapter.ts`, `src/demo-evidence.ts`,
  `src/demo-source-links.ts`, `schemas/evidence-config.schema.json`,
  `tests/evidence-projection.test.ts`; modified plugin.json and package.json.
- Narrow `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts`
  and `skills/nova/core/execution/authorization.ts` capability additions.
- `docker/buster-runtime-entrypoint.sh` cookie header only; package-lock.json new
  workspace only; this note.

No controller production writer, compiler/coverage, generic HTTP implementation,
SDK schema, existing credential source or default evidence grants changed.

Independent final review approved this bounded prerequisite. Exact commands and
outputs are preserved in [independent evidence](../../evidence/demo-auth-evidence-independent.txt).

The earlier phase-10 failure was captured in the execution transcript only; no
raw file was retained for that invocation. It is not included in the independent
passing-suite log and is not reconstructed or counted as a passed gate.
