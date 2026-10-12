# Independent descendant-authority case review

Source review accepted for driver `9625b4e475639427215f844db3d677e184dea7f5e5f9fa1dac5b3d37b577bdf8`.
The reviewer did not author this delta. The original source review below preceded
guest execution; the subsequent Run 5 evidence is recorded at the end.

An [independent AST comparison](../../evidence/buster-legacy-descendant-independent-20260921/ast-result.json)
removes only the two added case names and their dedicated branches and then
compares the entire module with the frozen preceding driver. Every original
statement, oracle and resource limit remains equal. The original 27 case names
remain in their original order; the two additions bring the total to 29 within
the original maximum of 32. The 120-second suite budget is unchanged; whether
the complete expanded suite fits is an execution question, not presumed here.

The foreign-descendant case changes the real original store file's owner to
UID 1000 before sealing. The writable-descendant case changes the actual nested
records directory to mode 0775 before sealing. Both still run the original full
seal, require every fixture entry's actual immutable flag and check/emit the
selected entry's authority immediately before verification. Both require the
specific `AUTHORITY_INVALID` result from the unchanged production verifier.
The verifier first accepts the protected root ancestry and later applies its
existing ownership/mode check while traversing the offending descendant.
Thus these cases exercise the missing descendant branch rather than reusing the
already tested invalid-root condition. Existing complete-tree tests provide the
accepted counterpart; no production guard or expected failure code was changed.

The author's modeled branch probes do not prove Linux ownership, immutable
flags or verifier execution. At source-review time, real guest outcomes for these
two cases and the corrected tmpfs case remained required. LIS7's replaced-original-store association
proof and the maintained stop-receipt/importer authority remain separate gaps.

## Subsequent independent Run 5 execution audit

Both new cases now passed in the genuine disposable guest. The same nonauthor
reviewer independently parsed the [nested raw results](../../evidence/buster-legacy-descendant-independent-20260921/run5-result.json)
and confirmed each exact oracle. The foreign regular descendant is UID 1000,
GID 0, mode 0644; the writable directory is UID/GID 0, mode 0775. Both driver
observations require actual immutable flags on every entry. The unchanged
verifier runs with root UID/GID, effective/permitted/bounding capabilities 481,
zero inheritable/ambient capabilities, and returns precisely
`BUSTER_LEGACY_SEAL_AUTHORITY_INVALID` in both cases. Case completion markers and
the full guest's successful terminal marker are present; the launcher reports
no stop condition or source drift. The current driver hash equals the source
review binding above.

This closes the two missing descendant kernel observations. The different
reviewer checks the original 27 cases and shared artifact bindings; the author
of these two cases is not used to accept their behavior. Store-association and
stop-receipt/importer gaps remain open.
