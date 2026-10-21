// Reader contract for the remote capability catalogue; separate from Buster plugin schemas.
export const providerCatalogueReference = `## Remote Capability Provider Catalogue

The production verification harness reads \`KUBECLAW_CAPABILITY_PROVIDERS\` as
JSON. This is a remote capability routing catalogue, not the installed Buster
plugin registry or a Kubernetes namespace configuration. Its provider IDs and
agent roles use lowercase DNS-label syntax (1–63 characters). Each provider
needs an agentRole and a nonempty capabilities map. Capability names are dotted
lowercase identifiers; each route needs a DNS-label adapter and an HTTP(S)
origin without credentials, path beyond '/', query, or fragment. The parser
normalizes the endpoint to its origin. Unknown input fields are not rejected,
but they are not copied to the returned records.

The returned provider record has exactly these declared fields:

| Provider field | Source expression |
| --- | --- |
| \`agentRole\` | \`value.agentRole\` |
| \`capabilities\` | \`capabilities\` |

Selection uses the exact provider ID and capability key, not agentRole or a
fallback provider. A missing provider fails with
\`CAPABILITY_PROVIDER_NOT_FOUND:<providerId>\`; a missing route fails with
\`CAPABILITY_PROVIDER_ROUTE_NOT_FOUND:<providerId>:<capability>\`. Missing,
malformed, or empty catalogues and invalid provider, route, or endpoint values
stop parsing. This parser neither registers installed plugins nor verifies
remote health, authentication, or Kubernetes namespace isolation. A namespace
field in the input has no selection or isolation effect.

> [Catalogue parsing and exact route selection](https://github.com/datrab/kubeclaw/blob/cf549b0238c89db00cc392dadbab40199777a6d7/tests/verification/e2e/provider-catalog.mjs#L8-L61).

`;
