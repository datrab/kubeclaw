# Independent Control listener and route extraction review

Status: **bounded CL1–CL6/DOC and CQ1–CQ6/DOC accepted after the logger
correction.** The initial acceptance was reopened following root's finding; the
superseded checkpoint and this review's omission remain documented below.
Reviewer did not implement either slice or modify its production/tests.
This review covers [CL1–CL6/DOC](config-control-listener-20260921.md) and
[CQ1–CQ6/DOC](control-route-quality-20260921.md), not complete CONFIG or native
acceptance.

## Source and boundary inspection

Compared the retained original Control monolith against the explicit dispatcher
and extracted modules. Public health/readiness/internal artifacts/session/raw
signed dispatch/agent callbacks remain ahead of application authentication.
Unknown application paths still authenticate. Matched handlers return explicit
handled booleans independently of HTTP response return values. Per-request actor
state is a fresh object; the shared context contains startup services and captured
configuration, not a mutable current user. There is no generic routing framework
or reconstructed monolith hidden in another module.

Inspected session/CSRF verification, raw request bytes and HMAC key ordering,
SPIFFE peer authorization, central SyntaxError 400 versus other-error 422 mapping,
repository/SQL transaction boundaries, engine budgets, asset limits, corpus
publication/cleanup error precedence and original baseline replay before new
publication work. The independent TypeScript AST string-literal inventory finds
exactly the original 27 SQL literals, including multiplicities. This inventory
supplements inspection; it is not a claim of whole-program semantic equivalence.
Original tests captured on reviewer arrival remain byte-identical at final run.
The declared listener assertion migration is retained as a before/after diff.

Production captures environment and authored settings before asynchronous product
configuration I/O, constructs the pool/server from that one composition, and binds
its authored port. No second startup resolver or Control PORT fallback remains.
Runtime/Helm strictness, probe ports, Service target, Envoy control-local backend
and Control destination policies were inspected. Stable discovery ports and Worker
PORT remain separately owned.

Packaging inspection confirms `.dockerignore` includes `skills/**`; build context
COPY and final recursive Prism COPY include the new modules. The actual image
check shell script passes the selected role to the exact image proof. That proof
preserves inherited environment and branches Control/Worker checks; missing or
unknown role fails, Control rejects inherited PORT, Worker retains PORT. Local
source-loader execution is explicitly not a Docker build or deployment proof.

## Independent evidence

Evidence is under `../../evidence/control-listener-quality-independent-20260921/`.
The actual HTTP boundary probe uses real configuration, server, HTTP sockets and
crypto, with an explicitly rejecting database stub to prove these cases never
reach SQL. It covers public health/session, unknown-route authentication, CSRF,
malformed JSON versus validation errors, signed raw-body whitespace mutation and
concurrent authenticated/anonymous requests. Its private auth-removal mutation
fails the anonymous unknown-route status assertion (404 instead of 422).
Original listener and role-aware image tests passed 16/16 separately.

The independent rerun of the same eleven maintained modules passed **356/356**,
zero failures, skips or cancellations. Final shared Prism typing and canonical
lint for all 17 extracted route/context modules, composition/entrypoint, image
proof and touched configuration/tests passed. An additional shared-source/test
lint pass also exited 0. Commands and raw output are retained, not inferred from
the author report.

Independently reran the author-designed private listener/chart mutations: binding
a different startup port fails the actual production-child health oracle, and a
stale Service target8080 fails the original alternate-port Helm assertions. These
are in addition to this review's own auth-removal control. The author's initial
port-collision mutation is explicitly inconclusive historical evidence; the final
rerun uses a separate free port and fails at the intended listener assertion.

No production or assertion was modified by this reviewer. Exact frozen source
hashes remained unchanged across the runs. Real native-host, Docker and cluster
checks remain outside the evidence supplied here.


## Documentation and final binding

Read the final operator configuration guide, architecture responsibilities,
historical inventory lineage and both author reports. They describe authored
listener versus stable discovery/trust ports, retain the historical 23-setting /
27-read checkpoint separately from the additional Control listener, preserve
Worker PORT and make local/container/kernel limits explicit. Author initial
fixture and extraction failures remain recorded. No full CONFIG closure is inferred.

The independent `source-identities.json` verifies all 47 author manifest files and
snapshots, supplements them with packaging/test context, and stores its own copies.
Markdown copies use `.md.snapshot`. Source/test hashes matched before and after
execution; documentation was read and bound after author finalization. Subsequent
status-only links to this acceptance require a documentation rebind, not a new
claim that native or deployed behavior was exercised.


## Historical reopened finding: stderr failure can terminate Control

Root independently demonstrated that Node 24.21's original `console.error`
survives a closed stderr descriptor, whereas the replacement
`process.stderr.write(format(...))` emits an unhandled stream failure and exits.
Consequently the extracted request catch can lose its original HTTP error response
and service availability when its log pipe fails. The initial passing ordinary-HTTP
and SQL-preservation checks did not exercise this boundary. It is a blocking
CQ3/CQ4 behavior regression, not merely log formatting. Original accepted snapshots
and results remain retained as prior-version evidence. At that checkpoint corrected-source review was pending. The following section
records the independent correction checks that subsequently renewed bounded
acceptance.


## Corrected logger: independent final result

The corrected service uses explicit `Console({ignoreErrors:true})`, retaining the
original diagnostic fields and Console policy. Independently ran the complete
original eleven-module set again: **357/357**, zero skipped/cancelled/failed, plus
final Prism typing and corrected-source/test canonical lint, all exit 0. The first
356-test result remains historical; it is not reused as final corrected evidence.

The independent actual HTTP child probe initializes stderr and closes fd2 after
the request socket exists. Corrected code and the exact original monolith both
serve the original 422 response, malformed-JSON 400, then health 200 and remain
alive. Loading the exact superseded raw-writer module exits 1 before completion.
No process error handler suppresses termination: an uncaught-exception monitor
only records diagnostics. Preliminary closure before connect was inconclusive
because descriptor reuse can invalidate that trigger; its raw outputs are retained.

A separate actual parent-closed stderr pipe probe produces EPIPE and exit 1 with
both the corrected source and exact original monolith. This remains unresolved
baseline behavior, not a fixed or new regression asserted by this extraction.
The final comments/architecture/report explicitly restrict the demonstrated claim
to the closed-descriptor case. There is no universal failed-log-sink guarantee.

`commands-corrected.json`, `closed-stderr-final.json`, the EPIPE baseline records
and `logger-evidence.md` preserve the commands/results. Corrected snapshots and
hashes are separate from initial accepted snapshots. The two comment lines were
subsequently narrowed without executable changes; independent exact-text comparison
in `comment-only-binding.json` proves that sole source difference. A new full-suite
pass is not falsely attributed to a different executable implementation.


Final status-only author report/inventory updates are read and bound in
`final-source-identities.json` (48 verified author files and matching snapshots).
Earlier manifests and snapshots remain separate. No executable implementation or
maintained assertion changed after the correction, apart from the proven two-line
comment clarification. This final binding supersedes the intermediate pending
documentation states without discarding their evidence.
