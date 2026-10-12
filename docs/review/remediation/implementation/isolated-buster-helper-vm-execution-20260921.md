# Buster helper authority guest execution

Status: failed, terminal. Coordinator session 41621 returned 1; QEMU exited 0
normally after 68.116 seconds with no watchdog stop. Actual guest compilation
and filecap installation/readback completed. Six of seven tests passed: service
3/3, root-driven 3/4; zero skips or cancellations. Authority acceptance remains
open.

The root filecap case failed at its separate wrong-group ACL assertion. Actual
`setpriv --reuid=1003 --regid=1003 --clear-groups` reached the helper's
`BUSTER_SANDBOX_CALLER_DENIED` policy rather than the expected filesystem
`Permission denied`. The later positive allowed-browser UID/GID, empty groups,
zero capabilities and NoNewPrivs assertions in that case did **not execute**.
They cannot be inferred from the other six passes. The guest input/credentials
at exec need diagnosis before assigning this to a fixture or product defect;
changing the expected exit/message or skipping the ACL check is not acceptance.

Other executed cases establish bounded positive facts: service forbidden-target
requests leave sentinels unchanged, root-owned configuration/code fixtures resist
service writes, the preparation UID sentinel is readable by its owner and by the
actual old filecap helper but denied to direct service/current restricted helper,
and the generic helper remains unprivileged. These do not establish the unfinished
allowed-browser capability-drop case or complete built-image/Buster integration.

[Raw console](../../evidence/isolated-buster-helper-vm-execution-20260921/vm-console.txt)
and [wrapper result](../../evidence/isolated-buster-helper-vm-execution-20260921/vm-result.json)
retain the exact failures and prepared source identities. Source entry sets,
types and hashes passed before/after verification. Initial disk SHA-256:
`fa8897dc209e1cefcc69e18c4022b44bd7de586c454ed720cc24e15973f110f9`;
wrapper final mutable disk SHA-256:
`51b2ec09cf8baa1a4a414ee5a1bdfdbdcee4248a853bce1940a333b882368ba4`.
The failed disk remains separate and unchanged; independent terminal hashing
matched the wrapper result and is bound in `terminal-identities.json`.

This is a failed bounded guest proof, not a production regression conclusion,
complete built image, source-publication/reconciliation or full IFR16 acceptance.
