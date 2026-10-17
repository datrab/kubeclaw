# Documentation site and publication

Status: source-described publication workflow; rendered-site behavior requires separate verification
Audience: operator, plugin author, developer, documentation maintainer
Owner: documentation
Evidence: scripts/docs-publication.mjs; scripts/lib/docs-publication-assets.mjs; scripts/lib/docs-publication-links.mjs; scripts/docs-governance.mjs; scripts/docs-check-refs.mjs; scripts/check-site-reader-boundary.mjs; docs/config/documentation-tree-classification.json; docs/site/reference/documentation-route-registry.json; package.json; .github/workflows/docs-checks.yaml
Applies to: repository reader pages under docs/site and the Markdown publication staging command
Last verified: implementation behavior checked on 2026-10-15; no build, browser, search, or accessibility execution asserted

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

Use section indexes and your Markdown viewer's find function for an exact ID.
The publication command does not create a full-text search index or search UI.
A viewer's text search is not a ranked search over all canonical pages. If a
name is not found, follow the component's reference or implementation evidence;
absence from search results does not prove absence from the product.

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

A source link must remain useful without JavaScript. The current staging build
turns plain Evidence paths into GitHub links at the checkout's HEAD. Existing
explicit links in prose retain their written revisions. The plugin catalogue
also checks selected source snippets against the separate documentation source
revision before it creates pinned links. These are different revision paths.
A dirty checkout can therefore make a new HEAD link describe older bytes than
the local page. Reconcile source changes and their revision before publication;
do not repair a mismatch by weakening its source guard.

> **Source — evidence revisions**
>
> Claim: selected catalogue evidence uses the documentation source revision; plain Evidence links in staged pages use HEAD.
> Implementation: `scripts/docs-publication.mjs`, `sourceEvidenceLink`, lines 147–164; `build` Evidence conversion, lines 993–1013.
> Contract: the catalogue checks tracked regular source bytes and the selected line range; the staging conversion uses its checkout commit. Existing explicit prose links retain their written revision.
> Validation: no build or test execution for this statement.
> Checkout identity: publisher SHA-256 `c5eeab7ccabf48343ff7a118c8d74da2dd3300dfbe57271008f5248bbc2ecd70`. This identifies the current file bytes, not a claimed committed revision.
> Limit: these locators do not provide a rendered snippet or prove that HEAD contains local changes. Reconcile the source bytes before creating a commit permalink.

The build does not render an inline code-evidence box or retrieve a displayed
snippet from the linked commit for every authored claim. Open the cited source
and check the claim, contract, validation, revision, and limitation explicitly.
An old permalink remains readable but may no longer describe current behavior.

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

## Routes, links, and static use

The ownership map represents the root README as `/`, a section README as its
section route, and another Markdown page as a trailing-slash route. For example,
this page maps to `/reference/documentation-site/`. The staging build preserves
Markdown relative paths; it does not implement those routes in an HTTP server.
A renderer or hosting system must supply and test the actual routes.

The [route registry](documentation-route-registry.json) records redirect intent.
The governance checker rejects duplicate redirect origins, an origin that is
still an active page, a missing active target, and a self-redirect. A valid
registry alone does not prove HTTP redirects, static redirects, query/fragment
preservation, or a successful request through a hosting layer.

Keep a single canonical explanation for each fact. Before a rename or removal,
move still-valid information, update incoming links and ownership, and declare
the successor according to [governance](documentation-governance.md). Test the
old route and its anchors in the actual output before retiring it. Do not
invent historical redirects for paths that were never public.

The staging artifact is Markdown plus approved assets. Read it in a Markdown
viewer using relative page links. Tables and written procedures remain the
primary explanation. A Mermaid diagram needs an adjacent text explanation for
a viewer that cannot render it. This publisher does not provide an interactive
architecture viewer or an automatic static export of one. Any future optional
interaction must preserve its essential explanation without scripts, hover,
color, or a network fetch. External source links require network access; the
local explanation must still state the safe action when those links are offline.

## Check and stage a local copy

