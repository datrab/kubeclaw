# OWN-GATE-01 response

V1 remains unchanged. V2 changes only the outer gate’s signaling guard. It observes the genuine spawned leader’s exit event, as well as close, and requires both to remain unobserved, both exitCode and signalCode to remain null, and a valid PID greater than one before signaling the owned detached process group. No signal is sent after observed exit even if inherited stdio delays close, or after close when a later filesystem assertion fails.

A terminal or unconfirmed generation retains failed evidence instead of signaling a stale PGID. The existing 3-second outer-close failure guard and evidence retention remain; this does not claim cleanup of an unconfirmed descendant after ownership has ended. Child barriers, exact nested error oracles, helper source and 10000 ms disposal deadline are unchanged.

No runtime, lint or negative control executed; this is a source correction pending fresh review.
