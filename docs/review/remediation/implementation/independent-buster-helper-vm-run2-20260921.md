# Independent review: corrected Buster helper guest run 2

Preparation is accepted for the coordinator's single bounded guest execution.
The reviewer authored neither the corrected test nor this fixture and did not
boot it. [Exact review evidence](../../evidence/buster-helper-run2-independent-20260921/checks.json)
records 21 independently checked artifact hashes and the final manifest identity.
The author's successful verification-only run binds the complete 8-GiB disk and
explicitly records no boot; this review did not repeat that disk read.

Independent manifest comparison confirms exactly two changes from the failed HA
source export: the reviewed root ACL test correction and its ordinary-caller
fixture. Both exported files match the reviewed current bytes. All 35,451 shared
regular files have independent inodes; the new writable disk also has a distinct
inode. Production helper code and the seven original cases are preserved.

The guest init is byte-identical to the original HA driver. The launcher differs
only in cache/evidence paths and VM name. RAM, CPUs, TCG cache, memory admission,
CPU/wall/log bounds, readonly export and no-network isolation remain unchanged.
The initial memory refusal is preserved; the author subsequently passed the same
unchanged guard after releasing only its own cache pages and allowing quiescence.
There is no broader memory allowance or ignored refusal.

The correction follows the separately observed DAC-override diagnosis and retains
actual EACCES plus explicit caller credential/capability assertions. It does not
accept helper-policy denial as filesystem denial. Execution remains pending;
the previous 6/7 result and the separate successful diagnosis remain historical
evidence. No full image or Buster integration acceptance follows from preparing
this corrected guest run.

## Independent terminal execution review

The coordinator's corrected run passed all seven cases: three service cases and
four root cases, with no failures, skips or cancellations. Both phase statuses
and `VM_REVIEW_EXIT` are zero. QEMU exited zero after 68.109 seconds without a
watchdog stop. Three coordinator preboot memory refusals are preserved; the same
guard later admitted execution after quiescence, without source or limit changes.

This demonstrates the actual guest's file-capability caller/target boundary,
ordinary-caller EACCES, zero active/inheritable/ambient capabilities after the
allowed identity transition, NoNewPrivs, source-UID permission isolation, root
configuration protection and the old-helper negative control. The representative
root-owned module fixture is not proof of a built image's entire `/app` tree.
The generic helper positive and unchanged service-side denial cases also passed.

The [execution binding](../../evidence/buster-helper-run2-independent-20260921/execution-binding.json)
records independent final source checks for the frozen production/test files,
raw console/result and the preserved refusals. The reviewed wrapper performed
complete initial/post-run verification and recorded final mutable disk SHA-256
`37472c77c56d9bd4a66306fcb9ec7ab1aeb209ed80404e785b1eb2ea07b7bd15`.
A duplicate reviewer read of the entire disk is unnecessary for this bounded
acceptance; that hash is explicitly wrapper evidence, not an independent rehash.

The guest helper slice is accepted. Previous failures and their measured cause
remain preserved. Full built-image, dedicated Buster parent integration and
source cleanup reconciliation acceptance remain open.
