# RuntimeSecurity actual service cases — V4 draft

Status: unexecuted private extension, not frozen. Depends on the reviewed CI2 teardown delta, followed by rebase. V3 remains immutable. No service-path pass is claimed.

Reuse the existing `buster-cluster-production-route.test.mjs` and its three small fixture files. The suite adds a third capability; all original KubernetesFixture/Exposure cases remain. No second remote-service harness is copied. The existing real source repository, discovered provider, signed Nova remote submission, production Buster runtime loader, service/store, provider process IPC, capability factory, invoker and local CLI executable remain in the path. Native preparation publication is modeled exactly as declared by CI2, and the CLI models controller responses rather than a live cluster.

For RuntimeSecurity the provider resolves the real prepared repository manifest, checks its contents, invokes `kubernetes.runtime-security` over context IPC and verifies scanner/namespace before returning a passing result. The CLI seeds a matching real manifest digest, immutable image, exact findings accounting and actual result digest. The actual get request carries the profile's API group and controller namespace.

| Profile | Authored positive output cap | Actual fixture padding | Authored refusing cap |
|---|---:|---:|---:|
| first | 2048 bytes | 1000 bytes | 1024 bytes |
| second | 8192 bytes | 4000 bytes | 2048 bytes |

Each profile executes these cases:

1. **allowed**: real remote decision passes; exactly one actual CLI process records the expected group/namespace get arguments. Serialized response is above the refusing cap and below the positive cap.
2. **grant-denied**: service finishes with a nonpassing decision and the actual imported attempt contains TEST_PROVIDER_CAPABILITY_DENIED; CLI invocation count remains unchanged.
3. **route-denied**: actual remote submission rejects BUSTER_REMOTE_CAPABILITY_DENIED; CLI invocation count remains unchanged.
4. **policy-denied**: reload the lower authored cap through the complete component loader before starting the actual production runtime; exactly one genuine CLI get occurs and the imported attempt reports the exact OUTPUT_LIMIT cause. The fixture response is the same profile's valid observation, above this lower cap and below its passing counterpart cap.

Both component profiles also select distinct namespace prefixes, API groups and projected controller namespaces. Tests observe both positive outcomes and consumer-level denials; starting/stopping a listener or comparing settings alone does not satisfy any case.

The output-cause and restored-output-limit source controls from the RuntimeSecurity package remain required. Exact executed-source binding, complete regressions, independent source/evidence review, and root cleanup only after child/invocation quiescence are still outstanding. The known production RuntimeSecurity abort-before-close/process-group limitation remains open; any test teardown completion cannot close it.
