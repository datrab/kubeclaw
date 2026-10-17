# Project Pipeline Publication

Status: current configuration reference
Audience: project author, pipeline operator, maintainer
Owner: Nova project setup
Evidence: [skills/nova/project_setup/tools/progress-scaffold.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/project_setup/tools/progress-scaffold.ts); [skills/nova/project_setup/tools/progress-scaffold-validation.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/project_setup/tools/progress-scaffold-validation.ts); [skills/common/plugin-runtime/foundation/config/published-pair.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/config/published-pair.ts); [skills/nova/core/test-gates/pipeline.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/test-gates/pipeline.ts)
Applies to: coupled `.swarm/progress.json` and `.swarm/pipeline.json`
Last verified: 2026-10-12 at source revision `ad73a0df62607ea9634304c3e9518826450a6a25`

## One logical publication

`.swarm/progress.json` and `.swarm/pipeline.json` describe different parts of
one project generation. A generation is an exact stored pair with one identity.
Project setup publishes both files through one pointer. The strict pair reader
rejects module/gate authoring and test-provider policy from different generations.

- `progress.json` holds project, ordering, modules, gates, and classic policy
  selections generated from `progress.scaffold.json`.
- `pipeline.json` holds lint inputs and module/gate test-provider declarations.
- `.scaffold-publication/` holds immutable generation members and the committed
  pointer (`current.json`) that makes one pair current.

A loose file is a current copy outside the immutable generation directory.
A materialization is the publisher-created loose copy of a generation member.
Immutable means that the publisher can create or verify stored bytes, but cannot
replace them with different bytes under the same generation identity.

Neither file is Nova runtime progress. Attempts, facts, waits, and results live
under the platform `storageRoot`.

## Supported workflow

