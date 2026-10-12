# Isolate freshness cases from the execution-limit control

The execution-limit restoration control produced its intended missing-rejection failure but also changed unrelated age/future-negative selected 600 ms caps to 300000 ms. Those tests then timed out instead of finishing their freshness decision. The correction explicitly supplies the existing 600 ms request timeout in exactly those age/future cases. Baseline effective deadline remains 600 ms; the dedicated execution-cap cases retain uncapped requests so the execution control remains observable. No assertion, tested profile, production source or test deadline is changed.

Fixture invokes now use a controller bound to actual node:test cancellation, reject new work once cancelled, and immediately observe completion while returning the original promise to unchanged assertions. Teardown aborts, joins active work, waits for actual child close, and removes the root only after both. The existing 2000 ms teardown bound becomes one combined bound rather than being extended; on failure the root remains. Exact ChildProcess signaling is limited to an unclosed, unexited child. These are test-lifetime guarantees, not production ownership acceptance.

No runtime was executed while root control18715 remains active. Source review and an exact-stand rerun of baseline/controls remain required.
