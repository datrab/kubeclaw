# Central runtime configuration

Start with `pipeline.config.json`. Its `components` map selects the authored files
under `components/`; its bindings select each component's profile. Change values
in those files, not in TypeScript defaults or independently edited chart copies.

Each component file contains `profiles.<profile>.settings`. For example, the
standard Prism Worker nonce database settings are in:

`components/prism-worker.config.json#/profiles/standard/settings/nonceDatabase`

- `timeoutMs`: database connect/query deadline, in milliseconds (750 preserves the previous behavior).
- `maximumConnections`: both pool capacity and simultaneous database-operation admission (4 preserves the previous behavior).

Both settings are required positive integers. There is no fallback in the worker.
Settings are captured at service startup; publishing a new generation does not
mutate an already-running service's captured configuration. Use the normal package
and configuration generation route for delivery; these changes do not deploy it.

## Prism ingestion and artifact clients

`components/prism-control.config.json` owns `ingestionServer` (the standalone
receiver policy), `maximumArtifactAcknowledgmentBytes`, and `agentLauncher`
(claim lifetime plus accepted attempt limits). The receiver has its own
`prism-ingestion` service selection; it does not reuse a Control caller capture.
The TTL is an explicit integer between 60000 and 86400000 ms. Port, paths,
limits and media policy are required. Former ingestion PORT/quarantine ENV
settings are rejected; only the ingestion secret remains external.

The artifact response budget is passed from verified Worker startup into its
closed child environment, and from verified Control startup into a persisted
agent attempt assignment. Publishing B does not rewrite an existing A snapshot
or accepted attempt. There is no client constructor fallback.

Normal standalone Prism image/chart/release sources now emit authenticated role
packages and generations. The complete `spiffe` Control profile is selected for
production Control/Worker; `standard` remains explicit. A separate bridge caller
selects `agentBridge` settings under the same Control owner. Its image and CI proof
use the installed authenticated entry, not raw `/opt` source. Generated bridge
probe fields are checked by `config:prism:check`; sync regenerates them.
This is not actual Docker acceptance. Kubeclaw/Buster/gateway chart cutover remains
open; its old helper currently rejects the new schema.

`databaseBootstrap` owns connect timeout/retry count/delay. Execution `enginePolicy`
owns cache and ingest/render caps. Studio `browserPolicy` is the only public subset
served at `/studio-config`; credentials and server endpoints are not serialized.
All browser consumers require it before startup, with no fallback. Launcher
`terminationGraceMs` is persisted in accepted input v3, not reread from current B.

## Remaining migration

This directory is not yet proof that all configuration has been centralized.
The source audit is available via:

```sh
node scripts/config/audit-centralization.mjs
```

It reports numeric candidates requiring semantic review, not confirmed remaining
settings or a completeness score. Strings, booleans, environment fallbacks,
embedded code and deployment configuration also need review. Ordinary counters,
unit conversions and protocol constants should remain code, not operator config.
