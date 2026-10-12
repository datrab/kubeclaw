# Loader source-only author handoff

Three live files: public loader/snapshot/recovery owner, process session/protocol lifecycle owner, and /proc observation+signal primitives. Before bytes and exact after snapshots/patch/identities are retained. No runtime/type/lint jobs were run by this author.

The message dispatcher preserves its immediate non-RPC settlement order: only the original capability request path awaits. No extra async yield was introduced for result/log/abort/initialized messages. Public loader API, exact sandbox launch args/environment, snapshot digest checks, sampled peaks/cumulative recovery accounting, cleanup recovery order, sampling intervals, 16 MiB protocol ceiling and TERM/KILL deadlines are unchanged.

The deliberate error-handling correction is narrow and explicit: ENOENT/ESRCH during process observation means the observed process disappeared; other filesystem errors fail the session and enter bounded termination. A signal ESRCH means already absent. Other signal or abort-send errors are retained and reject termination upon closure, while force/bound timers remain active; timer callbacks themselves do not throw. These changes replace blanket swallowing, not error logging without a consumer. They require reviewer approval and failure-path tests.

Required next checks: affected engine types, canonical lint of all three files; actual provider/Runner and remote-provider originals; cooperative TERM/double-TERM, forced stop and cleanup recovery; real RPC abort/drain/late reply and immediate terminal/log ordering; /proc disappearance versus permission/I/O error and non-ESRCH signal failure propagation. No new operator-policy migration or native isolation claim is included.
