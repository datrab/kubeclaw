# Documentation site and publication

Status: implemented local static reader; external hosting and broader live acceptance remain separate
Audience: operator, plugin author, developer, documentation maintainer
Owner: documentation
Evidence: scripts/docs-reader/page-records.mjs; scripts/tests/docs-reader-page-records.test.mjs; docs/config/documentation-publication-manifest.json; docs/site/reference/generated-documentation-map.json; scripts/docs-publication.mjs; scripts/docs-reader/diagrams.mjs; scripts/docs-reader/check-diagrams.mjs; scripts/tests/docs-reader-diagrams.test.mjs; docs/config/documentation-diagrams.json; scripts/docs-reader/metadata.mjs; scripts/lib/docs-publication-assets.mjs; scripts/lib/docs-publication-links.mjs; scripts/docs-reader/renderer.mjs; scripts/docs-reader/package.json; scripts/docs-reader/package-lock.json; scripts/tests/docs-reader.test.mjs; scripts/docs-reader/check-artifact.mjs; scripts/docs-reader/check-search.mjs; scripts/docs-reader/search-questions.json; scripts/docs-reader/check-source-links.mjs; scripts/docs-reader/source-links.mjs; scripts/docs-reader/source-previews.mjs; scripts/docs-reader/check-source-previews.mjs; scripts/tests/docs-reader-source-previews.test.mjs; scripts/tests/docs-reader-source-links.test.mjs; scripts/docs-governance.mjs; scripts/docs-check-refs.mjs; scripts/check-site-reader-boundary.mjs; docs/config/documentation-tree-classification.json; docs/site/reference/documentation-route-registry.json; package.json; .github/workflows/docs-checks.yaml; scripts/docs-reader/redirects.mjs; scripts/docs-reader/serve.mjs; scripts/tests/docs-reader-redirects.test.mjs; scripts/tests/docs-reader-redirects.browser.mjs
Applies to: positively selected repository reader pages and the local HTML publication artifact
Last verified: source, original 167-page build, parser tests, and rendered local links checked on 2026-10-21; browser observations have their own recorded scope; machine-readable page bindings source and isolated fixture tests checked on 2026-10-21, not a complete production-build result; topic-link target existence and tracked source-root membership checked on 2026-10-26, not new procedure or runtime execution

## Find the explanation before the source

You have a technical name, but need to know what it does and what to do next.
Start at the [documentation home](../README.md), not an internal report or an old source directory.

| Your question | Start here | Continue with |
| --- | --- | --- |
| Why does a component behave this way? | [Understand](../understand/README.md) | The component's explanation, its contracts, then its evidence links |
| How do I install, operate, diagnose, or recover? | [Use](../use/README.md) | The named procedure's prerequisites, stop conditions, and remaining-data rules |
| What exact field, option, identity, or limit applies? | [Reference](README.md) | The owning configuration, SDK, endpoint, error, or workflow reference |
| How do I change an extension or Core? | [Extend](../extend/README.md) | Its behavior-owner decision and the [Developer handbook](../extend/developer-handbook.md) |
| How do I update these pages after a source change? | [Maintain documentation](../extend/documentation-maintenance.md) | Source ownership, generation, checks, and a reader task |

For example, to distinguish a runtime bundle from a permission, open Reference,
then [Roles and package ownership](roles-and-package-ownership.md). That page
separates bundle selection, caller grants, Buster configuration, and Prism host
policy. Do not infer a grant from a package name.

Use **Search documentation** in the built reader for an exact identifier or words
from any published page. Search matches all entered words, without case, against
page titles, headings and full text, including code examples. Defined reader
synonyms such as disaster recovery, backup/restore, settings/overrides and
first plugin also find their owning guides. Title, heading and reader-intent
matches receive more weight than incidental body mentions. It lists at most 50
matching pages. Open a result and use your browser's Find command for its section.

The search index loads on the first query and stays local to the artifact.
Large reference pages make that index substantial; the reader reports loading,
no results, and a load failure. A failure is not evidence that a product name is
absent. Use section navigation or the owning reference while search is unavailable.
Search requires JavaScript. Reading, navigation, source links, and native section
links do not. No search query is sent to an external service.

