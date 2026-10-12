# Trivy database input lock — prerequisite matrix

Recorded before implementing this slice on 2026-09-20. Source baseline:
`cd9f235345f5fd8736a2ffe75d806288e4d538db` plus separately owned uncommitted work.
Scope: IFR-21-001 I1 scanner database inputs and their explicit update procedure.
I2 full image comparisons, I3 tools in completed images, browser archives and
other runtime images remain open. Docker is absent here. No finding closure.

## Input inventory and intended production path

The current Buster Dockerfile downloads vulnerability schema 2 and Java schema 1
from mutable Trivy defaults. Both image workflows inject a per-run refresh
argument, exempted from version ownership by `scripts/versions.mjs`.
The selected scanner executable itself is already pinned in `versions.json`
(TRIVY_VERSION 0.74.0 and architecture-specific archive SHA-256 values).
Existing Python/Go locks remain in `docker/runtime-tool-locks.json`; this work
adds the distinct OCI database input class through the existing version authority,
without replacing or duplicating those package locks.

Planned authoring source: a database section of `versions.json`; generated lock:
`docker/trivy-databases.lock.json`. The build loader must request only the selected
manifest digest, verify manifest and archive bytes, verify extracted DB/metadata
identities, and populate a new cache without resolving mutable tags or mirrors.
The separate explicit updater may resolve documented upstream tags and must
record actual verified bytes before publishing a proposed lock update.

## Required individual cases

All tests use the real loader/updater functions, actual files and SHA-256. Unit
HTTP responses may model transport only and must not claim an upstream/native
scan. Native cases fetch real upstream artifacts. Negative cases start from a
working positive setup and must reach the named integrity boundary.

| ID | Input / prior state | Expected result / method | Environment and evidence |
| --- | --- | --- | --- |
| TD01 | Current versions and generated lock | Version check succeeds; DB keys and scanner version bound to one authoring source | Local versions check and dedicated test |
| TD02 | Changed authored digest or scanner version, stale generated lock | Check fails; no silent refresh | Isolated version fixture |
| TD03 | Valid current vulnerability and Java OCI manifests/layers | Compute raw SHA-256, compare registry digest and layer descriptor, inspect actual archive and extracted files | Real official registry downloads and saved manifests/receipts |
| TD04 | Pinned manifest with altered bytes or wrong expected digest | Reject before layer extraction/publication | Real loader with controlled transport, saved test output |
| TD05 | Pinned archive with altered bytes or wrong descriptor hash | Reject before extraction/publication | Real loader with controlled transport |
| TD06 | Wrong archive members, duplicate/linked/traversal entry or wrong DB/metadata identity | Reject, existing destination unchanged | Real archive fixtures and extraction path |
| TD07 | Correct locked archive, empty destination | Exact DB and metadata bytes installed; metadata not rewritten with current time | Actual extraction and independent file hashing |
| TD08 | Missing registry object/network failure | Fail with no default registry/tag fallback and no partial published destination | Controlled negative plus production request inspection |
| TD09 | Existing destination | Fail closed rather than merging unknown cache files | Real files |
| TD10 | Explicit update from official schema tags | Resolve once, then verify by immutable digest; publish authored identities only after both DBs pass | Real updater and independently fetched raw manifests/layers |
| TD11 | Production Dockerfile/workflow path | Uses generated lock and same loader; removes mutable refresh and versions exemption | Source wiring test; Docker execution unavailable, not claimed |
| TD12 | Current pinned scanner with locked database | Actual offline filesystem vulnerability scan succeeds; modified DB rejected by loader; no finished-image claim | Native scanner if executable works in host environment; otherwise explicit blocked |
| TD-DOC | Existing Trivy/update/image docs | Explain authority, exact commands, freshness remains enforced, update cadence and missing full-image proof | Doc/link checks and independent review |

Acceptance limits: content hashes establish selected bytes, not publisher trust
beyond the official HTTPS registry/source provenance. Freshness policy is not
weakened. Stale locked data must still fail runtime freshness checks; refreshing
requires reviewed new inputs, new images and current scan evidence. New dates or
digests must not be invented. Final evidence must bind source/tests to stored
patches/digests, preserving failed runs and blocked prerequisites.

## Additional boundaries fixed before final implementation

| ID | Input / prior state | Expected result / method | Environment and evidence |
| --- | --- | --- | --- |
| TD13 | Lock scanner version differs from installed scanner; generated lock differs from authoring source | Fail before download/publication; Docker supplies actual scanner version and versions.json | Real installer/CLI fixture |
| TD14 | Concurrent installer or dangling destination symlink | Exclusive sibling publication guard rejects concurrent install; any existing filesystem entry is rejected | Real filesystem fixture, destination remains untouched |

Existing OCI helpers were inspected: `infrastructure-oci-chart.mjs` owns Helm
layers on Docker Hub; `updates/oci-image-identity.mjs` explicitly rejects artifact
manifests. Neither implements Trivy database archive semantics. This slice keeps
a narrow two-repository loader using the same bounded curl/hash pattern, without
adding another general OCI resolver.

## Implemented and exercised — 2026-09-21

The authored `versions.json.trivyDatabases` now binds the two official OCI
manifests, compressed layers, extracted databases and unchanged metadata.
`scripts/versions.mjs` generates `docker/trivy-databases.lock.json`, including
the selected scanner version. The Buster Dockerfile consumes that lock through
the same tested installer and passes the actual scanner version. Both workflows
and the version-generator exemption no longer contain the mutable refresh
argument. No fallback path was retained.

