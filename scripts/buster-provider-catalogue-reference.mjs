// Reader contract for the remote capability catalogue; separate from Buster plugin schemas.
export const providerCatalogueReference = `<a id="remote-capability-provider-catalogue"></a>

## Remote Capability Provider Catalog

The production verification harness reads \`KUBECLAW_CAPABILITY_PROVIDERS\` as
JSON. This is a remote capability routing catalog, not the installed Buster
plugin registry or a Kubernetes namespace configuration. Its provider IDs use lowercase DNS-label syntax (1–63 characters). Each provider
needs an agentRole and a nonempty capabilities map.

The parser checks
\`String(agentRole)\` and \`String(adapter)\` against the same DNS-label pattern,
but returns their original values without string conversion. For example, JSON
boolean \`true\` and number \`1\` pass that lexical check and stay a boolean
and number in the returned record. This is not string-only type validation.

Capability names are dotted lowercase identifiers. Each route needs an adapter
whose string form passes that check and an HTTP(S)
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
\`CAPABILITY_PROVIDER_NOT_FOUND:<providerId>\`. A missing route fails with
\`CAPABILITY_PROVIDER_ROUTE_NOT_FOUND:<providerId>:<capability>\`. Missing,
malformed, or empty catalogs and invalid provider, route, or endpoint values
stop parsing. This parser neither registers installed plugins nor verifies
remote health, authentication, or Kubernetes namespace isolation. A namespace
field in the input has no selection or isolation effect.

> [Catalog parsing and exact route selection](https://github.com/datrab/kubeclaw/blob/CATALOGUE_SOURCE_REVISION/tests/verification/e2e/provider-catalog.mjs#L8-L61).

`;
