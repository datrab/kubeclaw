# Independent review of a separate fixed VM admission corridor

The proposed 768 MiB baseline / 1,792 MiB QEMU address-space corridor preserves the original **limited additive safety argument**, provided both constants are enforced together as one independently reviewed profile. It does not prove a stronger no-OOM guarantee or that QEMU can start. This review changes nothing and authorizes no launch. The existing 512/2,048 profile and its refusal evidence remain unchanged.

| Fixed quantity | Original | Proposed separate profile |
| --- | ---: | ---: |
| Full anon + kernel + shmem ceiling | 512 MiB | 768 MiB |
| QEMU RLIMIT_AS soft and hard | 2,048 MiB | 1,792 MiB |
| Sum | 2,560 MiB | 2,560 MiB |
| Arithmetic spare before 2,816 MiB stop | 256 MiB | 256 MiB |
| Cgroup memory.max | 3,072 MiB | 3,072 MiB |

No slab/cache reclaim credit enters either sum. The proposed reduction of QEMU's enforceable address-space allowance exactly equals the increased baseline allowance: 268,435,456 bytes. Counting all existing kernel memory remains conservative in the same way as the original profile. A counterexample allowed by the subtraction proposal—higher baseline while retaining the full 2 GiB emulator allowance—is excluded here.

RLIMIT_AS constrains process virtual address space through allocation/mapping failures and can also cause stack-growth failure. It is not a cap on all induced kernel/cache charges. [Linux getrlimit documentation](https://man7.org/linux/man-pages/man2/getrlimit.2.html). Accordingly, equal sums preserve the existing baseline-plus-emulator heuristic and its arithmetic spare, not all possible peak behavior. Unbounded concurrent workspace growth, induced kernel/cache costs and polling/termination delay remain the same unresolved limitations as before. No workload-capacity equivalence is inferred merely from equal arithmetic.

The smaller address-space cap may refuse loader mappings, guest RAM mappings, TCG allocations or later emulator work. That is an admissible prerequisite/execution failure and must retain its complete log. Guest RAM remains 1 GiB, vCPUs two, TCG cache 64 MiB; no guest test, deadline, case count, device isolation, host stop level or watchdog is relaxed. Reducing an emulator limit does not demonstrate that its existing virtual-memory overhead fits inside that limit.

Before an implementation could be accepted, its source-bound checks must establish all of the following:

1. Both fixed constants are coupled: reject a 768 MiB baseline paired with any larger address-space cap, and reject fallback to the old cap after allocation failure. No memory-dependent tuning, retry escalation or hidden environment author.
2. Both RLIMIT_AS soft and hard are exactly 1,879,048,192 bytes before exec of the actual emulator. Baseline uses the unchanged full anon + kernel + shmem expression and a 805,306,368-byte ceiling. Unknown/malformed accounting rejects rather than receiving reclaim credit.
3. The guest/test/isolation/watchdog settings above and the 2,952,790,016-byte runtime stop remain exact. Source/artifact identities distinguish this profile from the original refusal profile.
4. Tests exercise exact boundary/one-byte-over, the coupled-profile invariant and application of both limits without a VM. Any later actual start still requires the established coordinated window and complete launch review. QEMU allocation failure or a runtime stop remains a failure; no cases are dropped to fit.

This is a reasoned acceptance of the proposed fixed budget trade within the original conservative model, not approval to raise a threshold in isolation. The earlier audit's rejection of subtracting potentially reclaimable slab remains intact. Exact arithmetic and the currently inspected original launcher hash are recorded in the matching evidence directory. No QEMU allocation feasibility or privileged/kernel workload was tested.
