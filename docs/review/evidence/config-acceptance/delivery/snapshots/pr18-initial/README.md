# Delivery / host / extension semantic checkpoint (C0 incomplete)

Author task `/root/delivery_inventory`, source commit
`9452d35524192f8665bc87254b3c63a361e7bd4a`, source tree
`89fa8e4d683cf442deb189d60ce8b7cc1ff05327`. This task changed evidence only,
not production/tests, and made no commit/deployment. Parent records dirty patch
and untracked evidence identities at the shared checkpoint.

## Evidence and limits

- `inventory-fragment.json`: 762 unique setting IDs, 116 hashed source records.
  Each row's **status is authoritative**: 133 `source-traced`, 629 explicitly
  open/blocked semantic rows. A `source-traced` row means author/reader behavior
  was inspected, not independent acceptance or a runtime implementation PASS.
- `collect-delivery.cjs`: reproducible evidence-only collector. Manual semantic
  annotations come from reader inspection; AST/YAML/regex enumeration only
  expands fields and cannot discharge semantic open states. It coalesces the
  three same-valued Ops TARGETARCH declarations into one ID with enumerated
  authored occurrence records, not duplicate settings.
- `source-observations.txt`, `gateway-author-observations.txt`: commands,
  actual source observations and exit statuses. No environment credentials were
  queried or retained. Secret-shaped input values are redacted in rows.
- `health-source-checks.json` and `.txt`: execution of the exact extracted
  generated health source. Missing required marker exits 1; explicitly false
  marker gate exits 0; **invalid boolean also exits 0**. These are current-source
  observations, not proof that the target contract passes. The extraction is
  `extracted-kubeclaw-health.mjs` with its digest retained.
- `proposed-cases.json`: eight exact delivery/health implementation case
  specifications, all `not-run`, with existing source/test identities. New
  cases linked by later added rows remain proposed and require parent matrix
  expansion, not an implied execution result.
- `docker-context-tool-blocked.txt`: `go test ./...` could not start (exit 127,
  Go absent). Docker also absent. Helm is available. Context text inspection
  is not a successful Docker build or matcher run.
- `open-row-backlog.json`: exact 629 unfinished setting IDs, source identities
  and remaining boundary obligations.
- `pending-source-candidates.json`: 261 source files with exact candidate
  field names/lines and hashes for continuation. This is **lexical backlog**,
  never a semantic exclusion/disposition claim.

## Independently established productive findings

1. Observer resolver has registration/service/hook overlay precedence over ENV,
   re-resolves event configuration and mutates writer limits. Hook priority and
   timeout are captured only when `api.on` registers. Existing Redis connections
   are retained despite transport configuration updates. Rows now have exact
   field-specific errors and productive consumer locations, with proposed S
   extension profiles instead of a generic per-stage activation.
2. Prism OpenClaw extension's `controlUrl` is tool context > ENV > loopback
   fallback, with no request timeout. It is proposed S topology policy, never M
   task input. Chart literal is explicitly connected to its actual extension
   reader; current physical owner is not only the manifest.
3. Namespacecontroller lease API group/version share the selected Buster
   `clusterInvokers.shared` author through CRD/RBAC/ENV/client projection.
   `DLV-NAMESPACE-CONTROLLER-BUSTER-LEASE-API-GROUP/VERSION` reference
   `CMP-buster-engine-clusterInvokers.shared.leaseApiGroup/leaseApiVersion`.
   A separate controller author is withdrawn. Go fallback removal requires
   coordinated S/R protocol migration, not arbitrary module selection.
4. Buster entrypoint authors generated runtime/platform policies independently
   of the existing six component documents: capabilities, tool/network/browser
   budgets, storage, timeout, source authority and platform policy. Individual
   fields are expanded; exact downstream domains remain open for engine-owner
   cross-check. Generated filenames do not transform these authors into constants.
5. Health helper has unchecked `parseInt(ENV || literal)` timeout/stream-limit
   inputs, absent/unknown boolean behavior, stream writes, startup status with
   no generation/age validation and optional bundle identity comparisons. All
   34 health field rows have actual source lines/consumers and proposed S policy.
