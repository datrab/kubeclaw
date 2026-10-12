# Buster helper authority: independent design review

Read-only review; no privileged exploit, build, VM boot or production change was
performed. Source identities are bound in
`../../evidence/buster-helper-authority-design-20260921/source-identities.json`.

The Docker image grants SETUID/SETGID file capabilities to the root:builder0750
helper under `/opt/kubeclaw-trusted`. Its parser accepts arbitrary target UID/GID,
including zero and the proposed preparation UID1003. Identity changes precede
seccomp; filesystem restriction is optional. There is no caller/target authority
check. Thus source inspection confirms the escalation path; this is not a claim
that an exploit was executed in the image.

The privileged helper's located production use is browserPlaywright: service
UID1000 requests UID1001/GID1000, as authored in the entrypoint. Direct-command
uses the separate foundation helper under `/app`, without the installed file
capabilities. Preserve that generic unprivileged use.

Recommend a separately compiled, immutable Buster helper policy allowing only
caller1000 and the explicit target1001/1000 pair. Reject missing/partial,
unauthorized and ambiguous repeated identity arguments before cgroup join or
opening a cgroup kill descriptor, not merely before final exec. The policy must
not come from caller environment, writable configuration or executable basename.
A non-author implementation review and real positive/negative checks remain
required; these are design recommendations, not acceptance.

The installed privileged executable and every replaceable ancestor must remain
root-controlled. Current `/app` code and generated runtime config are deliberately
builder-owned. A future root supervisor or isolated preparation host cannot use
that mutable tree as trusted code/import/config authority merely because its
entrypoint file is root-owned. Trace all transitive loaded code and policy roots
when placing that new host; do not relabel existing mutable files trusted.

The other elevated helpers, newuidmap/newgidmap, are concrete image dependencies
for rootless BuildKit. The explicitly appended subordinate range100000–165535
excludes UID0 and UID1003. Because the recipe appends rather than replaces the
base-image mappings, verify final actual subuid/subgid contents and ownership;
the appended line alone proves no absence of additional inherited mappings.
Do not remove these legitimate helpers without preserving rootless BuildKit.

Required negative cases include service requests for UID0/1003, wrong caller,
missing or partial identities, alternate allowed-looking group, repeated flags,
and attempted cgroup side effects on denied calls. Preserve the legitimate
browser identity pair and generic unprivileged command use. Tests using mocked
identity syscalls must be labelled parser/policy evidence, not actual file-cap
or container isolation proof. No full Buster preparation acceptance follows.

## Rendered security context

A light actual Helm render of the repository Buster values, with only the same
fixture registry settings used by the existing readiness test, produces
`allowPrivilegeEscalation: true`, root initial UID/GID, and a bounding capability
set including SETUID/SETGID (dropALL then CHOWN/SETGID/SETPCAP/SETUID).
The service's setpriv call has no no-new-privileges or bounding-set reduction.
Thus the repository-rendered configuration does not supply the proposed
NoNewPrivileges mitigation. This is rendered configuration plus source-path
evidence, not an inspection of a deployed cluster or an executed exploit.
`rendered-security.json` records the exact container security context. The first
render without required registry configuration failed and remains recorded;
adding the existing readiness fixture registry inputs produced the inspected
render without altering security settings.

## Follow-up source review (not acceptance)

The restricted C branch checks real/effective/saved caller IDs and the exact
single target pair before cgroup writes or kill-file opens. It clears
supplementary groups and verifies cleared capabilities; the generic build keeps
its original policy. Updated root/config ancestor validation and subordinate-ID
normalization address the earlier concrete trust-path concerns. Actual file-cap
positive execution and target identity proof remain pending.

The new parent lock introduced a separate concrete defect: both service launches
inherited fd9, the same open-file-description holding the parent's flock. The
service can unlock it without owning the lock file path, or retain the descriptor
through descendants. This reviewer reported the source issue; root separately
reproduced actual shared-descriptor unlock in
`../../evidence/buster-parent-lock-inheritance-20260921/result.json`.
The author is correcting both launches. Acceptance requires actual descriptor
absence in the child and the competitor remaining blocked while the parent
holds its descriptor. No completed HA acceptance is granted here.
