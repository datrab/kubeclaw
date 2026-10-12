# LIS guest mount prerequisite correction

The first actual LIS guest run booted but all 27 cases failed at the same preparation prerequisite: BusyBox `mount -o rprivate /` consulted missing `/etc/fstab`. This is a fixture invocation failure, not a verifier/kernel acceptance result. The original frozen export, images and run logs remain untouched.

The maintained driver's `private_mounts` now performs the actual libc mount syscall after successful namespace creation: `mount(NULL, "/", NULL, MS_PRIVATE | MS_REC, NULL)`. It declares the ctypes argument/return types and preserves errno on failure. The constants are `MS_REC = 16384` and `MS_PRIVATE = 1 << 18` in the [Linux 6.18 UAPI](https://raw.githubusercontent.com/torvalds/linux/v6.18/include/uapi/linux/mount.h). The propagation operation ignores source/filesystem arguments and applies recursively with MS_REC; it requires real kernel authority. [mount(2)](https://man7.org/linux/man-pages/man2/mount.2.html).

Both bind mount commands now use BusyBox's documented `-o bind SOURCE TARGET` form. The two tmpfs mounts and the second ext4 mount already provide explicit source and target and retain their previous arguments. No fstab stub, simulated syscall, skipped case or changed verifier was introduced.

Source regression checks confirm all 27 case names and resource constants unchanged, the exact direct-call signature/flags, and all five explicit CLI mount forms. Python syntax/help and real UID1000 prerequisite rejection pass. These checks do not execute privileged code. An initial source-check helper missed tuple assignments and was corrected; it did not invoke the driver or any mount. Before/after source hashes, full before snapshot and check script/results are retained under `docs/review/evidence/buster-legacy-seal-mount-correction-20260921`.

The corrected syscall remains unexecuted in a real guest. A fresh nonauthor review and separately bound generation-two export/image are required before another coordinator-controlled run. No host namespace/capability/mount operation or VM start occurred here.
