# PR6 native runtime / Prism startup checkpoint

Historical checkpoint. The legacy/native switch and separate CLI described below
were subsequently removed; see [the current cleanup](pr6-prism-single-runtime.md).

D16 remains accepted. This is a code checkpoint, not completion of the four
original findings or all remaining work. **137 locally verified / 17 incomplete**
remains unchanged. No deployment, host installation, live test, merge or
operational cleanup was performed.

## Implemented

- Root-managed boot/cgroup-namespace identity, compared with the actual process
  before native startup. Required effective capabilities and a root-owned,
  non-setuid executable launcher are checked before admission.
- Original C launcher built in a separate pinned Debian snapshot image stage;
  hardened compiler/linker flags are also exercised by the actual local compiler.
  Image default remains the explicit legacy migration entrypoint; the native
  chart selects the native entrypoint, and the legacy entrypoint refuses native
  mode. There is no runtime failure fallback to legacy accounting.
- A pinned, statically built containerd NRI plugin. It uses the original SDK's
  namespace adjustment API after CRI spec construction. Selection binds the
  configured namespace/role/container/digest and actual NRI sandbox relationship.
  It changes only the cgroup namespace, not OCI resource paths/limits, other
  namespaces, or trust-proxy containers. Namespace RBAC is a required authority;
  NRI annotations do not authenticate service accounts or image identities.
- Exact selected runtime, NRI policy/configuration fragment and Prism activation
  overlay are derived from the host policy. No current host runtime is assumed.
  Native production requires compatible containerd 2.2+ and reviewed NRI setup.
- Prism Control and Worker share explicit native/legacy selection and worker
  image content identity. The native supervisor reconciles ownership and journal
  before HTTP admission, fences admission before shutdown, and rejects unhealthy
  bootstrap readiness. Chart rendering pins one Recreate worker to the selected
  Node, grants only SETUID/SETGID/KILL, mounts only its role/ownership and trusted
  read-only policy/identity files, and leaves the proxy unprivileged.
- The existing Prism deployment entry checks its actual rendered selection and
  real host Node/kubelet/cgroup state before applying a native deployment.
  Render-only remains read-only and does not claim host verification.

## Local evidence

Raw commands/results are in `docs/review/evidence/pr6-native-startup/`:

- `native-runtime.log`: nine actual file/CLI/compiler/build/Helm cases and three
  original NRI SDK/protobuf/OCI-generator cases pass. The encoded OCI result is
  unchanged except for removal of the selected cgroup namespace. No fake runtime
  server, cgroup filesystem or successful skip is used.
- `node-pools.log`: 22 pool/reservation/ownership/journal/generator cases pass.
  These overlap four generator cases above; do not add the counts as unique tests.
- `contracts.log`: V3/legacy resource contract regression passes. Protocol inputs
  prove contract behavior, not execution of a container or Kubernetes API.
- Core/Prism and strict live-gate typechecks, Bash syntax and all 27 centrally
  generated version outputs pass.
- Changed production modules pass canonical lint. Existing Control-server and
  lint-config diagnostics are compared against the exact prior Git blobs: the
  rule/message multisets are unchanged. Existing lint debt is not suppressed or
  described as a globally clean lint run.

Initial failures are retained. The local root process has `CapEff=0`; the new
supervisor guard correctly rejects that environment. The original test's
assumption that UID 0 implied capabilities was corrected, without weakening
production checks or claiming positive native startup. The ordinary-filesystem
rejection remains independently exercised by the original C launcher and Core
ownership tests. NRI's upstream runtime-tools replacement is copied from its
pinned go.mod, not implemented as a local SDK patch.

## Remaining implementation / acceptance

Buster's whole-attempt host, durable retained-fixture lifecycle and corresponding
startup/chart integration remain open. Complete manual cross-store retention
and the remaining infrastructure findings remain open. Prism's full dispatch/
retry identity handoff and replacement behavior still need review and sufficient
local coverage before its finding can close. The new switches/guards alone are
not a finding closure.

The final live gates must execute the actual selected image/containerd/NRI
profile, pre-exec membership, positive resource enforcement, supervisor/Pod
replacement, restored journal replay and host-reservation drift. The local
cgroup filesystem is read-only and the local process has no effective Linux
capabilities. Neither restriction is bypassed. The worker image was not built
or run here; compiling its original launcher is not an image-build claim.

The user executes final live acceptance after code/local completion. D13/D14/D16
are already decided and require no renewed confirmation.
