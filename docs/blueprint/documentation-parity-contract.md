# Documentation content parity contract

Status: required transition control

## Purpose

This contract prevents valid information from disappearing when KubeClaw replaces
the previous documentation tree with the canonical reader site. It applies to
every file classified as `legacy-extraction-source` in
`docs/config/documentation-tree-classification.json`.

The contract does not treat similar wording, file counts, word counts, headings,
or successful link checks as content parity. It requires an explicit decision for
each visible source unit and an independent decision review. It also keeps source
removal separate from content extraction. The deletion step can occur only after
the generated deletion manifest marks the exact source as ready.

## Authorities

The following inputs have separate responsibilities:

| Input | Responsibility |
| --- | --- |
| `docs/config/documentation-tree-baseline.json` | Identifies the immutable Git revision and blob for each previous documentation file. |
| `docs/config/documentation-tree-classification.json` | Identifies current canonical pages, internal inputs, extraction sources, and deletion candidates. |
| Committed source-set authority named by `docs/config/documentation-parity-batches.json` | Freezes the exact legacy extraction membership at the transition commit; its digest binds original path, legacy path, baseline blob, and source kind. |
| Baseline Git blob | Supplies the exact source bytes. The mutable worktree is not the extraction authority. |
| `docs/site/` | Contains the only canonical reader documentation and the only valid mapping targets. |
| Current implementation, contracts, schemas, configuration, and tests | Establish whether an old statement is still correct. |
| Decision file | Records the author decision for each extracted unit and claim. |
| Review file | Records an independent check of the exact decision and canonical content. |
| Generated deletion manifest | Reports readiness. Authors cannot set readiness directly. |

## Deterministic extraction

The extractor reads each legacy source from its recorded baseline Git blob. It
must fail if the baseline revision, blob identity, classification, or expected
legacy path is inconsistent. A worktree edit must not change extracted units.
Blob identities use the repository's declared Git object format (`sha1` or
`sha256`), rather than assuming one hash algorithm.
The extractor resolves `sourceSetAuthorityRevision` directly as a commit with
Git replacement objects disabled, requires it to be an ancestor of `HEAD`,
reads the classification stored in that commit, and verifies
`sourceSetAuthoritySha256` against the exact committed legacy source identities.
The authority file has one introduction commit. Its only parent is the fixed
source-set revision. Later commits cannot move this pointer to a smaller source
set, even when the replacement commit is also an ancestor and has a valid
digest. Before the introduction commit exists, bootstrap mode requires the
pointer to equal `HEAD`.
The current classification and batch inventory must both equal that committed
source set.
The checker independently enumerates every regular blob below `docs/` in that
commit with Git replacement objects disabled. The baseline registry must be an
exact path, blob, mode, and kind representation of that tree, and every baseline
path must occur exactly once as a classification `originalPath`. Removing a file
from both registries or silently reclassifying its baseline presence cannot make
the deletion set smaller.

The extractor replaces its unit and summary outputs as one exception-safe pair.
If a normal write or rename operation fails, it restores the previous pair. A
process kill or power loss between file-system renames is a stricter limit: the
writer can leave a missing or mixed pair and hidden temporary or backup files.
The summary digest, extraction check, and physical documentation-tree check then
fail closed. They cannot report readiness from that state. A maintainer must
inspect the retained files, preserve the last matching pair if it is needed,
remove only the extractor-owned temporary or backup artifacts, and rerun the
extractor. This writer does not claim crash-atomic replacement.

Each unit records:

- a stable unit ID derived from the original path, baseline blob, unit kind, and
  exact byte range;
- original and legacy paths;
- baseline revision and Git blob;
- unit kind and heading context;
- zero-based byte start and exclusive byte end;
- one-based line start and line end;
- exact and normalized SHA-256 values; and
- the visible source content needed for a coverage check.

The extractor version is part of the generated inventory. A parser change that
changes unit boundaries must change that version. Generated files use a stable
sort order and byte-stable JSON rendering. Check mode compares the expected bytes
with the checked-in output and does not write files.

### Markdown coverage

The extractor represents all visible or operationally meaningful content. It
separates at least:

