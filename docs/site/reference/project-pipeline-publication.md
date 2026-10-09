# Project Pipeline Publication

Status: current configuration reference
Audience: project author, pipeline operator, maintainer
Owner: Nova project setup
Evidence: skills/nova/project_setup/tools/progress-scaffold.ts; skills/nova/project_setup/tools/progress-scaffold-validation.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/nova/core/test-gates/pipeline.ts
Applies to: coupled `.swarm/progress.json` and `.swarm/pipeline.json`
Last verified: 2026-10-09 at source revision `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`

## One logical publication

`.swarm/progress.json` and `.swarm/pipeline.json` describe different parts of
one project generation. Project setup publishes them together so a reader does
not combine module/gate authoring from one edit with test-provider policy from
another.

- `progress.json` holds project, ordering, modules, gates, and classic policy
  selections generated from `progress.scaffold.json`.
- `pipeline.json` holds lint inputs and module/gate test-provider declarations.
- `.scaffold-publication/` holds immutable generation members and the committed
  pointer that makes one pair current.

Neither file is Nova runtime progress. Attempts, facts, waits, and results live
under the platform `storageRoot`.

## Supported workflow

This procedure publishes and verifies a local pair. It does not compile a Nova
project, contact a test endpoint, or start a provider. Use the recorded source
revision, Linux, Node.js 24, Git, Bash, util-linux `flock` at `/usr/bin/flock`
with `--timeout` support, and the dependencies from [Locked Dependency
Installation](../use/quickstart.md#locked-dependency-installation). Run from the
repository root as its checkout owner. The owner needs write access to the
new temporary directory; no Kubernetes, model-provider, or production-storage
permission is required.

Before creating the disposable project, check the required locking command:

```bash
set -euo pipefail
publication_flock_help="$(/usr/bin/flock --help 2>&1)"
case "$publication_flock_help" in
  *--timeout*) ;;
  *) printf '%s\n' 'Required /usr/bin/flock lacks --timeout; stop' >&2; exit 1 ;;
esac
```

BusyBox `flock` does not meet this prerequisite. Changing `PATH` cannot correct
it because the durable store uses an absolute path. Install the required host
tool through the host owner before proceeding; do not bypass the lock.

The example uses a disposable Git repository with one module. `FORGE.md` is its
implementation instruction, and `BUSTER.md` is its test instruction. Discovery
creates the test declaration, including an HTTP origin that must be supplied.
The loopback origin below is authoring data only. Publication checks its presence;
it does not prove reachability or provider admission. Before using this plan in a
real run, resolve it with the selected registry and grants and prove the endpoint
from the provider's execution location. See [Project test pipeline](pipeline-json.md).

### 1. Prepare the disposable project

Keep the same Bash shell for all steps. Stop on any nonzero command. Do not
replace an existing project to run the example.

```bash
set -euo pipefail
umask 077
publication_repo="$(mktemp -d "${TMPDIR:-/tmp}/kubeclaw-publication.XXXXXX")"
publication_swarm="$publication_repo/Projects/demo/src/.swarm"
publication_evidence="$(mktemp -d "${TMPDIR:-/tmp}/kubeclaw-publication-evidence.XXXXXX")"
export publication_repo publication_swarm
printf '%s\n' "$publication_repo" > "$publication_evidence/disposable-root.txt"
git rev-parse HEAD > "$publication_evidence/source-revision.txt"
node --version > "$publication_evidence/node-version.txt"
git init -q "$publication_repo"
mkdir -p "$publication_swarm/modules/01-app"
printf '# App\nBuild one disposable application.\n' \
  > "$publication_swarm/modules/01-app/FORGE.md"
printf '# Tests\nCheck the declared HTTP health endpoint.\n' \
  > "$publication_swarm/modules/01-app/BUSTER.md"
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo \
  > "$publication_evidence/discovery.txt"
cat "$publication_evidence/discovery.txt"
```

Expected observation: `.swarm/progress.scaffold.json` exists and discovery
reports `TODO:` diagnostics for the description, execution order, and provider
origin. Discovery can exit zero with these diagnostics because it prepares a
form. This is not a publication success. Neither current JSON file nor a
committed pointer should exist yet.

### 2. Complete and validate the authoring input

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
const file = path.join(process.env.publication_swarm, 'progress.scaffold.json');
const value = JSON.parse(fs.readFileSync(file, 'utf8'));
value.description = 'Disposable publication example';
value.notes = ['Local publication only; providers are not executed.'];
value.execution_order = ['01-app'];
value.pipeline.modules['01-app'].tests['http-health'].config.url = 'http://127.0.0.1:3000';
fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
JS
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo --check \
  > "$publication_evidence/check.txt"
cat "$publication_evidence/check.txt"
test ! -e "$publication_swarm/progress.json"
test ! -e "$publication_swarm/pipeline.json"
test ! -e "$publication_swarm/.scaffold-publication/current.json"
```

Expected observation: `progress scaffold validation passed`, exit zero, and
no published files. A failed check identifies a `form_check` or
`strict_content_check` field. Correct that field in the scaffold and repeat
this step. Do not continue while a `TODO:` or missing control file remains.

### 3. Publish and read the exact committed pair

```bash
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo --apply \
  > "$publication_evidence/apply.txt"
cat "$publication_evidence/apply.txt"
node --input-type=module - "$publication_swarm" <<'JS' \
  > "$publication_evidence/strict-read.txt"
import assert from 'node:assert/strict';
import path from 'node:path';
import {readPublishedPair} from './skills/common/plugin-runtime/foundation/config/published-pair.ts';
import {loadPipelineTestScope} from './skills/nova/core/test-gates/pipeline.ts';
const swarm = process.argv[2];
const [progress, pipeline] = readPublishedPair(swarm, ['progress.json', 'pipeline.json']);
assert.equal(progress.project, 'demo');
assert.equal(pipeline.project, 'demo');
assert.equal(loadPipelineTestScope(path.join(swarm, 'pipeline.json'), {moduleId: '01-app', gateId: null}).project, 'demo');
console.log('Committed pair and module test scope verified');
JS
cat "$publication_evidence/strict-read.txt"
sha256sum "$publication_swarm/progress.scaffold.json" \
  "$publication_swarm/progress.json" "$publication_swarm/pipeline.json" \
  "$publication_swarm/.scaffold-publication/current.json" \
  > "$publication_evidence/publication.sha256"
```

Expected observation: apply reports both written members, and the strict read
prints `Committed pair and module test scope verified`. The reader verifies the
pointer, immutable members, and loose copies before the scope loader accepts
module `01-app`. This proves local publication and scope loading, not provider
schema resolution or endpoint health.

### 4. Retain evidence and clean up

If publication fails, keep the disposable repository and use [Failure and
recovery](#failure-and-recovery). Inspect the original identities before retry.
After the strict read succeeds, retain the authoring input and complete
publication directory with the command outputs:

```bash
cp -R "$publication_swarm" "$publication_evidence/swarm"
test -f "$publication_evidence/swarm/.scaffold-publication/current.json"
node --input-type=module - "$publication_evidence/swarm" <<'JS'
import {readPublishedPair} from './skills/common/plugin-runtime/foundation/config/published-pair.ts';
readPublishedPair(process.argv[2], ['progress.json', 'pipeline.json']);
console.log('Retained pair verified before cleanup');
JS
case "$publication_repo" in
  "${TMPDIR:-/tmp}"/kubeclaw-publication.??????) ;;
  *) printf '%s\n' 'Unexpected cleanup path; stop' >&2; exit 1 ;;
