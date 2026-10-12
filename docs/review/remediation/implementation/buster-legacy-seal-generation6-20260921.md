# Sixth isolated legacy-seal artifact generation

This generation prepares the original 29 guest cases plus the new replaced-store
association case. The new case has a [fresh nonauthor source review](independent-buster-legacy-replaced-store-20260921.md);
its kernel execution remains outstanding. The separate [completed-consumer review](independent-buster-legacy-completed-association-20260921.md)
accepts 17 local tests with explicit external-boundary fixtures, not a real stop.

The [independently reviewed recipes](independent-legacy-seal-generation6-20260921.md)
preserve the prior guest, CPU, memory, disk, time, output and capability boundaries.
They create independent generation6 files and leave generation5 and earlier logs
unchanged. Seven driver/verifier/producer sources are pinned; the four producer
modules and their manifest are supplied through the read-only guest export.
The binder uses a held NOFOLLOW descriptor and compares complete file stamps
before and after hashing, before issuing a cache hint on that same own-file FD.

Runtime materialization completed successfully: 51,666,020 regular bytes,
1,515 entries, independent copies and no source drift. Real guest-runtime import
and tool probes passed. [Preparation output](../../evidence/buster-legacy-seal-vm-20260921/generation6/prepare-runtime-output.txt),
[runtime probes](../../evidence/buster-legacy-seal-vm-20260921/generation6/runtime-probes.json).
There was a brief overlap with a separately coordinated local Wait focus test;
no emulator or guest was started. Image construction was held until that test
was terminal, preserving the exclusive VM scheduling requirement.

Image construction and final binding have now also completed with exit 0: two
independent ext4 images (256 MiB and 16 MiB), seven pinned source files and 19
bound artifacts. [Image preparation](../../evidence/buster-legacy-seal-vm-20260921/generation6/prepare-images-output.txt),
[binding result](../../evidence/buster-legacy-seal-vm-20260921/generation6/bind-artifacts-output.txt).
The independent artifact review now accepts all 19 artifacts, all 14 export
entries, the full tool closure and both actual ext4 identities. The initial
`--verify-only` invocation then exited 1 at the unchanged charged-memory gate,
before artifact revalidation or VM startup. [Exact rejection](../../evidence/buster-legacy-seal-vm-20260921/generation6/verify-only.txt),
[subsequent memory observation](../../evidence/buster-legacy-seal-vm-20260921/generation6/preflight-memory-rejection.json).
Documentation checks from another workspace were concurrently observed; they
were not stopped and no exclusive causal attribution is made. The 768 MiB
charged baseline and all other limits remain unchanged. A successful launcher
verification and the actual 30-case guest run remain outstanding.
This report does not transfer generation5's 29/29 result to the new
source or assert that LIS7, writer shutdown, importer integration or Buster as a
whole is complete.

A second verify-only attempt also stopped at the same unchanged preflight gate:
[second raw rejection](../../evidence/buster-legacy-seal-vm-20260921/generation6/verify-only-retry.txt).
A separate subsequent sample recorded anon 360,857,600, kernel 423,247,872 and
shmem 0 bytes, totaling 784,105,472 against the 805,306,368-byte limit. That is
not a simultaneous measurement inside the rejected launcher; transient process
startup or other shared activity may account for the difference. No exact cause
is established from these samples. Neither attempt booted QEMU, and no limit,
interpreter or launcher was changed to bypass the gate.

## First actual generation6 execution: memory stop, no completed result

After the independent Buster cancellation review finished, the third unchanged
preflight passed and revalidated all prepared artifacts and runtime identities:
[raw verification](../../evidence/buster-legacy-seal-vm-20260921/generation6/verify-only-third.txt).
The coordinator then started the previously reviewed unprivileged isolated guest
with the existing exclusive test slot, unchanged 768 MiB charged-baseline gate,
1 GiB guest, 1,792 MiB emulator address-space limit and 2.75 GiB shared-memory
stop threshold. No concurrent heavy team test was started.

The guest emitted `VM_BOOTED=1`, but the watchdog stopped it after **85.1003
seconds** because shared workspace memory exceeded that stop threshold.
[Preserved console](../../evidence/buster-legacy-seal-vm-20260921/generation6/execution-first-vm-console.txt),
[launcher result and artifact identities](../../evidence/buster-legacy-seal-vm-20260921/generation6/execution-first-vm-result.json).
The outer command exited 1. QEMU's exit 0 after the watchdog's TERM is not a
test pass; the result explicitly has `passed: false` and a stop reason.

No complete guest case report was emitted. This attempt establishes no new
passed cases and does not close LIS7. Both guest disks were mutated during the
run; their final hashes are preserved in the result. They cannot be relaunched
as pristine artifacts under the previous initial-image hashes. Any further
attempt requires newly prepared, separately bound disposable images and a
resource review. No threshold increase, automatic retry or global cache action
was performed. The earlier preflight failures and generation5's separate
29/29 evidence remain intact.
