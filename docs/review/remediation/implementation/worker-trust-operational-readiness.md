# IFR-25-001 — prepared Envoy functional trust readiness

2026-09-09. **Separate, native-unverified configuration change. Do not treat this
as passed Envoy acceptance or merge it under the verified release-render fix.**
Original finding acceptance requires actual post-start dependency/certificate
faults, correct readiness and an alarm, with independent liveness. Native Envoy
configuration validation is an explicit gate for this change, currently unmet.

## Candidate only — not applied to production charts

The orchestrator retained the source/test diff as
`docs/review/remediation/candidates/worker-trust-native-unverified.patch`.
The descriptions below refer to local candidate commit `65a17b4`, not to the
active branch configuration. Its native validator and behavior must pass before
application. This patch changes no currently rendered workload.

## Source implementation

Both independent charts now have the same scoped readiness helper, instantiated
for the three agent roles and Prism control/worker. The administrative listener
stays loopback-only. Port 19000 serves GET-only `/health` and `/bootstrap` as
process/local-listener signals. GET `/ready` routes exclusively to a new
loopback-only TLS listener on port 19001, which only returns readiness and has
no application, administrative or arbitrary forwarding route. Other paths
return 404. Existing business listener peer allowlists are unchanged, and the
Prism test-runner bootstrap is unchanged.

The self-check client and listener use the original dynamic `default` SVID and
trust-domain bundle SDS sources, with exact matching of the expected workload
SPIFFE URI in both directions and mandatory client certificate verification.
The expected agent ServiceAccount is its existing chart fullname; intended
SPIFFE deployments must already create/select that account, as the original
role values do. This check does not pretend the Kubernetes default account has
that identity. Prism uses its existing role ServiceAccount.

Every probe disables HTTP keepalive reuse (`max_requests_per_connection: 1`)
and TLS session resumption: upstream `max_session_keys: 0`, downstream stateful
and stateless resumption disabled. A merely new HTTP request or TCP connection
is insufficient to force certificate revalidation. The dedicated cluster has
a half-second connect timeout, one-second route timeout, four-connection/request
limits and no retry budget. Request-provided timeout/retry override headers are
removed. These settings are confined to the self-check, not business traffic.

Kubernetes startup uses `/bootstrap`, liveness `/health`, readiness `/ready`.
Thus dependency failure does not intentionally trigger a liveness restart.
An initialized-but-expired SVID should fail the fresh mutual handshake while
process health remains available; that intended behavior remains unverified
until the native gate executes. A disconnected SPIRE stream with a still-valid
installed SVID is not asserted to fail readiness immediately: this check covers
current certificate usability, not upstream renewal-service reachability.

Envoy is configured to emit bounded-field JSON stderr failure events for 5xx
responses (`worker.trust.readiness.failure`, response code/flags/duration),
without request headers, credentials, certificate contents or arbitrary error
text. The existing kubelet readiness mechanism can also produce Unhealthy and
NotReady observations. No Prometheus/Alertmanager integration was found, and
no configured operator-delivery/Clawdeck alarm acknowledgement is available.
**Failure event production is not delivered operator alerting.** That original
acceptance remains open even if native probe execution later passes.

## Authoritative API checks

Read the exact pinned Envoy 1.39.0
[TLS protocol definition](https://github.com/envoyproxy/envoy/blob/v1.39.0/api/envoy/extensions/transport_sockets/tls/v3/tls.proto)
through the GitHub connector. It defines all three resumption controls used
here. Current official
[cluster API documentation](https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/cluster/v3/cluster.proto)
and [TLS documentation](https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/transport_sockets/tls/v3/tls.proto)
were also read. These primary references inform the configuration; they do not
replace the pinned binary's validator or behavioral acceptance. No replacement
schema adapter or fake Envoy executable was used.

## Actual local results

- `PATH=/workspace/scratch/4e25cf57c177/toolchains/bin:$PATH node --test tests/verification/deployment/worker-trust-readiness.test.mjs`: 2 passed, exit 0. Actual Helm renders five consumers in an alternate namespace; assertions cover exact own identity, unchanged isolated routing scope, SDS references, resumption/keepalive limits, separate probes and failure-event fields. The first run failed because the generic test render had no named ServiceAccount; the test now explicitly supplies the same named-account prerequisite as real role values. No chart identity was weakened.
- Original `check-deployment-truth.mjs`: exit 0 after precisely updating its previous TCP-only health expectations. It still rejects shell-dependent Envoy probes.
- Original `check-worker-trust-spiffe.mts`: exit 0 for original identity/header trust logic; this is not a native mTLS handshake.
- Canonical ESLint on both new test files: exit 0.
- `node tests/verification/deployment/check-worker-trust-envoy-native.mjs`: exit 1, `NATIVE_ENVOY_REQUIRED`; no skips and no claimed native pass.

Logs: `docs/review/evidence/wave47-trust/`. Native Envoy/Docker were not found
in PATH or scratch-binary inventory. A direct official release download did not
complete because its network approval was cancelled; no alternate access path
or privilege bypass was attempted.

## Prepared native gate and remaining acceptance

`check-worker-trust-envoy-native.mjs` requires an actual executable via absolute
`KUBECLAW_TEST_ENVOY` and checks version 1.39.0. It first asks that Envoy binary
to validate all six original rendered bootstrap configurations. Its functional
phase uses the exact rendered self-check and Envoy's original **filesystem SDS**
transport with real OpenSSL-signed valid, wrong-identity and expired certificates.
It requests valid → invalid → recovery transitions, persistent process health,
zero reused TLS sessions, no administrative route and actual failure events.
Native process output is forwarded in full; internal assertion diagnostics keep
only a bounded tail. This authored gate has not run past its missing-binary
prerequisite, so neither its success nor all later assertions are claimed.

Filesystem SDS cannot certify real SPIRE gRPC/UDS renewal or workload attestation.
After the native gate passes, original SPIRE registration/socket authorization,
expired/rotated SVID behavior under gRPC SDS, pod readiness propagation and
authorized operator-alarm delivery still need their actual environments.
BuildKit and native Prism database readiness remain separately scoped in their
implementation reports; this change does not close their missing runtime gates.
