# Trivy database source age and snapshot evidence

IFR-24-002: the actual offline dependency and image capability now refuses to
report findings until both supported database snapshots pass bounded source-age
and identity checks. This is a bounded implementation; remote native-host and
image-provider acceptance gates below remain explicit.

## Root cause and policy

Trivy 0.74.0 `--skip-db-update` checks schema compatibility but does not enforce
source age. `--skip-java-db-update` also bypasses Java freshness. `DownloadedAt`
records the local download, so copying/downloading an old database cannot make
its source current. We verified the pinned original sources:

- [Trivy 0.74.0 module pins](https://github.com/aquasecurity/trivy/blob/v0.74.0/go.mod).
- [Vulnerability DB update/skip behavior](https://github.com/aquasecurity/trivy/blob/v0.74.0/pkg/db/db.go).
- [Java DB update/skip behavior](https://github.com/aquasecurity/trivy/blob/v0.74.0/pkg/javadb/client.go).
- [Pinned vulnerability metadata](https://github.com/aquasecurity/trivy-db/blob/0e0340a01b57/pkg/metadata/metadata.go)
  and [builder timestamps](https://github.com/aquasecurity/trivy-db/blob/0e0340a01b57/pkg/vulndb/db.go).
- [Pinned Java metadata](https://github.com/aquasecurity/trivy-java-db/blob/184bd7481d48/pkg/db/metadata.go)
  and [builder timestamps](https://github.com/aquasecurity/trivy-java-db/blob/184bd7481d48/pkg/builder/builder.go).

The supported on-disk schemas are vulnerability version 2 (`db/trivy.db`) and
Java version 1 (`java-db/trivy-java.db`). `UpdatedAt` is the upstream database
build timestamp; `NextUpdate` is an upstream scheduling hint, retained as
evidence, not interpreted as a guaranteed expiry. Source age does not establish
the publication age of every advisory or authenticate a producer.

The default operator policy is 48 hours for vulnerability data and seven days
for Java data, with eight GiB maximum per database. These are project policy,
not upstream validity promises. The existing production runtime configuration
accepts `securityScan.databasePolicy` with all three fields
`maximumVulnerabilityAgeMs`, `maximumJavaAgeMs`, `maximumDatabaseBytes`. Ages
must be positive safe integers no greater than 30 days; size is bounded to
32 GiB. The deployment entrypoint explicitly emits the defaults. Changing
policy requires an operator-controlled runtime configuration/release; a job
payload cannot override it. Omitted policy uses the defaults; malformed supplied
policy fails. There is no stale-database waiver.

## Actual execution and evidence

`trivy-database.ts` validates metadata shape, supported schema, real calendar
values and source timestamps, rejects future/stale source data, and streams
SHA-256 over the actual database and metadata bytes. It bounds metadata to
16 KiB, bounds database bytes, rejects symlinked paths and nonregular files,
and checks size/mtime/ctime stability while reading. Metadata freshness is
checked before large hashes and again after the complete snapshot inspection.

`security-scan-runtime.ts` inspects both databases before scanning and again
before returning, requiring identical database and metadata digests. Hashing,
native scanner execution, parsing, post-inspection and final success share one
total deadline and caller cancellation signal. The final check follows result
construction. Kubernetes policy scanning keeps its separate existing behavior:
it does not consume these advisory databases.

Dependency and image results both carry `trivy-database-evidence.v1`, including
evaluated time, database kind/schema, source UpdatedAt/NextUpdate, source age,
operator age bound, actual byte size and both SHA-256 identities. The result
digest binds findings plus this evidence. Both actual provider consumers reject
missing/malformed/expired evidence and preserve it in provider details. Missing,
unknown-schema, invalid, future, stale or changed database state throws explicit
`SECURITY_SCAN_DATABASE_*` diagnostics, propagating as execution error rather
than an empty clean scan. Existing scanner-execution errors remain distinct.

These are observed pre/post identities, not an atomic adversarial snapshot or
proof against a malicious writer replacing and restoring bytes between checks.
The controlled image/cache remains a trust boundary. No permissions were
changed on databases, no database metadata was rewritten to authorize success,
and no network permission was added to jobs. Existing native-process kill/drain
behavior is outside this freshness slice.

## Controlled refresh route

The existing immutable Buster image downloads both databases during its build.
The build layer now consumes `TRIVY_DATABASE_REFRESH`; the existing build-images
and role-images workflows supply the unique run ID plus attempt, preventing a
same-source retry from silently reusing that DB layer. The existing reliability
setup now downloads both required databases and runs the freshness regression
through the security provider package test command. Manual image builds must
supply a unique refresh build argument or disable the cached layer.

Operators rebuild, verify and promote the resulting immutable image through the
existing release path before the policy expires. This change does not schedule
or trigger releases. A refreshed image is still rejected if its source DB is
already stale. A deployed image ages out even if its deployment time is recent.

## Verification and remaining gates

The official Linux AMD64 Trivy 0.74.0 release archive was downloaded to scratch
and verified against `versions.json` SHA-256
`2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a`.
Both official database downloads succeeded through Trivy itself. The unchanged
source metadata and actual SHA-256/byte identities are recorded in
`docs/review/evidence/trivy-freshness-snapshot.json`.

Four real native regressions pass after independent review. The first three
also pass in the concurrent package run: actual clean scan with both snapshot identities; original native
offline command accepting a deliberately old copied metadata timestamp while
the new invoker rejects it despite current DownloadedAt and payload override;
actual file-change, calendar/schema/missing-Java, caller-abort and repeated real
one-millisecond deadline failures. The fourth creates a real FIFO at metadata.json
and verifies rejection before a blocking open can consume the deadline. Review
found that O_RDONLY alone could block before the regular-file check; open now
uses O_NONBLOCK together with O_NOFOLLOW and still validates the actual opened
handle as a regular file. Negative cases use separate real database
copies; no fake executable, fabricated scanner result or changed positive
metadata is used. A real abort race found during verification was fixed with
awaited stream pipeline cancellation. Copying replaces initial hardlinks whose
unlink ctime affected concurrent stability checks.

The original provider test passes actual HTTP checks and actual clean/vulnerable
dependency scans, including CVE-2021-23337 and snapshot report evidence. Its
image stage is blocked in the unchanged child environment: direct DNS/network
is unavailable, Docker socket access is denied, and containerd/Podman are absent.
An exact original child-environment native probe captures this cause. A separate
native invocation with the host's existing network environment can scan the
immutable Alpine image, but does not count as actual provider acceptance.
The full package test therefore reports three passing tests and one failure,
not a green suite. The later Kubernetes stage is not reached.

The original authenticated loopback remote vertical runs but reports
`execution_error` with actual native sandbox summary `write EPIPE`, before the
provider success assertion. Neither host/network boundary was mocked, skipped,
relaxed or substituted. Actual image-provider and remote imported DB evidence
remain acceptance gates on the intended native worker host; no CI/deployment
was triggered. Evidence: `trivy-freshness-native.txt`,
`trivy-freshness-regression.txt`, `trivy-freshness-image.txt`, and
`trivy-freshness-remote.txt` under `docs/review/evidence/`.

The new Buster engine owning tsconfig extends the repository strict base and
checks production engine sources plus the native freshness test. `allowJs`
resolves the actual JavaScript provider helper; compiler rules are not relaxed.
The initial engine typecheck and existing provider build passed. Root caught an
introduced production property omission error under the existing shared
consumer's stricter flags. The actual producer now omits absent databasePolicy
rather than supplying undefined. The owning engine config now also enables
exactOptionalPropertyTypes and noUncheckedIndexedAccess, matching that consumer.
Both final owning/shared typechecks report only the concurrently authored
WorkerAttemptEnvelopeV2 generic mismatch at worker/attempt-executor.ts:280; no
Trivy/config errors remain. This shared failure is recorded separately in
trivy-freshness-typecheck.txt and is not claimed as a passing whole-repository
typecheck. Canonical lint passes all
new helper/regression files and both changed providers/verification consumers.
The original runtime has two unchanged fallback-chain errors (baseline also
had one complexity error now removed). Production config retains its four
existing errors: complexity stays 93, function lines 298→299, file lines 369→379,
and existing direct environment access. Exact baseline/current diagnostics are
in `trivy-freshness-lint.txt`. Workflow YAML validation, entrypoint shell syntax,
and scoped whitespace checks pass.

Frozen implementation scope:

- `skills/buster/engine/test-gates/{trivy-database.ts,security-scan-runtime.ts,production.ts}`
- `skills/buster/engine/tsconfig.json`
- `skills/buster/plugins/security-providers/src/{database-evidence.js,dependency.js,image.js}`
- `skills/buster/plugins/security-providers/tests/{database-freshness.test.mts,live-function.test.ts}`
- `skills/buster/plugins/security-providers/package.json`
- `tests/verification/contracts/check-pipeline-security-remote-vertical.mts`
- `docker/{Dockerfile.buster-runtime,buster-runtime-entrypoint.sh}`
- `.github/workflows/{build-images.yaml,role-images.yaml,pipeline-reliability.yaml}`
- `docs/operations/local-image-vulnerability-scan.md`
- This note and the seven `docs/review/evidence/trivy-freshness-*` files above.
