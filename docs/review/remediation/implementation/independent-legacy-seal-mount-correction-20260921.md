# Independent legacy seal mount correction review

The bounded source correction is accepted at driver SHA-256 `db816f090613843fcc43b024f606d9441b06cd2006a4779ca7a1f365db0ba9ef`. Actual execution remains pending in a separately bound guest generation. This reviewer did not implement the correction or execute a mount/namespace operation.

Run 1's 27 setup failures remain failures. The earlier source review overlooked the practical BusyBox argument behavior: advertising a propagation option in help did not prove that the one-target invocation avoided an fstab lookup. Its preparation acceptance was not evidence of a successful kernel test. The failed generation must remain immutable historical evidence.

The correction performs `unshare(CLONE_NEWNS)` and then directly calls libc `mount(NULL, "/", NULL, MS_REC | MS_PRIVATE, NULL)` with explicit argument/result types and errno handling. The constants agree with the actual cached Linux and libc headers. A failed unshare stops before mount; a failed propagation change raises the original errno instead of continuing. Both actual bind invocations now use `mount -o bind SOURCE TARGET`, including both required operands. No verifier guard is weakened.

The [independent probe](../../evidence/buster-legacy-mount-independent-20260921/result.json) establishes complete AST equality outside the corrected function and the two exact bind-argument replacements. Thus all 27 cases, limits, assertions, watchdogs, capability checks and PID-namespace handshakes are retained. Three isolated modeled-libc probes verify the success-call shape and both failure paths. They execute no real namespace or mount operation and are not presented as kernel proof.

No additional source defect was found in this delta. The next image must bind these exact bytes while retaining the original verifier and capability helper. Generation 2 boot and all terminal case outcomes still require independent interpretation; this review does not reinterpret Run 1 as passing.
