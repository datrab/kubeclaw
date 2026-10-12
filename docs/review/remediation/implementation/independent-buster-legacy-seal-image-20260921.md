# Independent legacy seal guest image and launcher review

Status: bounded preparation accepted; no VM was booted by this reviewer. This is not LIS kernel acceptance, a stop receipt, migration approval, or evidence that any production writer has stopped.

The reviewer did not author the image recipe, init script, launcher, guest driver, or verifier. The preceding [driver review](independent-legacy-seal-driver-source-20260921.md) remains separate. This review binds the final artifact manifest SHA-256 `b8b18805fdc85a8fb54294807ee652dab4d79a5ca2bd6f50890a40da4d334594`.

## Independent checks

The [checker and raw result](../../evidence/buster-legacy-seal-image-independent-20260921/result.json) establish all 16 artifact hashes, sizes, regular-file types and modes; the complete authenticated emulator runtime closure; exact guest payload/export entry sets and contents; and independent copies of all three unchanged driver/helper/verifier sources. The printed concrete launcher command equals its recorded command. Both regular disk files were read without mounting: their ext4 superblock UUIDs match the two successful recorded `mke2fs` invocations and differ from each other. Their logical sizes remain 256 MiB and 16 MiB.

The copied initrd was independently decoded as a CPIO archive. Its actual `/init` loads virtio block, ext4, 9p and their recorded dependencies, mounts `/dev/vda`, and switches root to `/guest-init`. The guest init establishes proc/sys/dev, fixes ownership only inside the disposable guest, mounts the source export read-only, waits for both block devices, and executes the actual Python interpreter with `-I`. The small export entrypoint executes the complete unchanged 27-case driver with all three source digests and both explicit device paths. There is no case filter, substitute verifier, or fabricated success result.

Cached `dumpe2fs` and `debugfs` are absent. The first independent checker stopped at that missing tool; this limitation is retained in [the evidence](../../evidence/buster-legacy-seal-image-independent-20260921/initial-probe-limitation.txt). No tool was installed and no image was mounted. Inspection of the image's complete directory contents therefore relies on the successful real `mke2fs -d` preparation, its exact independently checked input tree, and the final full image digest. Superblock inspection is not presented as filesystem or kernel enforcement proof.

## Isolation and execution boundaries

The launcher uses unprivileged UID 1000, TCG, two CPUs, 1 GiB guest RAM, a 2 GiB address-space limit, CPU limits of 1,200/1,210 seconds, a 120-second boot watchdog, and a 900-second outer watchdog. The existing 512 MiB nonreclaimable-memory admission guard and 2.75 GiB shared-memory stop threshold remain intact. Serial output is capped at 64 MiB. Network, monitor, default devices and guest core dumps are disabled. Only the two new regular disk files are writable guest storage; the small source export is read-only. No host block device or writable host directory is passed through.

The launcher binds itself, its concrete command, source manifest, init script and tool-runtime verifier before launch. It checks the exact export entry set, types, modes and hashes before and after execution, with contained symlinks, and repeats the complete emulator runtime check. Mutable disk changes are recorded as final hashes rather than falsely required to equal their initial images. A successful result requires emulator exit zero, no watchdog/post-verification failure and the guest's explicit success marker. Process death signalling and process-group termination bound emulator lifetime; they do not assert that every possible stuck guest syscall finishes within an individual case deadline.

No concrete preparation blocker was found. The coordinator may run the exact reviewed wrapper only when its unchanged resource preflight succeeds and the serialized test window is free. Actual boot, Python execution under the guest kernel, all 27 case results, and post-run bindings must still be reviewed from terminal evidence. A failed preflight or failed guest case remains a failure; this preparation review does not override either.
