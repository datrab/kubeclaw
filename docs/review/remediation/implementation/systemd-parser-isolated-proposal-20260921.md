# Isolated genuine systemd unit parser proposal

Read-only investigation found no `systemd-analyze` on PATH or in the cached
native tool/guest trees. The host is Alpine 3.24.1; no cached glibc/systemd
runtime or GPG verifier was found. No package download, build or execution was
performed during the concurrent startup VM.

The preferred next step is a small extract-only Debian amd64 runtime in a new
workspace cache. Debian currently publishes
[systemd 257.13-1~deb13u1](https://packages.debian.org/trixie/amd64/systemd);
[its file list](https://packages.debian.org/trixie/amd64/systemd/filelist)
includes the real `/usr/bin/systemd-analyze`. Pin that package and matching
`libsystemd-shared`/`libsystemd0`, then resolve the actual ELF interpreter and
library closure. Version 257 includes the generated unit's delegation directive
in the [versioned upstream resource-control specification](https://raw.githubusercontent.com/systemd/systemd/v257/man/systemd.resource-control.xml).

Package preparation must verify Debian signed repository metadata and its package
index hashes before accepting `.deb` contents. Record the archive signing key
fingerprint, signed Release, Packages digest, exact package versions and payload
hashes. A signature verifier can itself be obtained through the existing signed
Alpine extract-only mechanism. Do not execute maintainer scripts or install into
host system paths. Preserve real bundled unit files: copying just the analyzer
would omit default dependency targets and could produce unrelated failures.

Run the actual analyzer through the existing proot runtime with extracted glibc,
libraries and unit directories bound privately. A PATH launcher may only forward
arguments and exit status; it must not parse or alter the unit. Keep the original
`native-worker-node.test.mjs` bytes and its exact `verify --man=no` invocation.
Ensure the real `/usr/bin/env` referenced by ExecStart is visible. Record all
warnings and require a malformed generated-unit negative control to demonstrate
that the actual parser rejects errors. Do not suppress unknown-directive or
missing-dependency diagnostics to obtain a pass.

A preparation ceiling of 128 MiB downloaded package payload and 512 MiB extracted
runtime is proposed, with sequential preparation after the active VM. Stop and
report the actual closure if it exceeds either bound. The targeted test run can
use a 120-second process-group watchdog and 8-MiB log limit; no existing test
assertion or internal deadline changes. Actual versions/dependency size remain
to be resolved and authenticated before execution.

If the translated local runtime cannot support the analyzer faithfully, the
fallback is the same authenticated runtime in a separately reviewed disposable
guest. A source build is less minimal and is not the proposed first approach.
The original node test also reads root-owned policy files, so a local nonroot
failure at that independent prerequisite must remain visible; it cannot be
fixed by weakening ownership validation. Guest execution may be necessary to
run the entire unchanged test rather than only the real parser subprocess.

A passing result would establish generated unit parsing for this pinned runtime.
It would not establish systemd PID 1 activation, notify readiness, delegated
controller enforcement, Kubernetes reservations or the D12 live-node gate.

## Concrete preparation contract

The repository runbook requires systemd **254 or newer**, because it uses
`DelegateSubgroup=setup`; its reference to an earlier local systemd 255 execution
is historical evidence, not an available cached executable. The proposed 257
parser meets the declared minimum but proves only its own version, not every
254/255 deployment. Its exact `--version` output must accompany the result.

Bootstrap a real `gpgv` using Alpine's currently indexed `gpgv=2.4.9-r1` and its
recursive runtime dependencies, fetched and verified against the host's existing
Alpine trusted keys, then extracted into the new cache without installation.
For Debian, pin the trixie archive primary fingerprint
`04B54C3CDCA79751B16BC6B5225629DF75B188BD` and stable release fingerprint
`41587F7DB8C774BCCF131416762F67A0B2C39DE4`, cross-checking the
[official key publication](https://ftp-master.debian.org/keys.html) and its linked
key announcement before accepting downloaded key material. Retain signature
status and exact signing subkey linkage. A web page alone is not a signature.

Verify the current trixie InRelease signature and validity before reading its
amd64 Packages index; require the index size/hash from that signed document.
Select exact `systemd`, `libsystemd-shared` and `libsystemd0`
`257.13-1~deb13u1` records and record each index Filename/Size/SHA256. Freeze all
resolved dependency versions from the same authenticated index. If this exact
version is no longer present, report the mismatch rather than silently switching.
Use genuine package unit defaults and the real interpreter/library closure;
no stub targets or edited units. The package dependency list is a starting point,
not proof that every dependency is needed by the parser's actual ELF graph.

Planning estimate: 20–50 MiB compressed runtime plus roughly 15–25 MiB repository
metadata, and 100–200 MiB extracted. These are estimates, not measured acceptance;
the 128-MiB total download and 512-MiB runtime ceilings remain hard preparation
limits. Parse indexes incrementally and extract sequentially, with a proposed
256-MiB preparation-process RSS ceiling and no concurrent VM or compiler. Record
actual byte totals before accepting the runtime.

The intended unchanged test command is
`node --test tests/verification/deployment/native-worker-node.test.mjs`, with the
real parser made available in the private PATH/runtime namespace. Its root-owned
policy check may require a later real-root disposable guest; proot's translated
ownership is not accepted as security evidence. In that case the local parser
probe remains only parser evidence, and the whole original test stays open until
its genuine prerequisites are supplied in the guest. No service is started.

## Extract-only preparation result

The genuine runtime is now prepared, without running the original tests yet.
Its actual loader invocation prints `systemd 257 (257.13-1~deb13u1)` and exits
zero. Authenticated downloads total 25,914,122 bytes; extracted Debian regular
files total 47,651,621 bytes and the Alpine verifier 3,121,296 bytes. The Debian
preparation process used the proposed 256-MiB address-space ceiling. Evidence,
recipes, selected package metadata and 1,178 file hashes are retained under
`../../evidence/systemd-parser-isolated-20260921/`.

The signed trixie Release is dated September 12, 2026. It has no Valid-Until
field; this is recorded rather than inventing an expiry guarantee. Its SHA-256
binds the 9,678,380-byte Packages.xz. The first verifier run lacked the older
bookworm archive cross-signature key and failed. That log is preserved. Adding
the published primary fingerprint
`B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8` allowed all three signatures to verify,
including both pinned trixie identities. Exact signer/subkey statuses are saved.

The conservative extraction filter initially rejected a genuine package absolute
symlink. Its failure is preserved. The corrected private extraction represents
absolute package symlinks as equivalent relative links within the isolated root,
then applies Python's containment filter; it does not create links into host
system paths. The first loader probe then identified a missing real
`libcap-ng.so.0`; its authenticated Debian package was added, and the actual
version probe succeeded. No package maintainer scripts or services ran.

Original module execution and parser negative controls remain pending coordination.
This preparation alone does not turn the missing-parser test green.

## Genuine parser probes

The generated unmodified service now passes the actual systemd 257.13 parser
with exit 0 and no stderr. Two private negative units are rejected with exit 1:
a nonexistent ExecStart executable, and removal of ExecStart entirely. The
latter reports a bad unit-file setting and refuses the service. Exact arguments,
stdout, stderr and exit statuses are retained in `parser-results.json`.

The first attempt failed because the parser needed a writable `/run/systemd`.
That failure is preserved. The final proot invocation binds a private cache
`/run` directory and genuine extracted systemd library/unit directories. It
executes the real glibc loader and analyzer, without fake root or stub targets.
It does not start any service. The production renderer and original test remain
unchanged; these targeted probes do not claim the whole root deployment module
has passed.

A complete entry manifest now records 1,567 runtime/verifier files, directories,
modes and symlink targets. Every symlink resolves within its private extracted
root; original absolute package links are represented by equivalent contained
relative links. Probe source identities bind the renderer, policy, configuration
and unchanged deployment test. Preparation and targeted execution are ready for
fresh independent review before a separately planned real-root guest module run.
