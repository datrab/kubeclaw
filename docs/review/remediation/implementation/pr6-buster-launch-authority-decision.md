# Buster nested launch authority — decision required

D13 (task units), D14 (fixture lifetime), and D16 (host pools) remain accepted.
This is a newly identified trust-boundary decision, not a request to reconsider those choices.

## Concrete conflict

- `skills/worker/core/worker/native-worker-launcher.c` joins the attempt scope,
  clears supplementary groups, drops UID/GID and sets `PR_SET_NO_NEW_PRIVS` before
  executing the trusted role host.
- `docker/Dockerfile.buster-runtime` installs the existing Playwright isolation
  helper with file capabilities `cap_setuid,cap_setgid=ep`.
- `docker/buster-runtime-entrypoint.sh` starts the current trusted engine as UID
  1000 and configures Playwright execution as UID 1001/GID 1000.
- `browser-playwright-runtime.ts` requires a distinct UID for its cgroup-backed
  path; the helper performs that switch and then applies its sandbox restrictions.

The new unprivileged host cannot acquire the helper's file capabilities after
`no_new_privs`. The flag is inherited and cannot be unset. This follows from the
[Linux kernel contract](https://docs.kernel.org/userspace-api/no_new_privs.html).
Changing the numbers, ignoring the failed switch, removing the identity check,
or returning to sampled execution would defeat the requested replacement.
No such change has been made.

## Choices

| Choice | Consequence |
| --- | --- |
| **Recommended: narrowly authorized launch broker within each Buster attempt scope** | A small trusted process retains only the identity-switch authority needed to launch approved children. The ordinary engine and all provider/test code remain unprivileged. Adds a bounded, authenticated-by-possession private IPC protocol and its lifecycle tests. |
| Give the entire trusted Buster attempt host identity-switch capabilities | Less broker/IPC code, but every engine, adapter and capability implementation in that host becomes part of the privileged trusted computing base. Submitted code still needs a distinct, fully restricted child. |

## Reviewable contract for the recommended choice

1. The existing root supervisor admits the immutable claim and scope before the
   broker or engine starts. Broker, engine, provider and browser descendants all
   remain inside the same outer attempt accounting scope. Broker work is counted.
2. Buster defines fixed launch policies for its registered provider/browser
   children. A request cannot select arbitrary UID/GID, executable, environment,
   cgroup path or read/write roots. Core supplies neutral process ownership;
   it does not interpret Buster fixtures or plugin configuration.
3. Only the trusted engine holds the private control descriptor. Provider and
   suite children inherit neither that descriptor nor broker authority. Their
   identity and sandbox restrictions are installed before submitted code runs.
4. Ordinary hosts and submitted children retain `no_new_privs`. The broker uses
   authority it already holds; it does not regain privilege from a file-capability
   executable. The old file-capability launch and sampled fallback paths are deleted
   as part of the cutover, not retained as alternatives.
5. Broker death, malformed/oversized control traffic or an unsettled launch fences
   admission. Scope drain and immutable native receipts remain the sole terminal
   execution proof. D14 fixture readiness is still separate from completion.
6. The broker also prepares any required nested capability boundaries under the
   same outer scope. The current shared browser cgroup root cannot move descendants
   outside their attempt's resource accounting.
7. Local tests exercise real processes, descriptors, files and failure transitions.
   The prepared live gate verifies actual identity changes, sandbox enforcement,
   cumulative accounting, cancellation and supervisor/fixture recovery.

Prism keeps its ordinary unprivileged per-attempt host. It needs no nested
identity switch and receives no additional privilege under this proposal.
Buster's old runner remains active until this boundary and its complete replacement
are implemented; the cleanup task is therefore not complete.