esac
rm -r -- "$publication_repo"
test ! -e "$publication_repo"
printf 'Retained evidence: %s\n' "$publication_evidence"
```

Delete only the exact newly created root. Keep the evidence directory until the
checkout owner has accepted the observations. A publication copied to another
filesystem requires a new strict read there before it becomes execution input.

`--project` resolves `<repo>/Projects/<project>/src/.swarm`. `--swarm` selects an
explicit absolute directory; provide `--project` too when it cannot be inferred.
`--repo` overrides repository-root discovery. `--scaffold` selects another
scaffold path. `--print` emits the computed pair. `--apply` and `--check` cannot
be combined. `--help` (or its short alias `-h`) prints the supported command form and exits without
reading or writing a project.

> **Source evidence — scaffold command selection**
>
> **Claim:** Help exits before context resolution, while the other switches
> select validation, rendering, or publication behavior.
>
> **Implementation:** [absolute locking command and timeout](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L186-L203); [argument parsing](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/nova/project_setup/tools/progress-scaffold.ts#L43-L71); [command dispatch](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/nova/project_setup/tools/progress-scaffold.ts#L148-L163)
>
> **Revision:** `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`

The discovery command in step 1 writes the editable scaffold. Regeneration preserves an
existing scaffold `pipeline` object rather than replacing its authored
provider plan. Resolve all `TODO:` diagnostics before apply.

## Validation before publication

Scaffold validation checks project identity, at least one module, safe module
and gate IDs, module directories and `FORGE.md` files, dependencies, stage and
suite values, referenced instructions, gate behavior, execution order, lint
declaration, pipeline scope presence, and provider-specific test configuration.
Diagnostics are either `form_check` or `strict_content_check`; both block apply.

The applied `progress.json` is built only from the scaffold's supported fields.
The applied `pipeline.json` is the scaffold `pipeline` object. Project setup
does not resolve providers or execute them during publication.

## Generation layout and identity

For names `progress.json` and `pipeline.json`, the publisher:

1. Serializes each value as indented JSON with a final newline.
2. Rejects either member above 64 MiB.
3. Records each member's exact byte length and lowercase SHA-256 digest.
4. Calculates the generation ID as SHA-256 of the ordered
   `[name,digest,bytes]` tuples.
5. Writes immutable members below
   `.scaffold-publication/<generation>/` using create-only files and links.
6. Materializes both loose current files through temporary-file rename.
7. Atomically writes `.scaffold-publication/current.json` last.
8. Reads the committed pair again and verifies every byte.

`current.json` is a closed logical manifest:

```json
{
  "schemaVersion": "published-json-pair.v1",
  "generation": "<64 lowercase hex characters>",
  "members": [
    { "name": "progress.json", "digest": "<64 lowercase hex>", "bytes": 123 },
    { "name": "pipeline.json", "digest": "<64 lowercase hex>", "bytes": 456 }
  ]
}
```

The member order is part of the generation identity. Member names must be
different and match the publisher's lowercase JSON filename rule.

## Reader behavior

If `.scaffold-publication` is absent, the reader accepts available loose files;
this supports a project that has not yet used coupled publication. The reader
rechecks that the publication directory did not appear during the loose read.

If the directory exists, the reader requires a valid current pointer, valid
immutable generation, matching member digests/lengths, stable directory
identities, and—by default—byte-identical loose materializations. Damage never
causes fallback to loose files. The test-plan loader uses this strict mode.

The scaffold discovery path reads with loose-copy verification disabled so it
can prepare a corrected publication from the committed generation. That is a
repair input path, not execution authority.

## Concurrency and file safety

The publisher pins directory device/inode identities, rejects symlinked or
multi-linked current targets, uses a durable store lock, writes immutable
generation files, fsyncs files/directories, and commits with one pointer update.
Concurrent substitution or mutation produces `PUBLISHED_PAIR_CHANGED`.

**Current technical inference:** The strict reader prevents a run from combining
members of different generations. Its cost is reduced availability when either
materialization is damaged: operators must reconcile the pair before execution.
The source proves this behavior, but it contains no recorded historical reason
for choosing this trade-off. The Nova project-setup owner owns that unknown.
Reconsider the mechanism if a new storage or publication contract can prove a
consistent pair during interruption without accepting mixed generations.

## Failure and recovery

| Signal | Meaning | Safe recovery |
| --- | --- | --- |
| `OBSERVABILITY_STORE_LOCK_FAILED` | Durable publication lock could not be acquired or the host locking command is incompatible. | Check `/usr/bin/flock` for `--timeout` support and stop competing writers. Keep the pair and never bypass locking. |
| `PUBLISHED_PAIR_UNCOMMITTED` | Publication directory exists without a committed pointer. | Preserve contents, correct the scaffold, run `--check`, then `--apply`. |
| `PUBLISHED_PAIR_MANIFEST_INVALID` | Pointer shape, member identity, or generation digest is invalid. | Do not hand-edit the pointer. Republish from a validated scaffold. |
| `PUBLISHED_PAIR_MEMBER_INVALID` | Immutable member does not match length/digest or valid JSON. | Preserve evidence and republish. Investigate storage integrity. |
| `PUBLISHED_PAIR_MATERIALIZATION_DIVERGED` | Loose current file differs from committed member. | Do not choose the newer-looking file. Reconcile authoring in the scaffold and republish both. |
| `PUBLISHED_PAIR_TARGET_INVALID` | Current target is not a single regular non-symlink file. | Correct filesystem ownership/layout before publication. |
| `PUBLISHED_PAIR_CHANGED` | Directory/file changed during a protected read/write. | Stop concurrent writers, then retry the full checked publication. |
| `PUBLISHED_PAIR_GENERATION_CONFLICT` | Same generation ID already contains different bytes. | Treat as integrity failure; retain the directory and investigate. |
| `PUBLISHED_PAIR_SIZE_EXCEEDED` | A serialized member exceeds 64 MiB. | Reduce authored data; do not bypass the limit. |

Never repair by copying only one file, deleting the current pointer to force
fallback, or changing a digest by hand. After publication, run the loader or
resolver check that consumes the selected scope.

## Compatibility and change impact

The current publication manifest is `published-json-pair.v1`. Generation
identity is based on exact serialized bytes, so whitespace from another writer
can create a different generation even when JSON values are equivalent. Use
the supported publisher for stable formatting.

Publication does not make an active Nova run adopt changed project policy.
Resolve new plans and start a new run that owns the changed project input.

> **Source evidence — atomic pair commit**
>
> **Claim:** The publisher commits two exact JSON members through one current pointer, and readers fail closed on a partial or divergent committed publication.
>
> **Implementation:** [strict reader](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/common/plugin-runtime/foundation/config/published-pair.ts#L45-L76); [publisher](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113); [scaffold apply](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145)
>
> **Contract or setting:** [manifest and generation identity](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/common/plugin-runtime/foundation/config/published-pair.ts#L7-L15)
>
> **Test evidence:** [partial-publication and interrupted-writer rejection](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L28-L50); [corruption, symlink, and loose-file rejection](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L53-L68); [concurrent publisher serialization](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L72-L87)
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran `node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs tests/skills/nova/project_setup/scaffold-publication.test.mjs` against implementation revision `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`: all 29 tests passed, exit zero. The local process used util-linux `flock` 2.42.3 at `/usr/bin/flock` and GNU `tar` 1.35 at `/usr/bin/tar`, supplied through temporary PRoot file bindings without changing system files. All five Bash blocks in the disposable procedure above were also executed unchanged: preparation, validation, publication, strict reads, retained-evidence verification and cleanup succeeded. This proves local publication; providers and live services were not executed. A host with BusyBox locking or without the required archive command does not meet the suite prerequisites.
>
> **Revision:** `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`
>
> **Limit:** Atomic local publication does not prove that an external filesystem, backup, or Git transport preserves the directory durably.
