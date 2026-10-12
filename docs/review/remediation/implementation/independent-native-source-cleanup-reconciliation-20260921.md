# Independent review: native source cleanup reconciliation

The bounded Core mechanism is accepted at the source identities recorded in
[the review manifest](../../evidence/native-source-cleanup-independent-20260921/reviewed-identities.json).
This is not acceptance of Buster source deletion or of the complete RC criteria.
The reviewer did not implement this Core change and made no production edits.

The implementation preserves the original failed receipt and requires a separate,
validated cleanup envelope, sealed result and archived process. It checks exact
original identity and receipt references, the fixed cleanup profile and schemas,
disposed ownership with an unpopulated final observation, and agreement between
owner counters, archived execution and the sealed result. Reusing the existing
executor finalizer avoids a second interpretation of successful process output.
The role callback runs outside the original journal stripe, receives detached
snapshots and cannot replace the captured journal or profile by mutating its
capability. Missing proof continues to fence admission; the original no-hook
behavior remains covered.

Independent execution used the original GNU flock through the existing proot
binding, real filesystem journals and output spools. Ownership records were
explicitly modeled, with distinct valid original and cleanup scope names and
inodes. These checks establish storage and protocol behavior, not cgroup
quiescence or actual source deletion:

- All 30 maintained cases passed: six unchanged journal cases and 24 reconciliation cases.
- Six additional reviewer cases passed. They verify unchanged original journal bytes,
  detached callback inputs and captured capability fields, plus rejection of
  abandoned, unbound, populated, foreign-identity and counter-mismatched cleanup ownership.
- A private mutation removing the disposed-phase condition caused the abandoned-owner
  case to fail with a missing expected rejection. A separate mutation removing
  archive/result equality caused both invalid-output and different-accounting
  cases to fail with missing expected rejections.
- Native TypeScript and canonical scoped lint passed. All nine frozen source and
  test identities remained unchanged across these runs.

Commands, raw logs and the final hash comparison are retained in
[the evidence directory](../../evidence/native-source-cleanup-independent-20260921/commands.json).
The initial author fixture shared a scope and inode between the two owners; this
review identified that impossible store state before final verification. The
corrected fixture and the repeated author checks are preserved alongside the
historical run, rather than treating the old fixture as kernel evidence.

RC4 and RC5 remain open. Core does not establish Buster's root-owned source ledger,
publication exclusion, marker/inode authority, retained source-capacity release,
or crash-safe deletion and replay. The role must durably bind the exact cleanup
intent before deletion and retain its reservation until this independent proof
has been validated. A missing directory alone is not a receipt. Journal terminal
capacity is a separate prerequisite and does not prove capacity for a future role
ledger. No full Buster, B1 or IFR16 closure follows from this bounded review.