6. Gateway Chart literals include embedding model, thinking/reasoning policy,
   model allowlist/runtime routes, pruning TTL, compaction token budget,
   subagent/exec/session/Discord/gateway/ACP policies. They are operator settings,
   **not protocol invariants**. Managed memory/model/ACP/plugin subtrees overwrite
   persistent config each init; other defaults seed once and persisted values
   may win thereafter. This difference is recorded per row. The pinned OpenClaw
   2026.9.5 image source is not available here; local `/app` is 2026.9.9 and cannot
   establish the pinned parser/consumer/error contract. Those 69 gateway rows
   remain external-validator-blocked. No unsupported model parameter is assumed.
7. Native host policy validates exact two role pools, safe positive resources,
   page-aligned memory and aggregate arithmetic. Renderer produces pool/NRI/
   reservation/systemd artifacts; initial installation refuses existing/running
   pool state. Host actual capacity/live installation are not invented.

## Concrete C1 delivery closure

Approved C1 must migrate the existing entry to `pipeline.config.json` and keep
`pipeline.json` as workflow graph. Its exact delivery delta includes:

- Actual Chart `.Files.Get`, helper bundle list, symlink aliases, ConfigMap
  names/file keys/checksums, Pod ENV/mount paths and deploy `config_file` roster.
  The entry plus selected six components and Buster complete runtime variant
  must remain one complete, readonly selected generation.
- Root Docker context/COPY closure: Buster Dockerfile currently asks for six
  component files and helper scripts excluded by `.dockerignore`'s default-deny
  rules. Merely renaming one permitted author path is insufficient. Admit only
  intended complete closure, preserve protected my-values/local/secret exclusion.
- `scripts/updates/runtime-inputs.mjs` and actual calling workflows: Chart-only
  config changes currently count as deployment inputs, not image inputs. New
  entry/profile/closure changes must reach the intended build/package path.
- Release guard `configurationAliases` old-name literals and path coverage,
  `verifyReleaseConfiguration`, actual materializer and selected-code receipt
  compatibility checks; changed schema/target bytes and equal-byte alias
  replacement must still reject.
- Real role packaging callers and `/app/skills` facade/install graph. Existing
  builder currently packages code-selected packages/plugins/extensions; it does
  not by itself prove selected configuration closure.
- `check-built-runtime-image.sh` mounts host Chart config into service images;
  this proves that loader path only, not baked config identity. Acceptance must
  explicitly distinguish intended immutable mount delivery from baked closure.

Proposed executable cases cover config-only CI, complete Docker generation,
release drift/aliases, role packaging and real Chart package/mount/load. Existing
649-case baseline's four diagnostic mismatches are neither fixed nor relabelled
PASS in this task. All implementation cases remain `not-run` pending approval.

## Exact continuation queue (not deferred out of scope)

1. 338 `chart-*` rows: resolve each template alias/conditional body, actual
   Kubernetes or process domain/error and effective value override. Direct or
   ancestor template reference alone is insufficient. Lists/dynamic maps such
   as `extraContainers`, `extraEnv`, `capabilityProviders` need enumerated members
   from all caller/operator inputs, including bypass rejection.
2. 122 generated runtime/transport rows: expand per-field actual option constructor
   domain/error and consumption, shared registry/secret binding precedence and
   platform schema; annotate configuration constants vs security-layout bindings
   only after the concrete reader justification.
3. 86 Docker ARG rows: expand per-ARG download/checksum/platform domains; enumerate
   Docker ENV and baked launcher arguments as operator/binding/protocol fields.
   Existing versions.json authority remains V; build overrides must not create
   an untracked second version author.
4. 9 controller rows: downstream TTL/namespace/RBAC authorization validation and
   stored lease expiry/recovery interaction. Also classify HTTP 60s, security
   refresh 5s and readiness HTTP header/timeouts/retention limits individually.
5. 74 external native policy rows: retrieve exact pinned OpenClaw/Codex reader
   and schema identities; native config persistence/doctor migration effects and
   model parameter support are currently blocked, not inferred from a new build.
6. All remaining script ENV/CLI/host/release/build inputs in the 261-file candidate
   queue need real productive callers, precedence, classification and per-source
   disposition. Repair/install literals are not automatically test fixtures.
7. Update full case links for gateway policy, shared lease protocol and observer
   alternate/old-author validations; independent reviewer must recheck material
   corrections. Parent owns consolidated matrix/current definition and reader
   overlap coordination; no global C0 or C1 approval is claimed.

Corrections respond to the independent report
`docs/review/remediation/independent-config-c0-9452d355.md`; this author checkpoint
does not replace the reviewer's verdict or close remaining IC0 findings.
