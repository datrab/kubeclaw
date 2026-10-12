# Tailscale access matrix preparation

This is a local documentation/render slice of IFR-04-001, not T1/T2 completion.
The current redacted external policy and real allowed/denied client references
are unavailable. They remain required by the original acceptance criteria.
No Tailnet policy, credential, cluster resource or device is changed.

Before adding render checks, the required local cases are:

- Preserve the existing two actual Nova/Archviewer Helm cases unchanged.
- Parse the authored Argo ingress and operator values: correct backend/class,
  operator tag, shared proxy tag, and external OAuth fields.
- Render Prism using its existing CI profile: the private ingress targets Studio
  Service port 80, its process target follows the canonical configuration, and
  disabling Tailscale removes that ingress without removing the Service.
- Render Ops with the optional sidecar enabled and disabled: no Ingress or external Service
  exposure (the internal headless health Service remains), localhost-only SOCKS, Secret reference and persistent state when
  enabled; network policy still denies incoming connections. No real auth key.
- Document all four ingress families and the distinct Ops outbound path,
  application authentication differences, rotation, diagnosis and missing policy
  evidence. Dynamic Preview source references do not count as live rendering or
  a new controller execution result.

No placeholder client is counted as an actual client. Successful render checks
will prove local wiring only, not ACL/Grant enforcement or runtime reachability.

## First actual local run

The first complete five-case run passed four cases and failed the actual Prism
render. The current shared author includes `operator.buster.admission`, while
Prism's maintained Helm validator still accepts only `operator.buster.preparation`.
Helm rejects with `swarm buster requires preparation only`, before endpoint
assertions execute. This is a real cross-chart configuration integration defect,
not an absent Tailnet credential or a reason to alter the render oracle.
[Unmodified failed output](../../evidence/tailscale-access-matrix-20260921/tests.txt).
The Buster configuration author is correcting the actual chart consumer; the
full five-case rerun and fresh nonauthor review remain outstanding.

The existing two Nova tests were kept intact. The new Ops case models immutable
CI image references and an API-server CIDR; it verifies the actual chart's
internal headless health Service remains present while no Ingress or external
Service is created. Source inspection corrected an initial test draft's overly
broad no-Service assumption before execution; no failing oracle was weakened.
The expanded guide also has links from the Preview operator page and an explicit
current-state addendum to the historical infrastructure review. Original finding
text and register status are unchanged.

## Corrected consumer and complete local result

After the strict Prism consumer correction, the next run reached the native
namespace guard and still failed 4/5: the test omitted `--namespace`, allowing the
active Helm context to select a namespace different from the CI fixture's explicit
`default` binding. The test now passes `--namespace default`; all endpoint and
policy assertions remain unchanged. [Second failed run](../../evidence/tailscale-access-matrix-20260921/tests-corrected.txt).
No native validation was disabled and no production namespace was changed.

The full final local suite passes **5/5**, with no skips or cancellations.
[Final result](../../evidence/tailscale-access-matrix-20260921/tests-final.txt).
Scoped ESLint passed before the one-line namespace fixture correction, and local
links in all four edited documents resolve. Fresh independent final review remains
pending; actual external rules/client binding and every live gate remain open.

## Fresh bounded acceptance

The [independent review](independent-tailscale-access-preparation-20260921.md)
accepts the prepared documentation/render slice with its own **5/5** run and
bound sources. It also verifies that the original two Nova tests remain the
unchanged complete Git-HEAD byte prefix. Final scoped ESLint passes after the
namespace correction as well: [final lint](../../evidence/tailscale-access-matrix-20260921/lint-final.txt).
This supersedes only the earlier pending-review sentence, not the retained
failure history or missing external T1/T2 evidence. IFR-04-001 is now in progress,
not closed; the independent review also records the separate register comparison.

## Maintained Prism verification command

The same implicit-namespace dependency existed in `npm run verify:prism:helm`.
Both its lint and template invocations now explicitly use `--namespace default`,
matching the authored `charts/prism/ci-values.yaml` fixture. The native guard and
production namespace selection are unchanged. The [recorded original command
and requirement](../../evidence/tailscale-access-matrix-20260921/prism-helm-command-before.json)
precede the edit. The exact maintained command subsequently completed with exit
0: [raw output](../../evidence/tailscale-access-matrix-20260921/prism-helm-command-final.txt).
This corrects the local verification entry point; it adds no Tailnet or runtime
claim. The [independent command review](independent-tailscale-access-preparation-20260921.md)
accepts the exact two namespace arguments against the saved original command,
the authored CI binding and the successful raw run; its source hashes are bound
in the [review evidence](../../evidence/tailscale-access-independent-20260921/prism-command-result.json).
