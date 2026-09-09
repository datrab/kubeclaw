# Generated demo credentials and pending exposure handoff

First prerequisite slice for PATH-T04-002, D01/D02/D06. No readiness, delivery or
acceptance is claimed; no external operator message or cluster mutation ran.

## Production changes

- Original controller credential creation now writes an immutable Secret with
  explicit generated provenance and the actual lease UID. Before Secret POST it
  reads the authoritative lease status and commits an exact credential-byte digest
  intent through a resource-version CAS. Copied metadata on a pre-existing Secret
  cannot substitute for this controller-owned intent. It rejects a generated
  name reused from copied Secrets, missing/foreign provenance and replacements of
  the previously recorded Secret UID or credential digest. A lost creation
  response can recover the actual created Secret without regenerating values.
  If intent exists but the Secret is absent, reconciliation remains explicitly
  unresolved: no replacement password is generated. The digest cannot recover
  plaintext after a crash before creation; this boundary needs reconciliation.
- Controller status records `generated-demo-credential-source.v1`: lease UID,
  Secret UID/resource version, namespace/name and digest. It contains no password.
  Provenance changes participate in the original status reconciliation check.
- The original fixture runtime verifies that source record before reading the
  exact Secret through existing scoped RBAC, then verifies UID/version and bytes.
  Unverified Secret subprocess output is not included in failure diagnostics.
  The original provider emits optional `kubeclaw.generated-demo-credentials@1`
  output with only verified demo username/password and exact deployment
  image/manifest identity. Key-only or existing-mode credentials cannot use D01's
  generated-credential exception.
- Exposure `retentionMode: await-readiness` uses the original runtime and
  resource-version CAS to transfer ownership to a durable pending record. The
  record binds lease UID, predecessor owner/request, image/manifest and original
  expiry. It requires namespace `cleanupPolicy: retain`; both remain subject to
  the same existing expiry. Old attempt cleanup cannot disable the successor.
  Restart adopts the pending record, changed replay input and corrupt records
  reject before mutation. Default release behavior is preserved.

## State boundary still open

The implemented transition is test-owned → awaiting-readiness. It never writes
`readyAt`, extends TTL, marks credentials delivered, or accepts a version. No
unverified digest string or configuration boolean can grant a seven-day lifetime.
The subsequent authoritative readiness transition must consume exact final
coverage/source evidence, usable demo/login proof and real recipient delivery
receipt; only then can namespace and exposure expire at readiness plus seven days.
That producer and its seven-day transition are not implemented in this slice.

The existing production launcher selects the operator-messaging Discord target,
but the deployed webhook query and message-ID behavior were not inspected. The
adapter does not force `wait=true`; no receiver receipt endpoint is configured in
the launcher. No Discord message ID, Clawdeck acknowledgement or real delivery
is fabricated here. Platform credentials remain outside the D01 exception.

## Verification and limits

- Entire original Go controller test package passed. New original-controller
  HTTP test persists the actual generated Secret in a file, drops the creation
  response, reopens the durable status/Secret files, recovers without regeneration,
  then rejects a replaced UID, copied valid tags with private credential bytes but
  no creation intent, and a key-only Secret. It also checks intent-before-POST,
  missing-Secret uncertainty and a failed intent CAS preventing creation. This is a Kubernetes wire fixture, not a deployed API server.
- Three Node regression tests passed: explicit Secret-response vectors through
  the original credential reader; original exposure provider plus actual kubectl
  through HTTP for unchanged TTL, restart, changed replay and old cleanup; and
  the original exposure-generation regression. No executor or kubectl replacement.
- Both original fixture/exposure plugin tests and builds passed. Shared runtime
  TypeScript passed. New helper lint passes with the canonical rule set using its
  explicit existing shared TypeScript project (automatic project discovery cannot
  locate these engine files). Regression lint passes.
- Broad existing runtime/provider lint remains nonpassing, including infrastructure
  environment access and pre-existing large fixture functions. No rule was disabled.
- Real Kubernetes fixture and Tailscale live gates require explicit cluster
  mutation flags and a real cluster/tailnet; they were not run. No actual application
  credential use, retained live demo, seven-day expiry or delivery proof is claimed.

## Exact scope

New: controller `demo-credentials.go`, `demo-credentials_test.go`; engine
`generated-demo-credentials.ts`, `exposure-handoff.ts`; reliability
`demo-credential-source.test.mjs`, `demo-exposure-handoff.test.mjs`; this note.

Changed: controller `main.go` credential extraction/status comparison only;
`charts/kubeclaw/templates/buster-namespace-lease-crd.yaml` generated source status
fields; engine `kubernetes-fixture-runtime.ts`, `tailscale-exposure-runtime.ts`,
`exposure-generation.ts`; kubernetes-fixture `plugin.json`, `src/provider.js`,
`README.md`; tailscale-exposure `src/provider.js`, `schemas/config.schema.json`,
`tests/live-function.test.ts`, `README.md`. No commits or staging by this author.