This procedure publishes and verifies a local pair. It does not compile a Nova
project, contact a test endpoint, or start a provider. Use the recorded source
revision, Linux, Node.js 24, Git, Bash, util-linux `flock` at `/usr/bin/flock`
with `--timeout` support, GNU coreutils, and the dependencies from [Locked Dependency
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
creates an HTTP health declaration and a blocking dependency-security scan.
The HTTP declaration needs an origin that the author must supply.
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
reports `TODO:` diagnostics for the description, notes, and provider origin.
Discovery can exit zero with these diagnostics because it prepares a form.
This is not a publication success. Neither current JSON file nor a committed
pointer should exist yet.

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

`--project` resolves `<repo>/Projects/<project>/src/.swarm`. `--swarm` takes precedence
for the directory; provide `--project` too when it cannot be inferred.
`--repo` overrides repository-root discovery. `--scaffold` selects another
scaffold path. `--print` emits the computed pair. `--apply` and `--check` cannot
be combined. `--help` (or its short alias `-h`) prints the supported command form and exits without
reading or writing a project.

Relative `--repo`, `--swarm`, and `--scaffold` paths resolve from the command's
working directory. Use absolute paths for recovery. The selected repository
must contain a `.git` entry, and the selected `.swarm` must already exist.
With no `--repo`, discovery selects the nearest parent of the working directory
with a `.git` entry. With no `--scaffold`, it selects
`<selected-swarm>/progress.scaffold.json`.
Repeated value flags use the last supplied value. Unknown flags, missing values,
and a non-help command without either `--project` or `--swarm` exit nonzero.
Argument errors still block `--help`; help bypasses only project resolution.
A project inferred from `--swarm` is the path component after the last `Projects`.
When `--swarm` and `--project` are both present, the project value selects the
identity checked in the scaffold, not another directory.
`--print` takes precedence over `--apply` and prevents publication.
Its output includes a validation message before the JSON object containing
`progress` and `pipeline`; the complete stdout stream is not a JSON document.
`--check` takes precedence over `--print` and prints validation only.
Use one mode per command so its effect is clear.

> **Source evidence — scaffold command selection**
>
> **Claim:** Help exits before context resolution, while the other switches
> select validation, rendering, or publication behavior.
>
> **Implementation:** [absolute locking command and timeout](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L186-L203); [argument parsing](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L43-L71); [command dispatch](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L148-L163)
>
> **Contract or setting:** [context paths and project identity](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L94-L111); [mode precedence in applyScaffold](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145)
>
> **Test evidence:** [discovery, validation failure, and apply](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/progress-scaffold.test.mjs#L68-L109). Status: PASS, local Node.js test execution on 2026-10-12.
> This test does not exercise every combined switch.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** Command selection and a valid authoring form do not prove a successful publication or provider execution.

The discovery command in step 1 writes the editable scaffold. Regeneration preserves an
existing scaffold `pipeline` object rather than replacing its authored
provider plan. Resolve all `TODO:` diagnostics before apply.

### Authoring authority and effective defaults

Discovery reads the committed pair with loose-copy comparison disabled.
It then reads the existing scaffold. Scaffold version, description, notes,
defaults, and execution order take precedence over progress values.
For these fields, missing, null, or empty-string values fall back to progress
and then discovery defaults. Empty arrays and objects, `false`, zero, and
whitespace-only strings do not trigger this fallback. Some discovered text
fields, such as module title and thinking level, instead reject whitespace-only
strings and use their fallback. These rules prepare a form; they are not
complete type validation.
An existing scaffold policy object wins as a whole; discovery does not merge its
missing policy fields with defaults. Existing module and gate entries override
discovered entries by field, with a shallow merge. Nested objects are replaced.

An existing scaffold `pipeline` is preserved as a whole.
An invalid object or mismatched project stops regeneration before any write.
New modules can therefore need new authored pipeline scopes after regeneration.
Without that scaffold field, discovery builds a provider plan from the prior
pair and discovered controls. See [Project test pipeline](pipeline-json.md)
for provider choices and their separate resolution rules.

Discovery supplies version `1` and module defaults of 300 minutes, three failures,
and `adaptive` thinking. Its initial policy enables architecture validation and
telemetry, and disables pipeline review and case study.
For discovered review gates, the defaults are `on_fail: stop`,
`review_output_dir: logs/echo-review`, 45 minutes, zero fix cycles, and
`lint_tier: full`. For discovered Buster gates, they are
`on_fail: fix_and_retest`, 90 minutes, and three fix cycles.
Existing progress values can replace these discovery defaults; existing
scaffold entry fields take precedence over the result.
These are discovery values, not a second runtime policy authority.
Apply uses the edited scaffold directly. It defaults only the output version to
`1`, copies supported policy fields to progress, and omits top-level null,
undefined, and empty-object values. It retains empty strings and arrays.
It does not fill missing module settings or resolve provider schema defaults.
Inspect `--print` before apply to see the effective pair.
The runtime configuration contracts remain on [Nova project](nova-project.md)
and [Project test pipeline](pipeline-json.md).

Keep secret values outside the scaffold, generated pair, and diagnostic output.
This publisher serializes authored data without redaction or encryption.
`--print`, immutable generations, and retained evidence can keep earlier values
after a later publication. Restrict access to the repository and evidence.
Provider credentials and grants belong to the selected provider execution path;
local publication neither obtains nor verifies them.

> **Source evidence — authoring precedence**
>
> **Claim:** Discovery preserves authored scaffold values; apply projects that scaffold into the pair without provider resolution or secret redaction.
>
> **Implementation:** [buildScaffold precedence](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-discovery.ts#L651-L694); [scaffoldToProgress projection](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-validation.ts#L236-L262)
>
> **Contract or setting:** [DEFAULTS](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-values.ts#L32-L57); [valueOrDefault and omitEmpty](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-values.ts#L78-L97);
> [module defaults](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-discovery.ts#L545-L581); [review and Buster gate defaults](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-discovery.ts#L589-L641)
>
> **Test evidence:** [existing provider plan and migrated health input](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/progress-scaffold.test.mjs#L205-L245). Status: PASS, local Node.js test execution on 2026-10-12.
> The test is not a secret-handling audit.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** Discovery defaults do not establish effective provider policy, credential access, or an active run's configuration.

## Validation before publication

Scaffold validation checks project identity, at least one module, safe module
and gate IDs, module directories and `FORGE.md` files, dependencies, stage and
suite values, referenced instructions, gate behavior, execution order, lint
declaration, pipeline scope presence, and selected test-configuration checks.
Diagnostics are either `form_check` or `strict_content_check`; both block apply.
Provider checking here is limited. For example, an HTTP declaration needs a
string URL or a deployment input object. This check does not establish that
the URL has an accepted format or that the input names a valid fixture.
The installed resolver must still validate the provider schema, input links, policy, and grants before execution.

The applied `progress.json` is built only from the scaffold's supported fields.
The applied `pipeline.json` is the scaffold `pipeline` object. Project setup
does not resolve providers or execute them during publication.

> **Source evidence — validation boundary**
>
> **Claim:** Scaffold checks reject their diagnostics before apply, but do not resolve the provider plan.
>
> **Implementation:** [validateScaffold](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-validation.ts#L221-L234); [scaffoldToProgress](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-validation.ts#L236-L262)
>
> **Contract or setting:** [HTTP scope check](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-validation.ts#L177-L192); [lint and scope selection](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-validation.ts#L194-L219)
>
> **Test evidence:** [unresolved form rejection and completed apply](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/progress-scaffold.test.mjs#L68-L109). Status: PASS, local Node.js test execution on 2026-10-12.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** A passing scaffold check does not prove the complete progress schema, provider configuration, fixture links, grants, or runtime execution.

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
causes fallback to loose files. The exported test-scope and lint loaders use this strict mode.

The scaffold discovery path reads with loose-copy verification disabled so it
can prepare a corrected publication from the committed generation. That is a
repair input path, not execution authority.

The test-scope loader requires `.swarm/pipeline.json` and exactly one module or
gate selector. It returns the selected declaration's coverage, suites, tests,
fixtures, and concurrency limits. The lint loader uses the same strict reader;
absent `lint` returns `null`, while a present declaration must select
`kubeclaw.lint.full` and at least one explicit input.
Pair errors become `TEST_PLAN_PIPELINE_INVALID` with the original error as cause.
Inspect that cause to distinguish publication damage from a missing scope.
These loaders do not validate the complete progress contract or compare both
project fields. Scaffold validation establishes that identity for this workflow.
Custom publishers must preserve the contracts of both members.

These are exported loader functions, not proof that every Nova input path reads
this pair. The legacy project importer reads the selected progress file directly.
It imports module structure into separately authored `nova-project.v2` input;
it does not read the publication pointer or pipeline member. Before an import,
verify the pair here and follow [Import a legacy project file](nova-project.md#import-a-legacy-project-file).
Publication alone does not compile, activate, or resume a Nova run.
The importer [reads the selected file directly](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project/legacy-import-cli.ts#L18-L25), then [imports structure and discards runtime state](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project/legacy-import.ts#L31-L75).

> **Source evidence — strict consumers**
>
> **Claim:** Both pipeline loaders read the pair strictly before selecting test or lint declarations.
>
> **Implementation:** [loadPipelineTestScope](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/core/test-gates/pipeline.ts#L12-L51); [loadPipelineLintDeclaration](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/core/test-gates/pipeline.ts#L62-L78)
>
> **Contract or setting:** [strict copy verification default](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L57-L76)
>
> **Test evidence:** [scope rejection after an interrupted writer](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L38-L50). Status: PASS, local Node.js test execution on 2026-10-12.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** This proves the loader boundary in source. Provider admission, endpoint health, and adoption by a Nova run need separate proof.

## Concurrency and file safety

The publisher pins directory device/inode identities, rejects symlinked or
multi-linked current targets, uses a durable store lock, writes immutable
generation files, fsyncs files/directories, and commits with one pointer update.
Concurrent substitution or mutation produces `PUBLISHED_PAIR_CHANGED`.

The lock covers publication, not scaffold edits or the CLI's earlier change
summary. Keep other authors stopped while validating and applying one input.
The lock waits up to five seconds; lock failure stops that attempt.
Readers do not acquire the writer lock. They reject a changing or divergent
pair during an interrupted publication, so they can be unavailable until repair.
The publisher does not automatically retry or select an older generation.

> **Source evidence — locking and safe files**
>
> **Claim:** Publication uses a bounded kernel lock and rejects unsafe current targets before replacing the pair.
>
> **Implementation:** [targetValid and materialize](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L94); [acquireKernelLock](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L184-L227)
>
> **Contract or setting:** [durable directory checks](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L134-L161); [lock file and error handling](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L244-L275)
>
> **Test evidence:** [unsafe second target](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L28-L36); [concurrent publication](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L72-L87). Status: PASS, local Node.js test execution on 2026-10-12.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** These tests do not prove durability after host power loss or authenticated ownership of the authoring files.

**Current technical inference:** The strict reader prevents its caller from
combining members of different generations. The current source implements
this mechanism. Its cost is reduced availability when either
materialization is damaged: operators must reconcile the pair before execution.
The source proves this behavior, but it contains no recorded historical reason
for choosing this trade-off. The Nova project-setup owner owns that unknown.
Reconsider the mechanism if a new storage or publication contract can prove a
consistent pair during interruption without accepting mixed generations.

## Failure and recovery

Stop project consumers and concurrent writers before recovery. The checkout
owner must preserve the scaffold, both loose files, publication directory,
command output, source revision, and file identities. Retain malformed bytes;
do not parse and rewrite the only evidence copy.

A validated scaffold does not prove that `--apply` can repair damaged files.
`--check` and `--print` return before reading the loose `progress.json`.
`--apply` parses that file for its change summary before calling the publisher.
Malformed or truncated JSON therefore stops apply before publication.
The publisher also refuses to replace conflicting immutable generation bytes.
Its generic error text mentions `--apply`; that suggestion does not remove
these repair limits.

| Signal or observation | Meaning | Safe action and boundary |
| --- | --- | --- |
| `OBSERVABILITY_STORE_PATH_SYMLINK` or `OBSERVABILITY_STORE_PATH_NOT_DIRECTORY` | Durable directory creation encountered an unsafe path. | Stop. Preserve the layout and have the filesystem owner establish a trusted directory; do not replace entries blindly. |
| `OBSERVABILITY_STORE_LOCK_FILE_INVALID` | The durable lock file is not regular or has multiple hard links. | Stop and preserve the lock path for the filesystem owner. Do not unlink or bypass an active lock. |
| `OBSERVABILITY_STORE_UNLOCK_FAILED` | The lock holder failed when releasing the lock. | The pair may already be committed. Preserve output and perform a strict read after confirming that no writer remains; a nonzero exit is not proof of no write. |
| `OBSERVABILITY_STORE_LOCK_FAILED` | The durable lock is unavailable or its host command is incompatible. | Verify the required absolute locking command. Stop competing writers. Retry only after the owner confirms exclusive access; never bypass locking. |
| `PUBLISHED_PAIR_UNCOMMITTED` | The publication directory exists without a committed pointer. | Preserve it. Use the bounded republish procedure below only when the scaffold, loose progress, directories, and intended generation meet its conditions. |
| `PUBLISHED_PAIR_MANIFEST_INVALID` | The pointer has invalid JSON, shape, member identities, or generation digest. | A missing or regular malformed pointer can be replaced through bounded republish. A symlink, unsafe target, or damaged immutable member requires the owner-directed stop below. |
| `PUBLISHED_PAIR_MEMBER_INVALID` | An immutable member fails JSON, digest, or length verification. | In-place repair is unsupported. Same-generation apply can fail with `PUBLISHED_PAIR_GENERATION_CONFLICT`. Preserve the exact member and stop for the project-setup and storage owners. |
| `PUBLISHED_PAIR_MATERIALIZATION_DIVERGED` | A loose file differs from the committed member. | Republish only with parseable loose progress and intact intended generation bytes. Malformed loose pipeline can be replaced; malformed loose progress blocks the CLI. |
| JSON parse error before publication | The scaffold or loose progress contains malformed or truncated JSON. | Correct an authored scaffold from trusted authoring input. Malformed loose progress has no supported automatic repair; preserve it and use the owner-directed stop. |
| `PUBLISHED_PAIR_TARGET_INVALID` | A current target is a directory, symlink, non-regular file, or has multiple hard links. | Stop. The filesystem owner must establish the intended target and preserve unexpected entries before any layout change. No generic destructive correction is supported. |
| `PUBLISHED_PAIR_DIRECTORY_INVALID` | A parent, publication, or generation directory has an unsafe type or symbolic-link substitution. | Stop. Retain directory identities and ask the filesystem owner to establish a trusted layout. Do not retry through the substituted path. |
| `PUBLISHED_PAIR_FILE_INVALID` or filesystem read error | A file has an invalid type/size, is absent, or cannot be read safely. | Preserve the path and error. The owner must distinguish storage damage, permissions, missing members, and unsafe targets before choosing any recovery. |
| `PUBLISHED_PAIR_CHANGED` | A protected file or directory changed during access. | Stop writers and consumers. Recheck identities and damage. Retry bounded republish only if its conditions still hold. |
| `PUBLISHED_PAIR_GENERATION_CONFLICT` | Existing bytes disagree with the computed immutable generation. | In-place repair is unsupported. Retain the directory and investigate integrity. Do not change authoring merely to create another generation. |
| `PUBLISHED_PAIR_SIZE_EXCEEDED` | A serialized member exceeds the publisher's size limit. | Reduce genuine authored input and validate again. Keep the previous pair; do not bypass the limit. |
| `PUBLISHED_PAIR_NAMES_INVALID` | A caller supplied unsafe or duplicate member names. | Keep the fixed `progress.json`/`pipeline.json` pair. An integration owner must correct a custom caller; renaming stored members by hand is unsupported. |

### Bounded republish of an intact generation

This path covers an interrupted publication, a missing or malformed regular
pointer, and loose-copy divergence. It does not restore corrupted immutable bytes
or malformed loose progress. Use the same checkout, source revision, project
identity, scaffold, and absolute `.swarm` path as the intended publication.
The project owner must confirm that this scaffold remains the authoring authority.
Do not select a newer-looking loose file as authority.

For the disposable project above, use this recovery path only before its cleanup.
Keep `publication_repo`, `publication_swarm`, and `publication_evidence` from
the same shell. After cleanup, the deleted disposable project cannot be recovered
through these bindings. Apply these steps only after
the owner has excluded symlink substitutions, unsafe targets, and storage damage.

1. Stop all readers and writers.
2. Preserve the complete `.swarm` directory in a new evidence destination.
   Keep the existing evidence directory.
3. Check that the scaffold and loose `progress.json` contain valid JSON.
   Missing loose progress is allowed; malformed existing progress requires the stop below.
4. Run the isolated admission procedure below against a preserved copy.
   Missing authority, unsafe original identities, or a failed isolated apply stops recovery.
5. Run the same scaffold command with `--repo "$publication_repo" --project demo --check`.
   Exit zero proves authoring validation only; it does not prove storage integrity.
6. Run that command with `--apply` only when every condition above holds.
   Expected observation: validation passes and both current files receive one committed generation.
7. Repeat the strict reader and module-scope loader in
   [Publish and read the exact committed pair](#3-publish-and-read-the-exact-committed-pair).
   Both must exit zero before any consumer resumes.
8. Retain the new pointer, complete immutable generation, member digests, output,
   and final strict-read result. Remove only disposable data after retained-copy verification.

For an existing project, replace `demo` with its owner-approved project identifier.
Bind the three absolute paths to that project's repository, `.swarm`, and evidence directory.
The project-setup owner must verify these bindings before any write.
A failed apply or strict read leaves consumers stopped; do not repeatedly retry
without identifying the failed condition.

The admission procedure uses the actual CLI on a private copy of `.swarm`.
It leaves the original publication unchanged. First, the filesystem owner must
exclude unsafe original directories, symlinks, and multiply linked current targets.
A copy can change file identities and hard links; it cannot prove original safety.
The owner must also confirm that the scaffold and all referenced repository inputs
will remain unchanged through recovery. Keep consumers and other writers stopped.

Run from the source checkout, with the same Bash bindings used above:

```bash
umask 077
publication_recovery="$(mktemp -d "$publication_evidence/republish-admission.XXXXXX")"
cp -R "$publication_swarm" "$publication_recovery/swarm"
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo \
  --swarm "$publication_recovery/swarm" \
  --scaffold "$publication_recovery/swarm/progress.scaffold.json" --check \
  > "$publication_recovery/check.txt"
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo \
  --swarm "$publication_recovery/swarm" \
  --scaffold "$publication_recovery/swarm/progress.scaffold.json" --apply \
  > "$publication_recovery/apply.txt" 2>&1
node --input-type=module - "$publication_recovery/swarm" <<'JS' \
  > "$publication_recovery/strict-read.txt"
import {readPublishedPair} from './skills/common/plugin-runtime/foundation/config/published-pair.ts';
readPublishedPair(process.argv[2], ['progress.json', 'pipeline.json']);
console.log('Isolated republish pair verified');
JS
cat "$publication_recovery/apply.txt" "$publication_recovery/strict-read.txt"
```

Expected observation: validation passes, apply reports both written members,
and the strict read prints `Isolated republish pair verified`.
This checks the publisher's serialization, intended generation, and existing
immutable bytes through its own implementation. It does not recreate those rules
in an independent admission script. The publisher can create a missing intended member;
a conflicting existing member must fail.

Any nonzero command stops the procedure before applying to the original.
Retain the entire admission directory, even after failure.
A successful copy does not authorize the original scaffold or prove the original
filesystem safe. It also does not exclude a later competing writer.
Use step 5 onward only while the owner-confirmed input and safety conditions remain true.
If apply to the original fails, keep consumers stopped and preserve the new error
and files. Do not use the successful isolated copy as execution authority.

### Unsupported corruption repair

The CLI cannot repair malformed loose `progress.json` automatically.
It also cannot overwrite a corrupt member under the same immutable generation.
The project-setup owner must choose a recovery plan with the storage owner.
Keep execution stopped and retain the original damaged directory until that plan
has an isolated proof. No supported generic restore command currently closes
these cases.

The intended result remains one exact, verified pair with preserved provenance.
A future repair tool must bind trusted source bytes and preserve damaged evidence.
It must respect directory identity and locking, then prove strict reads and scope loading.
It must cover malformed loose progress and conflicting immutable members without
forcing loose-file fallback. Until that contract and its corruption tests exist, stop at this boundary.
Do not delete generations, restore one member by hand, edit pointer digests,
or change content to evade an integrity failure.

> **Source evidence — repair admission**
>
> **Claim:** Check and print avoid the loose-progress parse; apply cannot replace conflicting immutable generation bytes.
>
> **Implementation:** [applyScaffold early return and loose-progress parse](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145); [immutableFile create-only conflict](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L83-L87)
>
> **Contract or setting:** [readJsonIfExists parses existing JSON](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold-values.ts#L117-L118); [publication target and commit sequence](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L95-L113)
>
> **Test evidence:** [interrupted apply and strict reader](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L38-L50); [corruption rejection and loose-pipeline repair](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L53-L68). Status: PASS, local Node.js test execution on 2026-10-12.
> The isolated CLI admission also completed on disposable local data. These
> tests do not prove automatic repair of malformed loose progress or immutable corruption.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** Copy admission cannot establish original file identities, exclusive ownership, or durable recovery on another filesystem.

## Compatibility and change impact

The current publication manifest is `published-json-pair.v1`. Generation
identity is based on exact serialized bytes, so whitespace from another writer
can create a different generation even when JSON values are equivalent. Use
the supported publisher for stable formatting.

Repeated apply with identical scaffold values computes the same generation.
It verifies existing immutable members and replaces current materializations and
the pointer through the publisher. It can report `progress.json is already current`
before discovering publication damage; that summary compares JSON values only.
A zero apply exit plus the final strict read establishes success.
Older generation directories and the `.write-lock` file remain stored.
An interruption can also leave member temporary files inside a generation.
The publisher implements no generation retention policy or generic generation
removal command. Preserve uncertain files until the storage owner has checked them.

There is no automatic rollback after either loose member is replaced.
Before the pointer commit, strict readers can reject divergence from the previous
generation. After the pointer commit, the new generation is current.
An owner can return to an earlier authoring input only by validating and applying
its trusted scaffold as another publication. The same target and integrity checks
still apply. A stored old generation alone does not prove its scaffold, repository
instructions, or provider policy are suitable for a new run.
Do not edit `current.json` to select an older generation by hand.

Publication does not make an active Nova run adopt changed project policy.
Resolve new plans and start a new run that owns the changed project input.

> **Source evidence — atomic pair commit**
>
> **Claim:** The publisher commits two exact JSON members through one current pointer, and readers fail closed on a partial or divergent committed publication.
>
> **Implementation:** [strict reader](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L45-L76); [publisher](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113); [scaffold apply](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145)
>
> **Contract or setting:** [manifest and generation identity](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/skills/common/plugin-runtime/foundation/config/published-pair.ts#L7-L15)
>
> **Test evidence:** [partial-publication and interrupted-writer rejection](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L28-L50); [corruption, symlink, and loose-file rejection](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L53-L68); [concurrent publisher serialization](https://github.com/datrab/kubeclaw/blob/ad73a0df62607ea9634304c3e9518826450a6a25/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L72-L87)
>
> **Check status:** On 2026-10-12, Node.js `v24.21.0` and util-linux
> `flock` 2.38.1 completed all six Bash blocks on disposable local data, with
> admission before cleanup. Exit zero; committed, isolated, and retained strict
> reads passed. The two linked project-setup test files also passed all 29
> tests. This is local CLI and test evidence, not a provider or live service result.
>
> **Revision:** `ad73a0df62607ea9634304c3e9518826450a6a25`
>
> **Limit:** Atomic local publication does not prove that an external filesystem, backup, or Git transport preserves the directory durably.
