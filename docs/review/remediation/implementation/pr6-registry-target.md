# PR #6: explicit E2E registry target

IFR-08-001 still had an implementation gap beyond native acceptance: E2E health
used the configured registry while the runner injected a retired local-registry
override, the negative image scenario used a hardcoded origin, and the native
Kubernetes fixture selected the first catalog repository and tag over anonymous
HTTP. This could exercise a different image authority from the configured runtime.

The original runner, workspace generator and missing-image scenario now share a
non-secret projection of registry-clients.v1. The seed image must be explicitly
supplied, immutable and on the configured writable registry. Foreign hosts/ports,
mutable references and malformed/padded values are rejected. Legacy overrides
are rejected; no endpoint or credential is guessed. Validation occurs before
workspace creation. Importing the scenario module requires no operator environment;
registry binding occurs when the selected scenario is constructed/validated.

The original opt-in Kubernetes fixture now verifies the selected digest using the
existing container-build manifest verifier with the configured credentials and CA,
a 30-second deadline and 4 MiB bound. It no longer enumerates catalogs/tags. Existing
lease, readiness, cleanup and production-receipt assertions remain. The HTTP live
fixture now requires its explicit in-cluster service origin and the real seed image.
It no longer supplies an anonymous registry or a fixed mirror image. Offline test
fixtures were updated to select their own declared non-secret registry authority.

Local evidence in `docs/review/evidence/pr6-registry-target/`:

- Original workspace suite: 61/61, zero skips.
- Registry-target negatives plus original runner suite: 20/20, zero skips.
- Original real HTTPS/auth/HTTP-provider/API-flow and generator suite: 3/3, zero skips.
- Original matrix and matrix audit suites: 20/20, zero skips.
- New target helper and regression test: canonical ESLint passes.
- Full Knip passes.
- Extra strict native-script typecheck: six errors, also present in the original
  HEAD scripts (unknown existing workspace-return fields and heterogeneous Map
  inference). No native typecheck pass is claimed.

An initial edit incorrectly resolved a static scenario expectation at module
import; original tests rejected it and resolution was moved to scenario execution.
A remaining old helper call was likewise caught and corrected by the complete
workspace suite. The checked-in evidence is the final passing rerun, with these
intermediate defects recorded here rather than presented as native results.

No native Kubernetes script was executed. Real BuildKit publication, uncached
CRI pull, actual Pods, mirror cache/offline behavior and registry retention remain
open. Manifest verification and offline generation do not substitute those gates;
IFR-08-001 remains incomplete and the total remains 39.
