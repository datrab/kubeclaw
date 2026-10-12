# API Flow Provider

`kubeclaw.api-flow@1` runs a strict sequence of HTTP and WebSocket actions.
It reads a versioned flow file from the repository and uses the brokered
`network.http` capability. The provider does not receive network credentials
or open sockets directly.

The flow contract validates every action, assertion, extraction, and variable.
Operator policy controls origins, methods, headers, WebSocket use, request
bytes, response bytes, and deadlines. Mutation and credential headers require
an exact approved origin or a resolved deployment fixture.

Run the real local HTTP and WebSocket verification with:

```bash
npm test --prefix skills/buster/plugins/api-flow
```


A passing flow requires at least one executed main `steps` request. Setup and
cleanup alone do not establish main-step coverage; unresolved dependency skips
remain skipped and produce a separate coverage finding when every main step is
skipped. An independent main step can still execute after a dependency skip.
Capability errors remain execution errors: further main requests stop, cleanup
is attempted, and the original error is rethrown. Caller cancellation takes
precedence and stops further requests, including cleanup.