## Topic routing and supporting sources

Use the reader pages to open a topic. Source locations identify supporting repository
code and metadata. This map does not certify a procedure or select a required
runtime dependency.

| Topic | Reader pages | Supporting sources |
| --- | --- | --- |
| Runtime architecture | [`docs/site/understand/README.md`](../understand/README.md); [`docs/site/understand/components-and-authority.md`](../understand/components-and-authority.md); [`docs/site/understand/request-state-recovery.md`](../understand/request-state-recovery.md) | `skills/common/plugin-runtime/foundation/`; `skills/nova/core/`; `skills/worker/core/`; `skills/buster/engine/` |
| Test suites and Buster | [`docs/site/extend/buster.md`](../extend/buster.md); [`docs/site/product-surfaces.md`](../product-surfaces.md) | `contracts/pipeline-test-gate/`; `skills/nova/core/test-gates/`; `skills/buster/engine/test-gates/` |
| Echo decisions and current boundary | [`docs/site/decisions/echo.md`](../decisions/echo.md); [`docs/site/understand/components-and-authority.md`](../understand/components-and-authority.md); [`docs/site/status/current.md`](../status/current.md) | `skills/nova/plugins/review/` |
| Plugin inventory | [`docs/site/extend/plugin-catalogue/README.md`](../extend/plugin-catalogue/README.md); [`docs/site/reference/capabilities.md`](capabilities.md) | `docs/generated/inventory/plugin-system.json`; `skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts` |
| Security and isolation | [`docs/site/understand/deployment-and-trust.md`](../understand/deployment-and-trust.md); [`docs/site/understand/worker-trust.md`](../understand/worker-trust.md); [`docs/site/extend/testing.md`](../extend/testing.md) | `skills/common/plugin-runtime/foundation/isolation/`; `skills/common/plugin-runtime/foundation/packages/install.ts` |
| Deployment | [`docs/site/use/install.md`](../use/install.md); [`docs/site/understand/deployment-and-trust.md`](../understand/deployment-and-trust.md) | `charts/kubeclaw/templates/deployment.yaml`; `scripts/deploy.sh` |
| Operations | [`docs/site/use/README.md`](../use/README.md); [`docs/site/use/operate.md`](../use/operate.md); [`docs/site/use/diagnose.md`](../use/diagnose.md); [`docs/site/use/recovery.md`](../use/recovery.md); [`docs/site/use/maintenance.md`](../use/maintenance.md) | `skills/nova/core/cli.ts`; `skills/nova/project/cli.ts`; `charts/prism/files/prism-backup.sh` |
| Extension authoring | [`docs/site/extend/README.md`](../extend/README.md); [`docs/site/extend/first-plugin.md`](../extend/first-plugin.md); [`docs/site/extend/contracts.md`](../extend/contracts.md); [`docs/site/extend/testing.md`](../extend/testing.md) | `skills/common/plugin-runtime/sdk/` |
| Current implementation and compatibility | [`docs/site/status/current.md`](../status/current.md); [`docs/site/status/open-issues.md`](../status/open-issues.md); [`docs/site/decisions/README.md`](../decisions/README.md) | `docs/status/open-issues.json`; `packaging/runtime/package-ownership.json` |
| Codex operations workspace | [`docs/site/understand/platform-and-operations.md`](../understand/platform-and-operations.md); [`docs/site/extend/host-and-engine.md`](../extend/host-and-engine.md) | `charts/ops-pod/`; `plugins/kubeclaw-ops/`; `tools/ops-mcp/src/`; `scripts/deploy-ops-pod.sh` |

Only pages below `docs/site` are canonical reader documentation. Other files
provide implementation evidence or temporary migration sources. They do not
define a second reader-facing authority.

## Read source evidence with its limits

Each reader page declares Status, Audience, Owner, Evidence, Applies to, and
Last verified. These fields identify its scope and responsibility; they are not
an assertion that every procedure or deployment passed.

