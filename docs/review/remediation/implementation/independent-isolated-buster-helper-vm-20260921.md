# Independent Buster helper guest fixture review

Prepared fixture accepted for coordinator-controlled bounded execution; no VM
boot or actual file-capability proof was performed by this reviewer. The fixture
and helper implementation were authored by others.

Independent `--verify-only` passed and reported no boot. The fixed launcher is
byte-identical to the reviewed VM3 launcher after only namespace/name replacement;
its resource guards, network/device isolation and exact snapshot checks remain.
All twelve frozen author-source identities match the independent export. Guest
init and both proof drivers match their embedded/source copies. The manifest
binds the fresh disk separately from prior mutable VM disks.

The exact planned count is seven: original service suite three cases at real
UID/GID 1000, original root suite two cases, and two additional root-driven
permission/generic cases. Positive prerequisites are present: root-owned guest
ancestors, explicit sentinel permissions, executable restricted helper group
1000/mode 0750, actual file-capability application and readback, and an allowed
1001/1000 child whose IDs, groups, capabilities and NoNewPrivs are asserted.
Wrong callers that exercise C policy retain group access; unrelated-group probes
use actual setpriv with cleared supplementary groups and expect filesystem denial.

The private old-source helper is compiled separately and receives actual file
capabilities only in guest scratch. The current restricted helper denies the
preparation UID while that old binary must read the same real UID1003-private
sentinel; a legitimate UID1003 read establishes accessibility. The generic helper
remains capability-free and must execute a same-identity command. Configuration
and representative code permission tests do not claim complete image provenance,
BuildKit startup or Buster source publication.

All eight supplemental package hashes matched and fresh `apk verify` succeeded.
Cached guest setpriv version and getcap help run with the actual guest loader and
dependencies. Both generic and restricted C variants passed independent syntax
checks using the cached compiler, guest sysroot and production warning/hardening
macros. This is compiler/prerequisite proof only; actual production linking,
filecap execution and all seven cases still need the guest run.

Evidence: `docs/review/evidence/isolated-buster-helper-vm-independent-20260921/`,
including exact commands, package verification, guard/source checks and independent
no-boot artifact verification. Missing runtime prerequisites or failed cases must
remain explicit; this review does not authorize increased budgets or full IFR16
acceptance.
