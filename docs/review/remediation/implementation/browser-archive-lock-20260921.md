# Browser archive identity implementation matrix

Scope: IFR21 browser downloads in Buster and Prism, not whole-image reproducibility.
Before implementation: both Dockerfiles run Playwright `install --with-deps`, which verifies no repository-authored archive digest. npm fixes the downloader but does not fix mutable remote bytes.

Design: versions.json authors each Debian 12 amd64/arm64 archive URL, SHA-256 and byte count. Generated lock derives Playwright version from package-lock.json. A separate updater obtains the exact first upstream URL from the installed, lock-matching Playwright registry; build installation verifies the authored/generated/package/installed identities before network access, verifies downloaded bytes before extraction through Playwright's original extractor, preserves executable permissions and INSTALLATION_COMPLETE markers, and publishes an absent destination atomically under an exclusive sibling guard. No fallback download host or install command remains. OS dependencies still use original install-deps.

| Case | Required evidence |
| --- | --- |
| BA01 | Actual upstream identities for all five archives on both platforms |
| BA02 | package, installed version, authored/generated and platform mismatch rejected before download |
| BA03 | Wrong size and digest rejected before extraction; no published partial destination |
| BA04 | Existing directory, symlink and concurrent destination guard preserved |
| BA05 | Original extractor, executable mode and marker exercised using actual archive |
| BA06 | Both Dockerfiles use verifier and have no unverified browser install fallback |
| BA07 | Negative control removing digest verification causes corruption test to fail |
| BA08 | Update documentation explains reviewed identities, generated lock and failure recovery |

No case is claimed complete by this pre-implementation matrix. Actual Docker builds and browser launches require separate capable-host evidence. Download fixtures do not establish browser functionality.

## Implemented local evidence

- BA01: ten actual official archives downloaded (both architectures); identities
  retained in `../../evidence/browser-archive-lock-20260921/upstream-identities.json`.
- BA02–BA04 and production wiring BA06: nine tests pass in `tests-final.txt`.
  Tests use explicitly labelled synthetic bytes only for failure/concurrency
  boundaries; they do not claim browser runtime coverage.
- BA05: all ten downloaded archives passed the production verifier and original
  pinned Playwright extractor. `original-extraction.txt` records executable
  hashes/sizes, mode 0755 and completion markers on both architecture layouts.
  Download transport was a copy of the actual downloaded archive, not a network
  or browser substitute. Neither architecture's executable was launched.
- BA07: removing only digest verification causes the SHA corruption test to fail;
  `negative-digest.txt` retains that failing run. Positive suite remains 9/9.
- BA08: operator update and failure recovery procedure added to
  `docs/operations/runtime-versions-and-images.md`.
- Version generator checks 44 outputs. Actual Docker builds and launches remain
  open, as does fresh independent review of this slice.

The ten large ZIP files and extracted binaries remain in ignored
`node_modules/.cache`; they are not repository artifacts. Authored hashes and
small raw evidence are retained. No finding status was changed.

Version regression initially failed because its isolated repository copied only
versions.json and generated outputs, omitting the newly authoritative npm lock.
The fixture now copies that real input too; its original assertions remain and
an additional npm-version drift assertion was added. Combined final run: 11/11.
The initial wrong test path and the actual fixture failure remain in raw logs.

## Independent review corrections: deployment selection

The fresh reviewer found that changes to either archive installer were absent
from `isImageInput`. Root additionally found that the authored archive/database
sections were omitted from `inputDigest`'s version projection. Two regression
tests were written before changing production selection:
[both failed as intended](../../evidence/browser-archive-lock-20260921/input-selection-before.txt).
The corrected classifier includes both installers and the projection includes
`browserArchives` and `trivyDatabases`. Real temporary Git commits prove changed
and deleted installers and changed authored identities alter selection; an
infrastructure-only chart version still leaves image identity unchanged.

The combined original code-release/GitOps and new input-selection run produced
[15 passes and one failure](../../evidence/browser-archive-lock-20260921/input-selection-after.txt).
Both new cases passed. The other failure exposed a separate CONFIG integration
problem: the release configuration verifier rejected the two authored chart
symlinks before materialization. That defect is being corrected with bound
canonical-target verification; this combined run is not a whole-suite pass.

The contradictory old sentence declaring browser hashes unfinished was corrected.
Complete image builds and actual browser execution remain explicitly unverified.

## Build-context regression, specified before correction

Fresh review found that the root `.dockerignore` excludes the five newly copied
version/lock/installer inputs. Dockerfile text wiring alone therefore does not
prove that a build can obtain them. The correction must explicitly include only
those inputs and preserve existing secret, operator-state, and cache exclusions.

| Case | Required evidence |
| --- | --- |
| BC01 | Official Moby ignore parser/matcher evaluates every explicit local COPY source in both affected Dockerfiles; sources exist and are included |
| BC02 | Representative nested secrets, operator state, dependency/cache and ignored script paths remain excluded using the same matcher |
| BC03 | Removing each new allow rule independently makes its required COPY input inaccessible |
| BC04 | Original ignore file fails BC01; corrected file passes; no Docker build success inferred |

The context check is an isolated Go test module using pinned official Moby
patternmatcher and ignorefile packages. It does not add runtime dependencies.

### BC01–BC04 local result

The official matcher corrected part of the initial diagnosis: `!docker/` already
allowed arbitrary descendants, including both lock files. The three unavailable
COPY inputs were `versions.json` and the two installer scripts. The initial run
also demonstrated that nested `.env` files and arbitrary Docker-directory files
entered the context. These were real exclusions missing from the existing rules.

The correction adds five explicit input allow rules, a `docker/*` deny rule before
the existing Docker allowlist, and recursive `.env`/`.env.*` exclusions. The check
was broadened to all repository `docker/Dockerfile.*` files to guard against
removing another image's explicitly copied input. All discovered explicit local
sources exist and remain included; protected-path cases and five independent
allow-rule removal mutations pass.

Run `go -C scripts/tests/docker-context test -count=1 -v ./...`. The isolated module
pins official `github.com/moby/patternmatcher v0.6.0` with Go checksums.
`../../evidence/docker-context-lock-20260921/before.txt` preserves the original
failure; `after.txt` preserves the intermediate failure exposing inherited
inclusions; `final.txt` records the final all-Dockerfile run. The test README
explains its deliberately explicit COPY syntax boundary. No Docker build or
runtime execution is inferred. The subsequent
[fresh independent review](independent-browser-archive-review-20260921.md)
repeats the corrected context and input-selection checks and rejects independent
mutants. Complete image builds and browser execution remain open.