- frontmatter and visible metadata fields;
- headings, which also supply context for later units;
- paragraphs;
- each list item, including its nesting depth;
- each procedure step;
- each table row together with its column headings;
- fenced code blocks, their language, and their surrounding purpose;
- callouts and visible HTML text;
- links and images, including their labels, targets, and explained relationship;
- status, limit, warning, decision, and evidence statements.

Formatting tokens can be excluded. Visible words cannot disappear without an
extracted unit. A coverage digest binds the ordered unit set to the complete
visible source representation.

### Code block classification

A decision classifies each code block as one of:

- `runnable-example`;
- `configuration-example`;
- `expected-output`;
- `illustrative-pseudocode`;
- `identifier-list`; or
- `obsolete-example`.

An executable or factual example needs a verified canonical example or an
evidence-backed omission. A prose paragraph with a similar topic is not a valid
replacement.

### SVG coverage

An SVG is not one indivisible unit. Extraction records its title, description,
visible text, labelled nodes, groups, boundaries, paths, and connection markers.
Meaningful color, line, arrow, and legend attributes remain available to the
manual visual review. Each SVG also needs a rendered image review that confirms
the node and relationship inventory. Automation detects changed elements and
labels; it does not claim that it understands visual meaning.

Rendered evidence is a real validated PNG, not an arbitrary file with an image
extension. Validation covers chunk CRCs and ordering, a unique leading IHDR,
contiguous IDAT chunks, a terminal IEND, supported color-type/bit-depth and
interlace combinations, scanline filter bytes, and the exact decompressed length
required by the declared geometry. Its MIME type, digest, renderer
identity/version/invocation/provenance, and renderer revision are bound by the
decision. The independent review repeats that binding for every SVG unit and
every extracted edge, use, or marker relationship.

## Atomic claims and decisions

One extracted unit can contain multiple independently verifiable statements. The
decision file splits such a unit into claims with exact character or byte spans.
The union of claim spans and explicitly structural fragments must cover the
complete visible unit. A free-form `ignored` flag is not permitted.
Every unit, claim, and structural-fragment byte boundary must also be a valid
UTF-8 code-point boundary. A span that decodes by inserting U+FFFD because it
cuts a multibyte character is invalid.

Each claim has one of these types:

- `fact`;
- `decision`;
- `reason`;
- `constraint`;
- `procedure`;
- `configuration`;
- `failure`;
- `recovery`;
- `security-boundary`;
- `example`;
- `status-or-limit`;
- `source-evidence`;
- `visual-relationship`;
- `navigation-only`; or
- `project-administration`.

Each claim has one truth state:

- `current`;
- `historical-decision`;
- `obsolete-or-incorrect`;
- `non-reader-content`; or
- `unknown`.

`unknown` always blocks readiness.

### Claim compatibility matrix

The machine gate applies this matrix. A decision cannot use a looser combination.

| Truth state | Disposition | Required evidence | Allowed omission reason |
| --- | --- | --- | --- |
| `current` behavioral claim | `mapped` | Current implementation, contract, schema, configuration, or test locators pinned to the reviewed revision | Not applicable |
| `historical-decision` | `mapped` | Historical evidence is recommended; current implementation evidence is not required | Not applicable |
| `obsolete-or-incorrect` | `omitted` | Current implementation, contract, schema, configuration, or test locator pinned to the reviewed revision | `obsolete-or-incorrect` only |
| `non-reader-content` with claim type `navigation-only` | `omitted` | Narrow governance evidence | `navigation-only` only |
| `non-reader-content` with claim type `project-administration` | `omitted` | Narrow governance evidence | `transient-project-administration` only |
| Other `non-reader-content` | `omitted` | Narrow evidence for the exact template or decoration | `template-placeholder` or `non-semantic-decoration` |
| `unknown` or `unreviewed` | None | Not applicable | Always blocks readiness |

Evidence for a behavioral claim cannot cite the canonical page, this parity
contract, a decision file, a generated inventory, or another legacy source as
proof of current behavior.

## Valid canonical mapping

A mapped claim identifies one or more targets under `docs/site/`. Each target
contains:

- a real published anchor;
- a unique normalized excerpt from the target section;
- the SHA-256 of that normalized excerpt;
- an occurrence index that must resolve uniquely; and
- the relation `equivalent`, `expanded`, `split`, or `combined`.