The installer verifies both databases before publishing a new cache. An
exclusive sibling directory serializes cooperating installers; an existing
destination, including a dangling symlink, is rejected. This is build-time
publication under a trusted parent, not protection against a hostile parent
directory owner or power-loss durability. The explicit resolver selects official
schema tags once and then verifies content-addressed artifacts. It emits a
proposal, never silently changes the authored configuration.

Evidence is in [the input-lock directory](../../evidence/trivy-database-lock-20260921/).
[Source identities and scanner archive identity](../../evidence/trivy-database-lock-20260921/source-identities.json)
and [preserved source snapshots](../../evidence/trivy-database-lock-20260921/source-snapshots/map.json)
bind the uncommitted implementation to baseline `cd9f235345f5fd8736a2ffe75d806288e4d538db`.

| Cases | Actual evidence and result |
| --- | --- |
| TD01–02, TD04–09, TD11, TD13–14 | [19/19 boundary and versions tests](../../evidence/trivy-database-lock-20260921/tests-boundaries.txt), no skips. Real files, archive extraction, hashes and isolated CLI; transport substitutes only registry responses. TD11 is source wiring, explicitly not a Docker build. |
| TD03, TD10 | Resolver fetched actual official artifacts; raw manifests/metadata retained. [Separate Python SHA-256 pass](../../evidence/trivy-database-lock-20260921/independent-python-identities.json) agrees for both manifests, archives and all extracted files. Large originals remain in ignored `node_modules/.cache/trivy-database-inputs-20260921`, not committed evidence. |
| TD12 | [1/1 native integration](../../evidence/trivy-database-lock-20260921/native-restart.txt): real Trivy 0.74.0, checksum-verified official Linux AMD64 archive; actual locked archives pass the original installer. Offline filesystem scanning identifies vulnerabilities in deliberately vulnerable lodash 4.17.20. Both DBs and metadata retain exact hashes after scanning. This exercises advisory lookup; it does not exercise Java dependency lookup or a completed image. |
| Negative controls | [Three isolated mutants](../../evidence/trivy-database-lock-20260921/mutation-receipt.json): removed manifest verification causes two expected-rejection failures, removed archive verification two, removed extracted-identity verification one. Original tests pass. |
| Version ownership | [43 generated outputs, no drift](../../evidence/trivy-database-lock-20260921/versions-check.txt); existing four tool inputs and five locks also validate. |

Native command (requires the real downloads, never synthetic DB files):

Canonical lint subsequently rejected the original `.native.mjs` filename. The
test was renamed to `trivy-database-lock-native.test.mjs` with unchanged bytes;
[the rename receipt](../../evidence/trivy-database-lock-20260921/native-test-rename.json)
binds it to the reviewed snapshot. No lint rule was disabled.
The [repeat with the final filename](../../evidence/trivy-database-lock-20260921/native-final-name.txt)
also passes 1/1 with no skips. Canonical lint of the loader, both tests and the
changed HTTP/Tailscale proof files passes; the initial filename failure remains
in `lint-current.txt`, with the corrected run in `lint-final.txt`.

```sh
TRIVY_NATIVE_EXECUTABLE=node_modules/.cache/trivy-scanner-0.74.0/trivy \
TRIVY_NATIVE_INPUTS=node_modules/.cache/trivy-database-inputs-20260921 \
node --test scripts/tests/trivy-database-lock-native.test.mjs
```

The native test disables update/version/telemetry requests, selects offline
analysis, and points proxies at an unavailable local endpoint. This is not a
network-namespace denial proof. Its successful real lookup, rather than exit
zero alone, is the scanner-function assertion. The original `native.txt` is
empty because the environment terminated that process; only the completed
`native-restart.txt` counts. The first resolver attempt failed because its
parent directory was absent; `resolve-missing-parent.txt` preserves that failure.

The unchanged full production freshness regression was subsequently completed
against the same actual scanner and pinned databases:
[4/4 tests, no skips](../../evidence/trivy-database-lock-20260921/production-freshness-retry.txt).
It exercises the original `SecurityScanCapabilityInvoker`, rejects old source
metadata despite fresh `DownloadedAt` and a payload override, rejects changed,
malformed or missing metadata and cancellation, and rejects FIFO metadata
without a blocking read. Command: `KUBECLAW_SECURITY_TEST_TRIVY=ABSOLUTE_SCANNER
KUBECLAW_SECURITY_TEST_CACHE=ABSOLUTE_RESOLVER_DIRECTORY node --test
--test-timeout=180000 skills/buster/plugins/security-providers/tests/database-freshness.test.mts`.
The earlier partial `production-freshness.txt` remains an interrupted run, not
a second suite pass.

TD-DOC: the current [operator update procedure](../../../operations/local-image-vulnerability-scan.md#offline-buster-job-databases)
and [version/image guide](../../../operations/runtime-versions-and-images.md)
now explain authored identities, explicit refresh, unchanged freshness limits,
failure handling and incomplete full-image verification. The prior
`trivy-freshness.md` refresh section is marked historical/superseded rather than
silently rewriting its earlier evidence. Independent review is recorded
separately. The subsequent browser-archive work has its own implementation and
review record; complete two-build comparisons, image tool execution and the
remaining IFR-21-001 criteria stay open. No register closure.

The later browser review found two shared production integration omissions that
the first Trivy review did not exercise: `.dockerignore` omitted `versions.json`
and the installer scripts, and image-input selection omitted installer changes.
Actual Moby filtering showed the lock files themselves were already included by
the broad directory exception. The [browser implementation record](browser-archive-lock-20260921.md)
tracks corrections, official filtering tests and real Git selection regression.
The old bounded loader review must not be read as proof that the image build
context or deployment-selection path had already passed then.
