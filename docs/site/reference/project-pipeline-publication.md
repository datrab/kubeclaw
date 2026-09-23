# Project Pipeline Publication

Status: current configuration reference
Audience: project author, pipeline operator, maintainer
Owner: Nova project setup
Evidence: skills/nova/project_setup/tools/progress-scaffold.ts; skills/nova/project_setup/tools/progress-scaffold-validation.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/nova/core/test-gates/pipeline.ts
Applies to: coupled `.swarm/progress.json` and `.swarm/pipeline.json`
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

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

Run from the repository and name the project or explicit `.swarm` directory:

```bash
# Discover sources and write/edit progress.scaffold.json.
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --project "sample"

# Validate without writing current files.
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --project "sample" \
  --check

# Publish both current files as one generation.
node skills/nova/project_setup/tools/progress-scaffold.ts \
  --project "sample" \
  --apply
```

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
> **Implementation:** [argument parsing](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project_setup/tools/progress-scaffold.ts#L43-L71); [command dispatch](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project_setup/tools/progress-scaffold.ts#L148-L163)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

The first command writes the editable scaffold. Regeneration preserves an
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

This design favors a fail-closed read over partial availability: an operator
must reconcile a damaged pair explicitly rather than run an accidental mixture.

## Failure and recovery

| Signal | Meaning | Safe recovery |
| --- | --- | --- |
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
> **Implementation:** [strict reader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L45-L76); [publisher](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113); [scaffold apply](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project_setup/tools/progress-scaffold.ts#L131-L145)
>
> **Contract or setting:** [manifest and generation identity](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L7-L15)
>
> **Test evidence:** [partial-publication and interrupted-writer rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L28-L50); [corruption, symlink, and loose-file rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L53-L68); [concurrent publisher serialization](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/skills/nova/project_setup/scaffold-publication.test.mjs#L72-L87)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Atomic local publication does not prove that an external filesystem, backup, or Git transport preserves the directory durably.
