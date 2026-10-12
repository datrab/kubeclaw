# Buster helper ACL diagnostic execution

Status: terminal. Diagnostic assertions passed (`ACL_DIAGNOSTIC_STATUS 0`), while
the unchanged seven-case suite still failed 6/7 at its original wrong-group ACL
assertion. Wrapper session 29193 correctly returned 1; QEMU exited 0 normally
after 72.353 seconds, with no watchdog stop. No test expectation or production
helper changed.

The actual signed setpriv process reached exec with all four UID/GID fields
1003, empty supplementary groups, and effective/permitted capability masks
`000001ffffffffff`, including DAC override. Its original and instrumented
invocations both returned 77 with the same helper policy rejection; the observer
only added its bounded status dump. This measured retained authority explains
why this fixture reached C policy instead of failing the executable's Unix ACL.
It was not an ordinary capability-free wrong-group caller.

The direct Node UID/GID1003 invocation returned actual `EACCES`; an ordinary
Node credential bridge independently recorded those IDs and zero effective
capabilities before obtaining the same EACCES. The separate allowed service
invocation passed: UID1001/GID1000, no supplementary groups, zero inheritable,
permitted, effective and ambient capabilities, and NoNewPrivs=1. Its capability
bounding mask remained nonzero; no claim that every capability field is zero
is made. These positive assertions ran independently before the original suite,
whose ordering still stops at its unchanged failed ACL assertion.

The original service suite passed 3/3; the original/root additional suite passed
3/4, with zero skips/cancellations. The earlier HA failure remains immutable.
The measured cause justifies reviewing a fixture correction that uses an actual
capability-free caller; it does not justify broadening the expected result or
changing the production helper to accommodate setpriv's retained authority.
Fresh independent interpretation is recorded separately by the nonauthor reviewer.

[Raw console](../../evidence/buster-helper-acl-diagnostic-execution-20260921/vm-console.txt)
and [wrapper result](../../evidence/buster-helper-acl-diagnostic-execution-20260921/vm-result.json)
retain the measurements and exact prepared identities. Source checks passed
before and after. Initial disk SHA-256:
`deeabee22e0c451117d62581f3ffa8531a757d2d7e5f5f3880a6459676469826`;
final mutable disk SHA-256:
`a217013d3534522cf5b275101b3517f1e21b98867f1710516dbd847824fb07de`.
This frozen snapshot excludes later production identity work, including UID1004.
It is not complete built-image, source-publication/reconciliation or IFR16 proof.
