# Prism Studio service lifecycle

Scope: PCR-PRISM-STUDIO-SERVICE-001. Preserve the existing Studio/Control split,
proxy headers, static root and deployment defaults. No Control authorization or
new log storage is introduced.

The Studio image copies the server directory as one unit rather than maintaining
a separate list of imported modules. The final image runs the existing HTTP
service regression suite as the `node` user with no build dependencies installed.
This catches missing runtime imports during image construction, including the
previous omission of `studio-config.ts` and `studio-request.ts`. The test file is
mounted only for the build check and is not retained in the runtime image.

The HTTP callback observes every asynchronous handler rejection. Refused Control
connections return a concrete 502 and cause; malformed URL encoding returns 400;
unavailable static output returns 404. Structured stderr diagnostics include time,
component, original error and its complete Error cause/stack chain, including
failures after the client disconnected. Partial responses are closed explicitly
instead of writing a second response or crashing the service.

The Control request has a configurable 30-second default deadline covering headers
and response streaming. Client disconnect and response failure abort the upstream
fetch. Streaming respects backpressure, then cancels/releases the reader on every
exit. Timeout before headers returns 504; timeout after partial bytes closes the
response. Existing response status, cookies, UTF-8 bytes and allowed headers remain
intact. Incoming request bytes retain the existing two-million-byte limit.

Standalone configuration is parsed in studio-config.ts, with its exact environment
boundary declared in the existing canonical lint configuration. Port and timeout
values are bounded integers; defaults remain unchanged. This is a specific config
adapter, not a blanket permission or lint suppression.

## Evidence and limits

The original child service exited 1 on a refused Control connection. Six real child
service tests now pass: refused connection plus subsequent health/static access;
malformed URL; real HTTP proxy bytes/status/cookies; held upstream headers and empty
body; partial-body timeout; client disconnect closing the real upstream. The
independent reviewer repeated the suite and additionally verified a 2.1 MB request
returns 413 while health stays 200, and a paused downstream client under backpressure
closes its upstream on disconnect. No replacement Studio or Control transport was
used; the local upstream tests do not prove Control business behavior.

Commands: node --test skills/prism/tests/studio-service.test.mts; Prism TypeScript
check; canonical ESLint of server/studio.ts, studio-config.ts, studio-request.ts
and the new test. These checks pass. Full deployed browser/Control/Tailscale flow
has not been run. Source logs continue on stderr for the existing collector;
no disk retention policy or central pipeline log store was added.
