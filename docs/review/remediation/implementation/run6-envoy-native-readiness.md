# Native Envoy prerequisite and retained trust-readiness candidate

Status: actual native author gate passed; independent review and integration
pending. Neither IFR-25-001 nor IFR-07-001 is closed.

Fresh remote base `b06c06dce3364c482a1da5637c36bc2b14ba8c72` exactly matched
all 3,448 local blobs/modes before creating this isolated run6-envoy checkout.
Mandatory remote resume files, register, original IFR25/IFR07 requirements and
worker-trust-operational-readiness.md were read. Fresh original baseline register
again yielded exactly47 implementiert IDs, matching partial-47-scope.json.

The retained worker-trust-native-unverified.patch was applied only here; its
reverse-apply check succeeded. This does not alter the active remote charts.
Source `b980da6` retains those production chart bytes unchanged. Test-only
additions log each successful original validator result and each observed HTTP
status, and bind the disposable functional health listener to loopback. All six
complete rendered bootstrap configurations are validated without this binding
adjustment. Filesystem SDS is Envoy's original implementation, not a fake SDS,
gRPC service or Envoy substitute.

Final tested source is `f61387cf38654d55131b0f0675a8a39220cf8564`.
Its additional original Envoy /certs observation asserts both active TLS
contexts contain the exact OpenSSL-issued serial, expected URI SAN and
past/future expiration at every transition. This establishes that wrong and
expired values were actually installed, not merely rejected updates retaining
an earlier usable certificate. The complete native gate and original configured
lint both pass again. Full output is run6-envoy-native-installed-final.txt.

## Original pinned executable

The earlier cancelled download was not an unavailable prerequisite. An ordinary
download from the official envoyproxy/envoy v1.39.0 release completed. The
105,026,776-byte linux-x86_64 binary SHA256 is
`4409dadc87931d8f8676314cbd83071cb65125fb4feac3f6335800580dfa9218`, exactly
matching the freshly fetched official asset digest. The executable reports
`8eea3285d6bdb89f8ea34632cfe7ce1608a8f374/1.39.0/Clean/RELEASE/BoringSSL`.
Full release metadata and ordinary download URL are preserved in
run6-envoy-release-provenance.json. No alternate IP, proxy, permission escalation
or network approval bypass was used. Reproduction downloads that exact asset,
checks SHA256, grants ordinary execute mode and sets KUBECLAW_TEST_ENVOY to its
absolute path. Helm and OpenSSL are genuine local tools.

## Observed native result

The original native gate exited0. Envoy itself validates all six original
rendered configurations: Nova, Buster, Prism agent, Prism control, worker and
runner. The actual Envoy process then consumes real OpenSSL-issued certificate
and CA files through original filesystem SDS. Observed /ready sequence is
200 →503 for wrong URI →200 recovery →503 for expired certificate →200 recovery.
After every transition /health and /bootstrap remain200 with the same process
alive. /admin returns404; Envoy's actual TLS session_reused counter is0. A real
bounded worker.trust.readiness.failure event is emitted. All stdout/stderr and
per-configuration/status observations are preserved untruncated in
docs/review/evidence/run6-envoy-native-final.txt.

The wrong/expired values are accepted installed SDS certificates that fail the
new mutual TLS handshake; there is no assertion that an invalid rejected SDS
update must replace a usable previous certificate. The test does not assert
that disconnecting SPIRE while a valid SVID remains installed makes readiness
fail. Actual SPIRE transport and renewal-service reachability are not tested.

Original rendered trust tests pass2/2 with no skips; original deployment-truth
and SPIFFE contract checks exit0. Focused unchanged ESLint is run separately.
Temporary native test processes/certificates are terminated and removed by the
original finally cleanup. No existing cluster/configuration or production
service is used, and no deployment or CI was started.

## Still open / next action

Obtain independent native execution/code review on this frozen candidate, then
root reconcile against the fresh repair head and the pending coupled chart
package before any integration. Preserve current shared Worker Core/role split.
Required real SPIRE gRPC/UDS attestation, Kubernetes Pod readiness/rollout and
operator alarm delivery remain open. stderr failure events are not delivered
operator alarms. IFR07's actual release update/Pod old-peer rejection gate is
not established by this local native functional probe. No broad completion is
claimed. Remote backup is a resumable candidate, not integration approval.
