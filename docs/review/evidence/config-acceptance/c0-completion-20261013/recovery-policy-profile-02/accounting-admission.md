# R02: authentic aggregate, checked arithmetic, original retained history

Future receiver delta at existing `scripts/postgresql-recovery.sh::backup`59–64;
current script does not implement these checks. No new budget/operator knob.

1. Within the original task's bounded ACCOUNTING phase, run captured approved
   `du --summarize --bytes -- <original BACKUP_ROOT>` against the authenticated
   same original PV/root/private owner/native mode. Require exit0, exact one output
   record, original root identity/path and complete tool capture; no truncated,
   timed-out, partial, mixed-root or unsupported-output success. All completed,
   incomplete, metadata/index/TOC/directory and retained original entries are charged.
   Native overlapping/accounting/file replacement/hidden writer invariants remain
   original source/volume authority gates. Do not read `du` in this C0 author work.
2. Separate the size token before arithmetic. It must match canonical nonnegative
   ASCII decimal `^(0|[1-9][0-9]*)$`: zero supported; no padding/leading zeros, signs,
   whitespace, fractions/suffixes/empty/newline/injected fields. Do not parse it as
   shell octal or silently normalize an unsupported tool datum.
3. Establish selected Bash signed64/native tool width. Compare decimal **strings**
   by length then ASCII lexical order to `9223372036854775807`, before conversion.
   Reject greater-than-native. Compare similarly against selected canonical retained
   bytes; reject used>retained before subtraction. A small configured retained value
   does not prove external aggregate bounded. Unsupported native width denies.
4. Only then convert explicitly base10; zero separate; for nonzero use `10#token`
   after representability, never bare padded shell arithmetic. Checked subtraction
   `availableBeforeReserve=retained-used` is nonnegative. Compare it with selected
   reserve before subtracting: if <=reserve, reject capacity (exact boundary0 is not
   an admitted dump). Otherwise `available=availableBeforeReserve-reserve` is positive
   and representable. `allowance=min(maxBackup,available)`; blocks=floor(allowance/1024).
   blocks0 rejects; checked multiply blocks*1024<=allowance<=native max. Preserve exact
   default-Bash1024-byte block mode and actual image/rlim_t receipt. This does not
   prove physical overhead/capacity, or change the full23-field policy relationships.
5. Revalidate original task/volume/source authority and deadline immediately before
   staging/native dump intent. Concurrent unsupported mutation or accounting drift
   rejects/uncertain; no fresh capacity by deleting old completed/incomplete history,
   unlinking lock, resetting accounting, importing a newer source or changing root.

Finite pure token/checked-allocation fixtures cover0, boundary available0, exact
reserve, one byte headroom/blocks0, one1024-byte block, used=retained, used>retained,
leading-zero0/1, malformed/signed/fractional/huge values, max-native and native+1.
Tests use string literals/BigInt only; they are not authentic `du`/PV receipts or
synthetic capacity acceptance. Failed capture/deadline/tool errors deny rather than
using default0 or any previously favorable result. Original81 source identities,
used+incomplete semantics and original native case requirements remain unchanged.