Use the repository root with Node.js 24 and its locked root dependencies.
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
```

These are instructions, not a record of successful execution for this page.
Some selected generators and checks have additional child-process or tool
requirements. Do not treat a command's name as permission to run it in an
unprepared or restricted environment.

| Mode | Reads and result | Writes and failure boundary |
| --- | --- | --- |
| `docs:publication:generate` | Builds plugin catalogue/capability content and the operator plugin matrix from their inputs | Writes those owned pages/sections sequentially. A failure can leave earlier writes; inspect the diff and first error. It is not the prose-page generator. |
| `docs:publication:check` | Runs the two publication helper test files, then compares generated content and checks selected pages, assets, metadata, language, links, and bounded examples | Does not invoke publication `generate` or `build`. A nonzero helper or publisher result stops the chain. It does not render a website. |
| `docs:publication:build` | Runs publication input checks, then stages Markdown and assets with a report | After successful input checks, removes and recreates `.tmp/docs-publication`. A later copy/write failure can leave partial output. Exit zero and the fresh report are required. |
| `docs:publish-check` | Runs the broader `docs:check` chain, then the staging build | Includes mutation tests and the staging replacement. It is not a lightweight link check or a hosting deployment. |

> **Source — publication modes and owned output**
>
> Claim: generation writes its owned pages/section; checking compares inputs; staging removes its output only after input checks and then writes sequentially.
> Implementation: `scripts/docs-publication.mjs`, `generate`, lines 713–721; `compareGenerated`, lines 723–735; `checkSite` input selection, lines 831–854; `build` and report, lines 993–1027.
> Contract: `package.json` selects the explicit generate/check/build modes. The report lists declared checks and input identity, not browser results.
> Validation: no mode or helper test execution for this statement.
> Checkout identity: publisher SHA-256 `c5eeab7ccabf48343ff7a118c8d74da2dd3300dfbe57271008f5248bbc2ecd70`; no committed revision asserted for these file bytes.
> Limit: initialization, source/Git prerequisites and selected helper effects still apply. The staging directory is not an atomic publication transaction or rendered site.

Inspect `.tmp/docs-publication/build-report.json` and its sibling pages/assets.
The report contains the Git revision, page count, asset paths, plugin count,
a digest of concatenated input page contents, and declared check labels.
Those labels are not browser observations or individual coverage results.
The report is not a complete per-route canonical URL, redirect, source, and
rendered-content digest manifest. Reproducing the same output requires the same
inputs, source revisions, dependencies, and tools; two clean builds must still
be compared before claiming reproducibility.

If input checks fail before output replacement, an old staging directory may
remain. Its existence does not mean the new build passed. If staging fails
after replacement, preserve the diagnostic and partial output for diagnosis;
remove only the owned `.tmp/docs-publication` tree when no inspection uses it.
Never reset unrelated generated files or another author's changes.

## What CI does, and what still needs a renderer

The documentation workflow validates pull requests and applicable manual runs.
It installs the declared Node, Go, and Helm tools and locked dependencies,
regenerates selected inventories/reference output, and rejects resulting drift.
Its `docs:check:generated` chain also includes multiple inventory and parity
checks. The workflow's validation job does not
invoke the full `docs:publish-check` chain or a rendered-site deployment.
On main, its update job can regenerate files, commit allowed generated changes,
and push them. This is a write workflow, not evidence of external hosting.
Consult [Workflow inventory](workflows.md) and the workflow source before
changing triggers, permissions, or owned outputs.

> **Source — CI drift and update boundaries**
>
> Claim: validation can regenerate transient files before rejecting drift; the main update job can commit and push allowed generated paths, without deploying a rendered site.
> Implementation: `.github/workflows/docs-checks.yaml`, `jobs.validate` drift/check steps, lines 39–71; `jobs.update` commit/push and event condition, lines 140–166.
> Contract: pull-request or non-main manual validation has read contents permission; the main update route has write contents permission and checks its allowed outputs.
> Validation: no workflow execution for this statement.
> Checkout identity: workflow SHA-256 `5349499f1936d361a0d269bc45664550580fb8b1af5773391fbdd30dd08a35d7`; no committed revision asserted for these file bytes.
> Limit: a workflow declaration is not evidence of a successful job, external hosting, redirects, search, or browser behavior.

A complete reader release also needs checks of the actual renderer: local and
built links, anchors, assets, routes and redirects; defined search questions;
narrow and wide screens; keyboard focus and screen-reader reading; diagrams'
text alternatives; and no-script/offline critical instructions. Capture failures
and their affected pages. Markdown lint, a route JSON file, or a staging report
cannot substitute for those observations. This page describes the source
workflow; it does not assert that those rendered-reader checks have passed.
