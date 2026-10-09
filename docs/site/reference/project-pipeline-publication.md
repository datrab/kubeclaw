# Project Pipeline Publication

Status: current configuration reference
Audience: project author, pipeline operator, maintainer
Owner: Nova project setup
Evidence: skills/nova/project_setup/tools/progress-scaffold.ts; skills/nova/project_setup/tools/progress-scaffold-validation.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/nova/core/test-gates/pipeline.ts
Applies to: coupled `.swarm/progress.json` and `.swarm/pipeline.json`
Last verified: 2026-10-09 at source revision `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`

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
reports `TODO:` diagnostics for the description, notes, and provider origin. Discovery can exit zero with these diagnostics because it prepares a
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
> **Implementation:** [absolute locking command and timeout](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/observability/durable-delivery.ts#L186-L203); [argument parsing](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/nova/project_setup/tools/progress-scaffold.ts#L43-L71); [command dispatch](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/nova/project_setup/tools/progress-scaffold.ts#L148-L163)
>
> **Revision:** `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`

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

1. Stop all readers and writers, then preserve the complete `.swarm` directory
   in a new evidence destination. Keep the existing evidence directory.
2. Check that the scaffold and loose `progress.json` contain valid JSON.
   Missing loose progress is allowed; malformed existing progress requires the stop below.
3. Run the read-only admission block below against the owner-approved scaffold.
   A different byte, missing authority, or unsafe identity stops recovery.
4. Run the same scaffold command with `--repo "$publication_repo" --project demo --check`.
   Exit zero proves authoring validation only; it does not prove storage integrity.
5. Run that command with `--apply` only when every condition above holds.
   Expected observation: validation passes and both current files receive one committed generation.
6. Repeat the strict reader and module-scope loader in
   [Publish and read the exact committed pair](#3-publish-and-read-the-exact-committed-pair).
   Both must exit zero before any consumer resumes.
7. Retain the new pointer, complete immutable generation, member digests, output,
   and final strict-read result. Remove only disposable data after retained-copy verification.

For an existing project, replace `demo` with its owner-approved project identifier.
Bind the three absolute paths to that project's repository, `.swarm`, and evidence directory.
The project-setup owner must verify these bindings before any write.
A failed apply or strict read leaves consumers stopped; do not repeatedly retry
without identifying the failed condition.

Run this read-only admission check from the same source checkout before apply.
It captures `--print` in private evidence because the generated pair can contain
project data. The command writes no project or publication file.
The JSON output has a validation line before its wrapper; the script checks
that line before extracting the two members.
It derives the exact bytes and generation that this publisher will use.

```bash
umask 077
admission_print="$(mktemp "$publication_evidence/republish-print.XXXXXX")"
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --repo "$publication_repo" --project demo --print > "$admission_print"
node --input-type=module - "$publication_swarm" "$admission_print" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [swarmInput, printFile] = process.argv.slice(2);
const swarm = path.resolve(swarmInput);
const limit = 64 * 1024 * 1024;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const exists = file => {try {fs.lstatSync(file); return true;} catch(error) {if(error.code === 'ENOENT') return false; throw error;}};
function pinDirectory(directory) {
  let current = path.parse(directory).root;
  const pins = [];
  for (const component of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), `Unsafe directory: ${current}`);
    pins.push([current, stat.dev, stat.ino]);
  }
  return pins;
}
function readRegular(file) {
  const before = fs.lstatSync(file);
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= limit, `Unsafe member: ${file}`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino);
    const bytes = fs.readFileSync(fd);
    const after = fs.lstatSync(file);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(after[key], before[key], `Changed ${file}`);
    assert.equal(bytes.length, before.size);
    return bytes;
  } finally {fs.closeSync(fd);}
}
const output = fs.readFileSync(printFile, 'utf8');
const prefix = 'progress scaffold validation passed\n';
assert(output.startsWith(prefix), 'Print did not report validated authoring');
const pair = JSON.parse(output.slice(prefix.length));
assert.deepEqual(Object.keys(pair).sort(), ['pipeline', 'progress']);
const names = ['progress.json', 'pipeline.json'];
const bytes = names.map(name => Buffer.from(`${JSON.stringify(pair[name.slice(0, -5)], null, 2)}\n`));
assert(bytes.every(value => value.length <= limit), 'Publisher size limit exceeded');
const members = bytes.map((value, index) => [names[index], sha(value), value.length]);
const generation = sha(JSON.stringify(members));
const directoryPins = pinDirectory(swarm);
for (const name of names) if (exists(path.join(swarm, name))) readRegular(path.join(swarm, name));
const progressFile = path.join(swarm, names[0]);
if (exists(progressFile)) JSON.parse(readRegular(progressFile).toString());
const base = path.join(swarm, '.scaffold-publication');
if (exists(base)) {
  directoryPins.push(...pinDirectory(base));
  const pointer = path.join(base, 'current.json');
  if (exists(pointer)) readRegular(pointer);
  const intended = path.join(base, generation);
  if (exists(intended)) {
    directoryPins.push(...pinDirectory(intended));
    names.forEach((name, index) => {
      const file = path.join(intended, name);
      if (exists(file)) assert(readRegular(file).equals(bytes[index]), `Conflicting intended member: ${file}`);
    });
  }
}
for (const [file, device, inode] of directoryPins) {
  const current = fs.lstatSync(file);
  assert(current.isDirectory() && !current.isSymbolicLink() && current.dev === device && current.ino === inode, `Changed directory: ${file}`);
}
console.log(`Republish admission passed for generation ${generation}`);
console.log('Consumers and concurrent writers must remain stopped until apply and strict reads finish.');
JS
```

Expected observation: `Republish admission passed for generation` followed by
one SHA-256 identity. Retain the print file and admission output privately.
Any error stops recovery before apply. The publisher can create missing intended members.
It must never replace an existing member with different bytes.
This check does not authorize the scaffold or prevent a later competing writer.
The owner must keep readers and other writers stopped through the final strict read.

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
> The CLI [returns from check/print before parsing loose progress](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145).
> Its helper [parses every existing JSON input directly](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/nova/project_setup/tools/progress-scaffold-values.ts#L117-L118).
> The publisher [derives generation identity from ordered member names, digests, and byte lengths](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L7-L14).
> The publisher [rejects unsafe current targets and immutable conflicts](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L87).
> It [materializes members and commits the pointer only after those checks](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L95-L113).
>
> **Check status:** Seven isolated actual-CLI cases passed on 2026-10-09 with Node.js `v24.21.0` and temporary util-linux locking bindings.
> Supported cases covered valid publication, malformed loose pipeline repair, malformed pointer repair, and missing pointer recovery.
> Rejected cases covered malformed loose progress, immutable corruption, and symlinked targets.
> Each supported repair ended with a strict read. Each rejected case retained its committed pointer; no provider or live service ran.

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
> **Implementation:** [strict reader](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L45-L76); [publisher](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113); [scaffold apply](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145)
>
> **Contract or setting:** [manifest and generation identity](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/skills/common/plugin-runtime/foundation/config/published-pair.ts#L7-L15)
>
> **Test evidence:** [partial-publication and interrupted-writer rejection](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L28-L50); [corruption, symlink, and loose-file rejection](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L53-L68); [concurrent publisher serialization](https://github.com/datrab/kubeclaw/blob/e3fa70c3fe3a1a4a32af503201a19e0b5df14c61/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L72-L87)
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran the two linked scaffold/publication suites: all 29 tests passed, exit zero.
> The command selected `tests/skills/nova/project_setup/progress-scaffold.test.mjs` and `tests/skills/nova/project_setup/scaffold-publication.test.mjs` with `node --test`.
> Their implementation files match the recorded revision.
> Temporary PRoot bindings supplied util-linux `flock` 2.42.3 and GNU `tar` 1.35 at their required absolute paths.
> The bindings changed no system file. All five Bash blocks above also completed unchanged, including retained-copy verification and cleanup.
> These results prove local publication only. No provider or live service ran. BusyBox locking does not meet the suite prerequisites.
>
> **Revision:** `e3fa70c3fe3a1a4a32af503201a19e0b5df14c61`
>
> **Limit:** Atomic local publication does not prove that an external filesystem, backup, or Git transport preserves the directory durably.