An anchor without an excerpt is not evidence. The check fails if the anchor is
missing, the excerpt changed, the excerpt occurs ambiguously, the target is not a
published regular Markdown file, or the target is outside `docs/site/`.

Several source claims can map to one canonical explanation. One source claim can
map to several canonical sections when the new documentation separates its
concerns. Every part remains explicit.

Targets use the same shared GitHub-compatible anchor parser as the repository
link checker. Fenced code (including a legal longer closing fence), indented
code, inline-code HTML, comments, and raw `script`, `style`, `pre`, or `textarea`
blocks cannot manufacture anchors. Real explicit HTML anchors outside those
blocks remain valid. Literal underscores and GitHub duplicate-heading suffixes
remain significant.

## Valid omission

An omission uses exactly one reason code:

- `obsolete-or-incorrect`;
- `transient-project-administration`;
- `navigation-only`;
- `template-placeholder`; or
- `non-semantic-decoration`.

A correct duplicate is mapped to the same canonical target; duplication is not an
omission reason. An obsolete or incorrect claim needs current evidence from the
implementation, contract, schema, configuration, or test. The evidence binds a
revision, regular repository path, narrow locator, and content hash. Another old
documentation page is not sufficient evidence that product behavior changed.

A replaced decision normally remains visible as a replaced decision. Age alone
does not make a decision disposable.

## Independent review

Each decision file has one matching review file. The review binds:

- the decision file SHA-256;
- the reviewed content root;
- distinct author and reviewer identities;
- the exact claim ID set;
- the source classification decision; and
- one verdict for semantic parity, current accuracy, target specificity, and
  disposition justification for every claim.

All four claim verdicts must be `pass`. The review must have no unresolved
finding. The author and reviewer identities must differ. A changed decision,
source blob, or canonical excerpt invalidates the review.

The content root hashes source blobs, canonical target content, and current
omission evidence. It excludes decision and review files. The review binds the
decision separately through its exact file SHA-256. These exclusions avoid a
self-referential digest and let a review attest fixed content without requiring
its own future commit hash. Automation validates identity fields and content
binding. It cannot prove human independence or semantic judgment; the reviewer
remains responsible for these claims.

Review assignments are committed before review and bind an assignment ID, source,
author identity, reviewer identity, and issuing authority. They intentionally do
not contain `reviewedRevision`: target and evidence changes can be committed after
assignment without a self-referential future commit. The later decision and
review bind the same reviewed revision. The checker derives assignment provenance
from the commit containing the assignment authority and rejects uncommitted
assignment changes.

Every review also contains an `activeDependencyReview` verdict bound to the
reviewed revision and content root. It records the exact old and legacy paths,
the static scanner version, scanned-path evidence, and zero matches. The checker
reruns one cached repository scan and also recognizes direct links and simple
path construction such as `["docs", "old.md"].join("/")`.

This scan is deliberately not described as complete program analysis. Dynamic
configuration, generated paths, runtime lookup, and external consumers can evade
static recognition. The assigned independent reviewer must inspect those risks
and attest `PASS`. Automation verifies the assignment and attestation bindings;
as with semantic review, it cannot prove that two humans are independent or that
the human analysis was competent.

Every redirect assessment uses the public route derived from the original source
path. `required` binds the `known-public-route` basis, exactly one registry entry,
and a canonical mapped target route. `not-required` binds the
`no-authoritative-public-route` basis, a null target, and the absence of a route
registry entry for that source. The route registry is part of the reviewed
content root.

## Generated deletion manifest

The deletion manifest contains one record for every extraction source. The
record includes source identity, claim counts, canonical targets, redirect need,
active-reference search, recovery command, review state, and readiness.

The generator sets `deletionReady` to `true` only when all conditions hold:

1. extraction covers every visible source unit;
2. every unit has complete claim or structural coverage;
3. no claim is unknown, unresolved, or unreviewed;
4. every canonical excerpt and omission evidence resolves at the reviewed root;
5. source classification and every claim pass independent review;
6. no active reader, publication, script, test, fixture, or configuration depends
   on the old reader path or legacy path;
