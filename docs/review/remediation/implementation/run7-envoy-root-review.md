# Root integration review: bounded Envoy readiness

Approved bounded source integration, not IFR-25-001 or IFR-07-001 completion.
Fresh remote parent is `1d7e6f8834b6e3f3f477a5af48832f74f5321757`, exact tree
`d02787ad9732aa20139cf575dafd6fdf7bd65252`, independently published and reread.
Root integrated only the final Envoy net delta as `ca47fef`, preserving the
coupled Product/controller/chart and all shared dispatch/Reader/SDK sources.
All ten chart/test source paths are byte-identical to independently reviewed
`d94f319868869a8ea8e6430c6e4c82e93dde5e5b`; its durable review is
`1fb7af3e3d52c9e860920bf72a7ce210f8f16d4c`. Author evidence is additionally
retained byte-for-byte from `eddf3c384324617f885428451c7b1db6c9b2a012`, backed as
`72f8bb702da5dac79476e38b5f2d94f9c9877f5a` on the same parent.

Root inspected the actual scoped helper, dedicated ServiceAccount prerequisite,
separate probes, bounded loopback self-mTLS and unchanged business peer policy.
Both independently found defects are corrected: a trust-enabled default SA is
rejected by original Helm, and the expired certificate now has a valid past
interval. The rollout fixture adds only the actual dedicated-SA input; original
checksum/configuration sensitivity assertions remain unchanged. No shared Core
or role-engine architecture changed.

Root reran genuine official Envoy 1.39.0 (SHA256
`4409dadc87931d8f8676314cbd83071cb65125fb4feac3f6335800580dfa9218`). All six complete
original rendered configurations validate. Actual filesystem-SDS transitions
valid200 -> wrong-URI503 -> valid200 -> expired503 -> valid200 pass, with both
installed TLS certificate contexts and readiness rechecked after installation.
The expired SVID interval is 2026-09-08T00:01:48Z through 2026-09-09T00:01:48Z.
Health/bootstrap remain200 in the same process, health-port /admin returns404,
session reuse is zero and a bounded failure event is emitted. Subprocess and
temporary credentials are cleaned up by the original test. Full raw:
`docs/review/evidence/run7-root-envoy-native.txt`.

Six trust/Product Helm cases pass with zero skips. Original rollout-health,
deployment-truth, SPIFFE contract and canonical focused ESLint all exit0;
`docs/review/evidence/run7-root-envoy-original-gates.txt` retains exact commands
and output. These are real local process/configuration gates, not a deployment.
Filesystem SDS is not SPIRE gRPC/UDS workload attestation; stderr is not a
delivered operator alarm. Native Pod rollout/old-peer rejection and original
DB/BuildKit fault requirements remain unexecuted. Both findings stay open;
the frozen scope remains eight verified and 39 incomplete. Publication must
recheck the current remote head and unchanged push triggers, use [skip ci],
exact-parent commits and fast-forward-only refs. No CI, production, deployment,
paid resources or third-party messages were used.