| Evidence | What you can conclude | What you still need |
| --- | --- | --- |
| Schema or manifest | The declared contract, identity, or constraint | The actual consumer's defaults, validation, precedence, and effects |
| Implementation link with full commit and line range | Those exact committed bytes contain the cited implementation | Agreement with the current source and the stated claim |
| Test or command result | The named cases ran under the recorded conditions | Coverage of your route, version, and failure conditions |
| Live observation | The recorded environment behaved that way at that time | Compatibility with your environment and durable recovery rules |

A source link must remain useful without JavaScript. The local build
turns plain Evidence paths into GitHub links at the checkout's HEAD. Existing
explicit links in prose retain their written revisions. The plugin catalogue
also checks selected source snippets against the separate documentation source
revision before it creates pinned links. These are different revision paths.
A dirty checkout can therefore make a new HEAD link describe older bytes than
the local page. Reconcile source changes and their revision before publication;
do not repair a mismatch by weakening its source guard.

> **Source — evidence revisions**
>
> Claim: selected catalogue evidence uses the documentation source revision; plain Evidence links in published pages use HEAD.
> Implementation: [sourceEvidenceLink](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/scripts/docs-publication.mjs#L148-L166); current Evidence conversion belongs to `build` in `scripts/docs-publication.mjs`.
> Contract: the catalogue checks tracked regular source bytes and the selected line range; the staging conversion uses its checkout commit. Existing explicit prose links retain their written revision.
> Validation: no build or test execution for this statement.
> Source binding: these linked function bodies match the inspected checkout. Other publisher sections have local changes; this is not whole-file or publication acceptance.
> Limit: the displayed excerpt is historical source, not proof that HEAD contains local changes or that the cited behavior ran. Reconcile the source bytes before creating a commit permalink.

For a source-evidence box, the build reads each linked file at its exact full
commit and adds a native **Source** disclosure inside that same box. The
disclosure shows its path, line range, revision, source link, and automatically
read code. An explicit line range is retained in full. A file link without a
range shows its first 80 lines (or fewer for a shorter file), labelled as an
excerpt. Directory links and named Markdown anchors remain ordinary links.
The original claim, contract, test or validation statement, and limits remain
in the box; the preview does not invent missing evidence or a successful test.

The displayed text is escaped, never imported or executed. CRLF line endings
are normalized to LF for HTML display; the receipt separately records the hash
of the original source bytes and the displayed excerpt. Preview code does not
enter the reader's search index. Each build records its input Markdown and
excerpt hashes in `source-previews.json`; the preview checker compares actual
rendered text with a fresh read of the linked commit, not a copied code sample.

Building or rechecking previews of upstream sources requires network access.
Once built, the disclosures and source excerpts remain readable from the local
artifact without JavaScript or network. The external source link still needs
network access when opened. An old permalink and matching preview may no
longer describe current behavior; check the stated claim and revision.

## What enters publication

The page selector reads `docs/config/documentation-tree-classification.json`.
A Markdown page under `docs/site` needs an explicit record whose class is
`canonical-reader-documentation` and whose expected path equals its actual
path. An unregistered Markdown file fails selection; its extension alone does
not admit it. A registered but missing page also fails.

Non-Markdown assets use a separate finite allowlist in
`scripts/lib/docs-publication-assets.mjs`. This includes selected executable
examples, the documentation map, and the route registry, not arbitrary files.
Both selectors reject symlinks and non-regular file inputs. Internal plans,
local evidence, prompts, temporary files, and working reports do not
belong in the reader tree or its output. Do not move such material into
`docs/site` to make it visible.

The [generated page map](generated-documentation-map.json) records page owners,
source dependencies, declared checks, and route identities. It derives records
from metadata; it does not independently discover every public product surface.
New pages need their classification and metadata before a publication check.
Use the [maintenance workflow](../extend/documentation-maintenance.md) rather
than editing the generated map by hand.

### Machine-readable page bindings

`reader-manifest.json` includes `pageRecords`, with one record for every
positively selected page. Each record binds its repository Markdown path,
artifact HTML route, artifact-local canonical URL, committed Source bytes,
actual HTML byte count and SHA-256, declared source dependencies, and applicable
registered redirects. The existing home entry point is a separate redirect
kind, not invented route history. A redirect binding includes its actual
fallback output hash. The mapping also binds the shared reader CSS, reader
script and redirect script to their Source-owned bytes.

The mapping reads declarations from the generated ownership map through its
normal JSON interface. It does not infer a complete implementation, citation,
installed-dependency or build-input closure. A repository-file dependency hashes
its exact committed file bytes. A repository-directory dependency identifies its
Git tree object and hashes that object's bytes, not concatenated working-tree
files. The verifier rejects masking Git index flags within the declared scopes and
compares both index and worktree with the recorded revision. It does not clear
those flags or require undeclared paths to be clean. Ignored installed files
are outside that committed-Source binding.
External reference declarations remain explicit, unacquired references with no
invented content hash. The four authority records bind the publication manifest,
ownership map, route registry and known-route baseline at the build revision.

An artifact-local canonical URL such as `/reference/documentation-site.html`
identifies a file in this reader; it does not claim a deployment origin. The
mapping records only declared redirects. An empty real registry remains empty.
The mapping does not change the JavaScript/no-script redirect limits below.

The artifact checker compares these bindings with the same revision's Source
objects and current declared repository paths, actual output bytes, the current
route declarations and exact Source-owned fallback/shared files. Keep the source
checkout available. To check an artifact outside the default staging directory,
pass its output root and, if different, the source checkout explicitly:

```bash
node scripts/docs-reader/check-artifact.mjs /path/to/reader-artifact /path/to/source-checkout
```

Source or output drift stops verification; renewing an output digest alone does
not renew its page binding. Normal artifact checking requires these records even when a build report is
missing. Isolated renderer-test callers may explicitly select
`--legacy-renderer-fixture` before the output argument to check an unmapped
fixture. That mode is not production acceptance: it refuses a production build
report without records and still verifies any records present. The owning
`docs-reader-page-records.test.mjs` fixtures compare two outputs from identical
committed inputs and exercise rejected collisions, escaping paths, Source drift
and hash-renewed output changes. Those fixture results do not establish two
identical full production builds; compare complete original builds with the same
source, dependencies and tools before claiming that broader result.

## Routes, links, and static use

The publication manifest owns actual HTML paths: the home page is
`/README.html`, a section index is such as `/use/README.html`, and this page is
`/reference/documentation-site.html`. The artifact's `index.html` supplies a
fragment/query-preserving local-script home redirect and a visible no-script fallback link. Parsed reader links target
those HTML files; code examples keep their original text. Approved example
folders have generated file indexes, without admitting extra repository files.

These artifact paths are distinct from the ownership map's logical trailing-slash
identities. A hosting system must explicitly map any additional public routes;
this local builder does not claim that an external host serves them.

The [route registry](documentation-route-registry.json) owns explicit transfers.
The build compiles it with selected canonical pages and the pinned known-route
baseline, rejecting missing successors, collisions and lost declared anchors.
The optional loopback preview sends actual HTTP redirects; static fallback
behavior has a separate JavaScript/no-script boundary. Follow
[redirect maintenance](#maintain-redirects-without-inventing-history) for the
exact source-route and fragment contract. None of this proves external hosting.

Keep a single canonical explanation for each fact. Before a rename or removal,
move still-valid information, update incoming links and ownership, and declare
the successor according to [governance](documentation-governance.md). Test the
old route and its anchors in the actual output before retiring it. Do not
invent historical redirects for paths that were never public.

The artifact includes HTML, original Markdown, approved example files, navigation,
styles, and a local search index. Open `index.html` locally, or serve the directory
with a static server. Relative HTML links also work when the artifact is mounted
under a URL prefix. Tables and code blocks scroll within their content region.
The mobile navigation uses a native disclosure; keyboard users have a visible
skip link and focus indicators. The reader uses system fonts and no remote assets.

The build renders registered Mermaid definitions as local static SVG images.
Each figure states its reader question and owner, links to the adjacent text
explanation, and retains the definition in a native **Diagram source** disclosure.
A wide diagram scrolls inside its keyboard-focusable region rather than making
the whole page scroll sideways. The source hash and owner must match
`docs/config/documentation-diagrams.json`; an unregistered or changed definition
stops the build until its owner reviews and updates that record.

Rendering uses the locked Mermaid package and Playwright Chromium at build time.
The browser loads only that local package distribution; the SVG validator rejects
active markup and external resources. `diagram-manifest.json` records source
hashes, reader questions, owners, output hashes, and the actual renderer toolchain.
The diagram checker compares actual figures and SVGs with a fresh deterministic
render. Parser success and matching bytes are not approval of every edge,
optional path, error boundary or visual interpretation. Those require review.
No Mermaid runtime, browser installation or JavaScript is required to read the
built graphics and their written alternatives offline. External source links still require network
access. Local reading does not execute the published runnable examples.

## Check and stage a local copy

Use Node.js 24, npm, Git and the committed root and reader lockfiles. Keep the
selected checkout and its source objects available throughout the build.
Follow the [clean-checkout procedure](../extend/developer-handbook.md#prepare-a-clean-checkout).
Install both dependency sets from the repository root:

```bash
npm ci --include=dev --ignore-scripts
npm ci --prefix scripts/docs-reader --ignore-scripts
npx --no-install playwright install --with-deps chromium
```

The last command installs Chromium and its platform dependencies. It needs the
installation permissions supported by that environment. Chromium also needs
readable system fonts and a working fontconfig configuration. Missing fonts can
produce zero-sized text even when the DOM contains a link. A DOM-only assertion
is not proof of a usable fallback. Restricted hosts must provide their own
verified browser, shared libraries and font configuration; do not disable
rendering checks to conceal a missing prerequisite.

The broader documentation inventory also uses the configured Go and Helm
parsers. The CI workflow selects Go 1.26.3 and Helm 3.22.0. Those prerequisites
do not make a runtime deployment or a cluster available. Git must resolve every
pinned source revision needed by the reader. Preserve full clone history or
fetch the exact missing objects through the repository owner.

The publication example gate also needs Bash, a POSIX shell, Python 3,
GNU `flock`, Helm, and the checksum-pinned `kubeconform` from `versions.json`.
The read-only CI job prepares these tools before checking the examples.
The gate runs the two project factories only in private directories with
isolated Git configuration. It also runs one fixed, pure SDK example.
Other documented procedures are not executed by their syntax or source checks.
The SQL assertion reuses its exact-source native CI receipt; a normal publication
check does not start PostgreSQL or connect to a product database.

`docs/config/publication-example-claims.json` assigns each selected page, code
block, prose region, and asset to its owner and check boundary. After a source
change, review the complete affected procedure and update its declared duties,
source anchors, and native input assignment together. Do not refresh hashes alone
to hide a changed meaning, missing cleanup, or an unavailable native assertion.
A changed SQL assertion needs a new successful native CI result before reuse.

Source verification reads this repository through Git. Declared source blobs in
other repositories use bounded primary HTTPS requests. An offline artifact does
not prove that this network-dependent verification ran.

Check the maintained reader components and the isolated redirect fixtures:

```sh
node --test scripts/tests/docs-reader.test.mjs scripts/tests/docs-reader-page-records.test.mjs scripts/tests/docs-reader-source-links.test.mjs scripts/tests/docs-reader-source-previews.test.mjs scripts/tests/docs-reader-diagrams.test.mjs scripts/tests/docs-reader-redirects.test.mjs
node scripts/tests/docs-reader-redirects.browser.mjs
```
Prepare the selected route's additional tools and source revision through the
[handbook prerequisites](../extend/developer-handbook.md#add-tools-and-credentials-only-for-the-selected-route).
The publisher reads plugin manifests, dependency contracts, catalogue guidance,
local-verification records, and source-revision data before it selects a mode.
It invokes Git even for `check`. A readable checkout with its required commit
objects and a supported GitHub origin is therefore required, not only Markdown.
It accepts `git@github.com:owner/repository.git` or an HTTPS GitHub origin.
Missing tools, dependencies, source objects, or divergent pinned source stop the
run; retain the first diagnostic and repair that input rather than bypass it.

Follow the [common documentation-change chain](../extend/developer-handbook.md#documentation-change-chain)
after updating the owning inputs. Its stable checks precede staging:

```sh
set -eu
npm run docs:governance:check
npm run docs:generate:check
npm run docs:check:refs
npm run docs:site-boundary:check
npm run docs:publication:check
npm run docs:publication:build
node --max-old-space-size=4096 scripts/docs-reader/check-artifact.mjs
node scripts/docs-reader/check-search.mjs
node --max-old-space-size=4096 scripts/docs-reader/check-source-links.mjs
node --max-old-space-size=4096 scripts/docs-reader/check-source-previews.mjs
node --max-old-space-size=4096 scripts/docs-reader/check-diagrams.mjs
```

These are instructions, not a record of successful execution for this page.
Some selected generators and checks have additional child-process or tool
requirements. Do not treat a command's name as permission to run it in an
unprepared or restricted environment.

| Mode | Reads and result | Writes and failure boundary |
| --- | --- | --- |
| `docs:publication:generate` | Builds plugin catalogue/capability content and the operator plugin matrix from their inputs | Writes those owned pages/sections sequentially. A failure can leave earlier writes; inspect the diff and first error. It is not the prose-page generator. |
| `docs:publication:check` | Runs the declared publication helper tests, then compares generated content and checks selected pages, assets, metadata, language, links, and all classified examples at their native, projection, syntax, or authored-contract boundary | Does not invoke publication `generate` or `build`. A nonzero helper or publisher result stops the chain. It does not render a website. |
| `docs:publication:build` | Runs publication input checks, then renders HTML, navigation, local search, Markdown and approved assets with reports | After successful input checks, removes and recreates `.tmp/docs-publication`. A later copy/write failure can leave partial output. Exit zero and the fresh report are required. |
| `docs:publish-check` | Runs the broader `docs:check` chain, then the HTML build | Includes mutation tests and the staging replacement. It is not a lightweight link check or a hosting deployment. |

The mode entrypoints belong to `scripts/docs-publication.mjs`. HTML parsing,
link conversion, sanitization, navigation, and search belong to
`scripts/docs-reader/renderer.mjs`. Their original parser/build regressions run
with `node --test scripts/tests/docs-reader.test.mjs`. These tests do not replace
browser, hosting, or assistive-technology reader checks.

The source-link check reads the actual digest-verified HTML, not Markdown alone.
For this repository, it checks full commit objects, file/directory types and
physical line or Markdown-anchor bounds through Git. For upstream file links,
it requests the exact full-commit path from GitHub's primary raw-source host and
checks those returned bytes. This separate maintenance check needs network
access for upstream sources; it does not make reading or local search depend on
network access. Missing objects, tags instead of full revisions, wrong object
types, unavailable upstream sources, and invalid ranges stop the check. Source
existence and valid ranges do not prove that the linked code supports a claim.

Inspect `.tmp/docs-publication/build-report.json` and `reader-manifest.json`.
The build report retains its input digest, selected page and asset counts, and
checkout revision. The reader manifest additionally lists each generated HTML,
CSS, JavaScript, index output and positively selected copied asset with its exact byte count and SHA-256. It does
not include its own recursive digest. Neither report labels a declared check as
a browser observation. A failed build must not be published merely because an
older report exists. Reproducibility requires the same selected input bytes,
source revisions, dependencies, and tools.

If input checks fail before output replacement, an old staging directory may
remain. Its existence does not mean the new build passed. If staging fails
after replacement, preserve the diagnostic and partial output for diagnosis;
remove only the owned `.tmp/docs-publication` tree when no inspection uses it.
Never reset unrelated generated files or another author's changes.

## Preview the exact artifact on loopback

From the selected checkout, start the optional manifest-only Node preview:

```bash
node scripts/docs-reader/serve.mjs .tmp/docs-publication 4173
```

Open `http://127.0.0.1:4173/`. The process serves only GET/HEAD requests for
registered, hash-verified artifact outputs and registered redirects. It does
not expose the checkout, list directories, proxy external requests or accept
writes. Unknown paths return 404, unsupported methods 405 and changed artifact
members 409. Stop the owned preview process when finished; it is not a
production hosting configuration, authenticated service or deployment recipe.

For offline reading, open `index.html` from the complete artifact. Navigation,
page content, source links and diagram alternatives remain available without
JavaScript. Full-text search needs local JavaScript; use navigation or browser
Find without it. Following an external source URL still needs network access;
the displayed local excerpt remains part of the artifact.

## Maintain redirects without inventing history

The [route registry](documentation-route-registry.json) owns explicit transfers.
The pinned [known-route baseline](../../../scripts/docs-published-route-baseline.json)
prevents a known page from disappearing merely because a map was regenerated.
It is not proof of earlier external hosting or unknown pre-registry routes.
The current registry may legitimately contain no transfers.

For a real supported move, preserve the old known route, identify one selected
canonical successor, provide a reason and list the original anchors that the
successor must retain in `preservedFragments`. Use the exact existing governance
route vocabulary, such as `/use/topic/`; canonical artifact targets resolve to
their `.html` file. Register an additional known HTML source URL separately
when that URL also needs continuity. Do not assume a directory transfer
implicitly covers every other spelling of an old URL.

The compiler rejects chains, loops, dead targets, canonical-source collisions,
unsafe/nonlocal paths, duplicate outputs and unregistered known removals. Every
declared retained anchor must exist in the actual rendered target. An explicit
empty anchor list means the owner reviewed that no original anchors need
retention; it is not permission to omit a known linked anchor.

The preview sends a single HTTP 308 with a canonical target. Native browser
navigation inherits an incoming fragment when the Location has no fragment;
the server also preserves the query. A static fallback uses a local script to
carry the query and fragment before replacing the URL. It includes a canonical
link and does not enter canonical navigation or search as duplicate content.

The existing `index.html` home entry uses the same preservation boundary,
without inventing a historical migration entry.

Without JavaScript, the static page stays at the original URL and displays a
working canonical link and explicit fragment instructions. Follow that link
and retain any original `#fragment` on the destination address manually. This
is a usable fallback, not automatic opaque-fragment forwarding. Native meta
refresh drops that fragment, so the reader does not use it for registered
transfers. An unknown or already-removed target anchor cannot be recovered by
changing a URL; obtain the content owner's mapping instead.

To check a proposed transfer in the maintained isolated fixtures, run:

```bash
node --test scripts/tests/docs-reader-redirects.test.mjs
node scripts/tests/docs-reader-redirects.browser.mjs
```

The native browser fixture checks actual loopback requests and static file
navigation, with JavaScript enabled and disabled. Its synthetic old/new routes
are test data, not a claimed historical publication. Keep missing browser/fonts
as prerequisite failures rather than substituting string-only assertions.

## CI and the remaining acceptance boundary

The documentation workflow validates pull requests and applicable manual runs.
It installs the declared Node, Go, and Helm tools and locked root and reader dependencies,
checks publication and parser/build regressions, including isolated redirect
requests and native browser fixtures, builds the local HTML artifact,
and checks blueprint and suite documentation contracts. It also
regenerates selected inventories/reference output, and rejects resulting drift.
Its `docs:check:generated` chain also includes multiple inventory and parity
checks. The workflow's validation job does not
invoke the full `docs:publish-check` chain or a rendered-site deployment.
On main, its update job can regenerate files, commit allowed generated changes,
and push them. This is a write workflow, not evidence of external hosting.
Consult [Workflow inventory](workflows.md) and the workflow source before
changing triggers, permissions, or owned outputs.

The implementation belongs to `.github/workflows/docs-checks.yaml`. Validation
can regenerate transient files before rejecting drift. The main update job can
commit and push only its declared generated paths; reader output is not one of
those source paths. Neither route deploys external hosting. The declaration of
these checks is not evidence that a CI run or the complete generated-source
chain passed. Record the actual first failure when a broader check is blocked.

A complete reader release also needs checks of the actual renderer: local and
built links, anchors, assets, routes and redirects; defined search questions;
narrow and wide screens; keyboard focus and screen-reader reading; diagrams'
text alternatives; and no-script/offline critical instructions. Capture failures
and their affected pages. Markdown lint, a route JSON file, or an artifact report
cannot substitute for those observations. Only the explicitly retained local observations establish their tested scope.
They do not establish external hosting, all-page visual acceptance, a human
screen-reader trial, or whole publication acceptance.