7. documentation-tree, tree-mutation, site, publication, reference,
   reader-boundary, and parity checks pass against the same content root; and
8. the recovery command resolves to the recorded baseline blob.

The manifest is generated output. A manually authored `deletionReady` value is
invalid. This transition produces evidence for later deletion; it does not delete
the source.

Ordinary content validation reports `VALID` and always leaves `deletionReady`
false. Full readiness writes or verifies only the fixed generated manifest path
and runs extraction, documentation-tree, tree-mutation, site, publication,
reference, reader-boundary, and parity checks against one clean, pinned source
revision. During manifest verification,
the fixed generated manifest is the only permitted worktree difference so that a
generate-then-check round trip does not create a circular commit requirement.
Only full readiness may report `PASS` or set `deletionReady` to `true`.

## Safe batch scaffolding

The scaffold command creates the complete decision-file set for exactly one
declared batch. It does not overwrite an existing decision or review. The
command first records a durable pending operation, writes and synchronizes all
temporary files, and then records the complete transaction before it publishes
any target. It publishes targets with no-overwrite file-system operations and
synchronizes the containing directories. A batch is not reported as scaffolded
until every declared target is present and the transaction markers are removed.

If the process stops during staging or publication, the next scaffold run
recovers the recorded transaction before it starts new work. Recovery removes a
created target or temporary file only when both its recorded file identity and
its SHA-256 still match. If a person changed a recorded file after the stopped
run, recovery stops with a conflict and preserves that file. It does not guess
whether the person's content can be discarded. The same fail-closed rule applies
when a transaction marker is incomplete, inconsistent, or does not belong to the
requested batch.

These guarantees protect one process on one local file system. They do not turn
the scaffold directory into a distributed lock. Maintainers must not run two
scaffold writers for the same batch at the same time. A crash between two target
publications can leave a visible partial set until the next recovery run, but the
durable marker prevents that set from passing as a completed scaffold.

## Required adversarial checks

The gate must reject at least these changes:

- a new or changed baseline source without extraction;
- a baseline `docs/` blob removed from the registry or classification;
- a physical file below `docs/` that Git ignores and the classification omits;
- a source-set authority pointer moved after its one-time introduction commit;
- an extracted unit with uncovered visible content;
- a claim or structural range that splits a UTF-8 code point;
- a compound statement without explicit claim coverage;
- a mapping with only a target anchor;
- a removed anchor or changed target excerpt;
- an ambiguous target excerpt;
- a target outside the canonical site;
- an omission without current evidence;
- an invalid evidence revision, path, locator, or hash;
- a missing review, matching author and reviewer, or one negative claim verdict;
- an active reference to an old or legacy path;
- a stale active-dependency attestation or a simple composed old path;
- a canonical page that reads an internal transition input through a literal,
  array join, string concatenation, template, `path.join`, or `new URL` value;
- a broken reference-style link or an anchor hidden in a Setext heading,
  container, or valid HTML `id` or anchor `name` attribute;
- a changed SVG label, non-image render artifact, or unreviewed visual relationship;
- a redirect assessment that conflicts with the original route or route registry;
- stale generated inventory, report, or deletion manifest;
- a scaffold interruption during any staging or publication phase, including an
  author change made before recovery;
- a wrong recovery blob; and
- readiness while one claim remains open.

## Scalable workflow

Work is divided by coherent product area, not by an arbitrary file count. Each
source keeps a separate decision and review file so independent authors can work
without a shared-file conflict. A canonical target page with overlapping source
material has one named owner for the batch.

For each batch:

1. Generate units from immutable blobs.
2. Keep every source `untriaged` until an author makes explicit decisions.
3. Check the source against current implementation authorities.
4. Improve the canonical site where valid information is missing.
5. Map or justify every atomic claim.
6. Run the strict machine check.
7. Give a fresh-context reviewer the source, current authorities, target pages,
   decision file, and this contract.
8. Correct every finding.
9. Repeat the complete affected review after content-root changes.
10. Generate readiness only after the batch has no open claim.

Tools can propose candidate targets. They cannot set `mapped`, `omitted`,
`reviewed`, or `deletionReady` without an explicit author or reviewer decision.
