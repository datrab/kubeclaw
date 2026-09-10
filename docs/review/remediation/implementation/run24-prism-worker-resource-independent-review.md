# Independent review: Prism worker resource RED

Run `20260910t074500` independently reviewed commit
`798619142267434fdedc63d491d2bb4d8044272c` for exactly
`PCR-PRISM-WORKER-002` and `PCR-PRISM-WORKER-003`.

## Remote authority and scope

At review start, remote `fix/remediation-foundations-20260909` was
`1ba445125fbacfa4f0344f8bf38e68f8f0686eff` with tree
`692a57a387d823d4b6636062e90dfbbeb07d28cd`. The reviewed commit has that
single parent and tree `437d4fd08311c78a6dae44f5c9db4052f077eae3`.
A fresh remote tree manifest and all ten changed blobs were reconstructed in
an isolated checkout; the resulting Git tree exactly matched the target tree.

The IDs whose status was `implementiert` in the baseline register at
`c38779c71bb92bc15c3fcb89930348e5417aa475` count 47 and exactly equal both
`partial-47-scope.json` and all current work-item IDs. The original source
finding text for both targets is byte-for-byte unchanged. Both work items
remain `implementiert / unvollständig`.

The target diff is exactly ten additive paths: one integration RED, two
documents and seven raw-evidence files. It changes no production source,
register, work item, Delivery or Semantic path.

## Independent execution

The new RED was run unchanged four times in total. Every run failed the same
single assertion with zero skips and exit 1. The first independent run measured
293 ms attempt CPU against 266.329 ms unrelated CPU; the three repeats measured
287/260.855, 308/281.069 and 307/280.901 ms. This stable separation defect is
not timing noise.

The test crosses the production `operationFor` /
`PrismWorkerOperation` boundary, uses the production
`WorkerArtifactClient`, a real local HTTP artifact read with digest
validation, the original `PrismEngine` and its deterministic provider. It
holds the attempt at the real input-read boundary while material unrelated CPU
is consumed in the same process. It does not replace the resource counter and
does not claim child-process coverage. Therefore it is a valid, narrow RED for
the shared-process attribution defect. It is intentionally not a full worker
HTTP-service or native isolation proof.

The unchanged positive Prism/Core suite passed 37/37 with zero skipped and
exit 0. Prism typecheck and focused lint both exited 0.

## Native limits and verdict

The independent host still reports unified cgroup v2 at `0::/`, mounted
read-only; `/sys/fs/cgroup` is not writable. No delegated child scope can be
created here. The Playwright cache contains only link metadata. The reported
Chromium path does not exist, and the unchanged native browser gate fails
0/2 with zero skipped before its cancellation assertions because the pinned
headless-shell executable is absent.

Verdict: **accepted only as a durable, genuine RED and bounded design
checkpoint**. No production implementation or finding closure is established.
The report correctly leaves both findings open. Completion still requires the
documented generic Core attempt owner plus Prism execution host, writable
delegated cgroup v2, repository-pinned Chromium, unchanged RED turning green,
concurrent-attempt/child accounting and real browser cancellation/reaping
proofs, followed by independent review.

Raw independent output:
`docs/review/evidence/run24-prism-worker-resource-review/independent-tests.txt`.
