# Independent read-only VM memory admission audit

Keep the current 512 MiB admission guard unchanged. Its variable name overstates what it measures, but subtracting all reclaimable slab is not proved equivalent to the existing conservative protection. No launcher, limit, cache, cgroup or VM was modified. Earlier refusals remain valid results of their exact bound guards.

Linux documents kernel as total kernel memory, including slab; slab_reclaimable means memory that might be reclaimed. It does not promise immediate or complete reclamation. File includes shared memory. Type-based anon/file counters differ from active/inactive reclaim-list counters, so inactive_anon cannot be substituted for anon. These facts support correcting the terminology, not granting all reclaimable slab as free headroom. [Primary cgroup v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files).

The Linux 6.8 source maps anon, kernel, shmem and slab_reclaimable to separate VM accounting items. In the actual expression `anon + kernel + shmem`, file is absent; there is no demonstrated double count to remove. Kernel components must not be added again on top of kernel. The workspace reports kernel 6.8.0-139-generic; upstream 6.8 supports this mapping without pretending to inspect distribution patch details. [Linux 6.8 memory controller source](https://raw.githubusercontent.com/torvalds/linux/v6.8/mm/memcontrol.c).

Three adjacent read-only samples are retained in `docs/review/evidence/independent-vm-memory-guard-20260921/measurements.json`; they are near-simultaneous observations, not an idle-period or stress proof. The first records:

| Counter | Bytes | MiB |
| --- | ---: | ---: |
| anon | 314,593,280 | 300.02 |
| kernel | 405,413,888 | 386.63 |
| slab_reclaimable, already within kernel | 399,878,832 | 381.35 |
| shmem | 0 | 0 |
| Current guard sum | 720,007,168 | 686.65 |
| Diagnostic sum after subtracting reclaimable slab | 320,128,336 | 305.30 |

The diagnostic subtraction would pass 512 MiB while the actual guard fails. It therefore changes admission, not merely formatting. Current total memory was approximately 2.484 GB; memory.max is 3,221,225,472 bytes, swap.max is zero, and historical max events are nonzero with no recorded OOM kill. Those observations neither prove future reclaim success nor erase previous pressure.

For a conservative diagnostic split, use `base = anon + shmem + max(0, kernel - slab_reclaimable)` and retain `uncertain = min(kernel, slab_reclaimable)` in the reservation. Require `base + uncertain <= 512 MiB`. For coherent nonnegative counters this is exactly the old sum. Missing, malformed or inconsistent required counters must reject, not silently become zero. This is a proposed explanatory formula only; no code was changed. There is presently no independently proved positive lower bound on promptly reclaimable bytes to deduct from uncertain.

The original baseline ceiling plus QEMU's 2 GiB address-space ceiling leaves an arithmetic 256 MiB before the 2.75 GiB stop threshold, excluding other costs. With the observed un-reclaimed baseline it leaves only 81.35 MiB. Removing slab from the baseline without proving its timely release spends that cushion. RLIMIT_AS bounds process virtual address space, not all process-induced cgroup kernel and cache charges. [Linux getrlimit documentation](https://man7.org/linux/man-pages/man2/getrlimit.2.html).

The inspected launcher polls total memory at roughly 250 ms intervals and first allows up to five seconds for SIGTERM before SIGKILL. This cannot establish a zero-overshoot reservation during concurrent allocation. Even the existing guard is a conservative heuristic, not a mathematical no-OOM guarantee; its limitations cannot justify weakening it. Guest 1 GiB, two vCPUs, QEMU 2 GiB address space, 2.75 GiB stop and 3 GiB cgroup remain unchanged.

A future alternate guard would need predeclared evidence for bounded unreclaimed cache/slab, QEMU-induced kernel/file overhead, concurrent workspace growth and termination overshoot, while preserving the existing spare margin. No such evidence was established by this read-only audit. Zero PSI at one instant or a reclaimable label is insufficient. The admissible immediate path remains an actually lower original baseline, without pressure induction or global cache dropping. Launcher identities are bound in the evidence directory; no launch is authorized by this report.
