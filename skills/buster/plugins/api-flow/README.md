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

