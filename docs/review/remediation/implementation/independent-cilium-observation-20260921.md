# Independent Cilium observation guard review — 2026-09-21

Review scope is CG1–CG6 in the bounded
[Cilium observation guard matrix](cilium-observation-guards-20260921.md).
The reviewer did not implement this slice. Exact reviewed files are snapshotted
under [`source`](../../evidence/cilium-observation-independent-20260921/source/)
and bound by `source-sha256.json` in the same evidence directory. No production
source was changed by this review.

## Source, wiring and documentation

The install shell script invokes the new read-only helper before namespace
creation, Helm changes or policy application. The former inline assertions and
missing-items fallback have been removed. The helper requires one explicitly
cordoned node, an explicit CRI items array, unique nonempty IDs, recognized states,
and matching ready inspection identity with explicit host networking. Conditions
use explicit exceptions, so Python optimization cannot disable them. This is a
small, direct helper without a parallel compatibility path.

Cleanup still invokes the original verifier before its unchanged deletion
allowlist. Empty or malformed endpoint collections fail. Desired and realized
revisions must be observed nonnegative integers with exact equality; no zero
fallback remains. Neither shell script uncordons or creates a cutover marker.
Other parts of policy comparison and namespace selection were inspected for
wiring but are not newly certified as full migration acceptance.

The runbook describes accepted observations, same-CIDR single-node limitations,
operator quiescence, point-in-time races, independent access, backup and rollback
requirements. It correctly distinguishes configuration/observations from
connectivity and enforcement proof. It explicitly says the existing upgrade path
only checks marker existence, and prohibits using it to bypass incomplete
acceptance. Fixture evidence is clearly labeled.

Malformed nested endpoint objects currently stop through Python type errors in
some cases rather than a custom diagnostic. Those cases still stop before any
legacy deletion. This is a diagnostic limitation, not a guard bypass.

## Versioned CRI source check

The reviewer independently fetched all three versioned upstream files and
compared their bytes with the author's saved artifacts; every SHA-256 matched
(`upstream-source-check.json`). The selected K3s dependency replacement points to
cri-tools `v1.36.0-k3s1`. Its sandbox list path marshals a ListPodSandboxResponse;
its status path marshals the status object into the `status` output. The shared
protobuf JSON serializer emits defaults and does not request numeric enum output.
This supports explicit empty lists and named states. This is source verification,
not a capture from an installed host. Sources:

- [K3s selected dependency](https://github.com/k3s-io/k3s/blob/v1.36.4%2Bk3s1/go.mod)
- [cri-tools serializer](https://github.com/k3s-io/cri-tools/blob/v1.36.0-k3s1/cmd/crictl/util.go)
- [cri-tools sandbox list and inspection](https://github.com/k3s-io/cri-tools/blob/v1.36.0-k3s1/cmd/crictl/sandbox.go)

## Independent execution

Original tests passed **5/5 methods, 48 complete shell invocations**, without
skips, in 24.600 seconds (`original-tests.txt`). Bash syntax checks passed for
both shell entry points. These tests execute the real shell scripts with fake
kubectl, Helm and CRI commands.

`adversarial.py` adds **20 independently selected rejection scenarios** under
`PYTHONOPTIMIZE=1`. It reuses the declared fake CLI boundary and original shell
runner, while supplying new malformed nested node/inspection/endpoint values,
whitespace/numeric/null IDs, float/null revisions, and command exit failures for
node lookup, CRI listing, inspection and endpoint lookup. Each failed install
performs no mutating command; each failed cleanup performs no deletion.

Four isolated source mutants demonstrably violate the same behavioral oracle:
accepting a truthy string for cordoning; ignoring inspection identity; accepting a
floating-point network mode; and inventing missing zero revisions. Each mutant
continues to the prohibited mutation/deletion. Hashes and observed commands are
retained in `adversarial.txt`; shared production source was never mutated. All
seven snapshotted source hashes remained unchanged after execution.

**Accepted for CG1–CG6 as bounded local guard criteria.** There are no unresolved
blocking findings within this slice. No real cluster, CRI runtime, Cilium agent,
network traffic or recovery procedure was exercised. Live C2 acceptance and
IFR-02-001 remain open; no finding-register status was changed.
