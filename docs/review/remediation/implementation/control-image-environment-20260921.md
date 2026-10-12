# Control image environment conflict

Pre-edit corrective criteria, 2026-09-21. Root found an old author omitted by the
previous CC review: `docker/Dockerfile.prism-control` still sets `ARTIFACT_ROOT`.
The central loader correctly rejects that key, so the image's configured startup
environment conflicts with the new policy. The existing built-image proof passed
synthetic environment objects and therefore concealed inherited image authors.
The earlier bounded Control review is insufficient for this integration path.

- CI1: Remove the retired Control artifact-root ENV author from the actual final image stage; preserve unrelated listener configuration and artifact directory creation.
- CI2: The existing built-image loader proof must include inherited image environment when invoking both original production loaders. It must check actual Control policy values, without weakening existing assertions.
- CI3: Exercise the actual final-stage declared environment with two real central files through the original Control loader and the exact image-proof script. Restoring the old ENV must reproduce the production loader conflict. No source-only absence assertion substitutes for this behavior.
- CI-DOC: Correct the acceptance/status narrative, document this missed path and evidence limits, and obtain fresh nonauthor review. Local declared-ENV/source execution is not a built image or base-image metadata proof; actual image gates stay open.

## Correction and evidence

Only the retired artifact ENV assignment was removed from the final Control image
stage. Both loader calls in the existing image proof now spread `process.env`
before supplying their required test credentials/trust inputs; inherited retired
keys remain visible. Existing assertions remain, with three Control-policy value
assertions added.

The local regression reads the actual final-stage ENV declarations. Its small
literal parser rejects unsupported syntax rather than emulating Docker expansion
or ignoring it. Two real complete central files reach the original production
loader. The exact image-proof file also executes in a child Node process; a
fixture maps its `/app/prism/` imports to the actual repository source. It replaces
no loader behavior. This is local source/environment integration, not Docker,
base-image environment inspection or shipped-image proof.

The retained before run fails both profiles at the real legacy-author rejection.
Removing only the Docker ENV still leaves both tests failing: the old image proof
incorrectly succeeds with an injected retired author. After both corrections,
these two cases and all three original Control configuration cases pass (5/5).
Restoring either old file in an isolated temporary tree fails both new cases at
the expected behavior; no import/setup failure is counted. Lint and Prism typecheck
pass. The initial test-environment type annotation error is retained separately.

Searches of image, chart, script and Control source leave the backup job's separate
artifact-root transport and Prism-agent public URL declarations. They are not
Control authors; the agent/upstream inventory remains unresolved. Historical
release artifacts are preserved. No broad removal or CONFIG completeness is claimed.
The [fresh nonauthor review](control-image-environment-independent-20260921.md) accepts CI1–CI3/CI-DOC locally after independent original/added tests and both semantic mutations. Actual image builds and inherited base-image metadata remain unverified.
