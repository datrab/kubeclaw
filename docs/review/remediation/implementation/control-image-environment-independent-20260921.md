# Independent Control image environment review

Fresh nonauthor review, 2026-09-21, against the pre-edit CI1–CI3/CI-DOC criteria in
[the correction record](control-image-environment-20260921.md). No actionable
finding remains in this bounded correction. CI1–CI3 and CI-DOC are accepted
locally. Production and test sources were inspected without editing them.

CI1: Comparing the retained old Dockerfile with the reviewed final source shows
only removal of `ARTIFACT_ROOT` from the final-stage ENV instruction. Listener
ENV, directory ownership/creation and entrypoint remain. The real entrypoint
calls `createControlServer`, then `loadControlCompositionConfig`, then
`loadControlServerConfig`; its central loader rejects the retired author.

CI2: The exact existing image proof now carries `process.env` into both original
loaders, including the negative worker check. Required proof credentials/trust
inputs remain explicit. Existing worker/native assertions remain and the three
Control policy fields are checked against the authored document. The Docker
runner mounts this same proof and does not clear image environment.

CI3: The two tests read literal ENV declarations from the actual final Docker
stage, author two complete real profiles, and call the original Control loader.
They also execute the exact image proof in child Node processes. The resolution
hook only maps `/app/prism/` imports to repository source; it does not replace
loader behavior. Their injected retired author must fail with the specific
legacy-override error. The intentionally restricted ENV parser fails on
unsupported syntax rather than claiming Docker expansion support.

Independent reruns retained in [review evidence](../../evidence/control-image-environment-independent-20260921/results.json):

- Exact requested two new plus three original configuration cases: 5/5, no skips.
- Additional new cases plus original policy suite: 37/37, no skips (two cases
  overlap the preceding run; these are not 42 unique cases).
- Prism typecheck: exit 0. Canonical scoped ESLint: exit 0. An initial lint
  invocation omitted the explicit repository config and failed at tool setup;
  that failure remains recorded separately and is not counted as a source check.
- Isolated old-Docker restoration: both cases fail at the original loader's
  `SWARM_CONFIG_LEGACY_OVERRIDE:ARTIFACT_ROOT` rejection.
- Isolated old-proof restoration: both cases fail at `notStrictEqual` because
  the synthetic-environment proof wrongly succeeds with the injected conflict.
  Neither mutant result is an import/setup failure.

The four correction-source hashes match the author snapshot before and after
verification. Supporting production loader, fixture, profile and runner hashes
are recorded separately. Mutant reruns write only this review's evidence and
temporary private trees; historical author evidence is preserved.

CI-DOC: The correction record, current implementation checkpoint and addendum to
the original Control policy record explicitly disclose the missed image path
and limit the prior acceptance. Freshly inspected operator guidance correctly
requires rebuilding an older image and selecting it through the versioned release
flow: Pod ENV removal cannot erase an image default, and an empty override is
also rejected. Its `bash scripts/check-built-runtime-image.sh prism-control
<image-reference>` instruction matches the existing runner. Progress and handoff
link the correction outside generated status blocks while keeping counts and
historical text unchanged. This new review supplies the pending independent
decision without rewriting the earlier scoped review. Source/declared-ENV
execution does not inspect inherited base-image metadata, build Docker images,
or prove shipped-image execution. Those image gates, native/cluster validation,
remaining CONFIG inventory/integration and the wider remediation goal remain
open. No host or deployment action was performed.
