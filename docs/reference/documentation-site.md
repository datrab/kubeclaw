# Documentation site and publication

Status: current local static reader
Audience: reader, documentation maintainer
Owner: documentation
Evidence: scripts/docs-reader/build.mjs; scripts/docs-reader/renderer.mjs
Applies to: documentation directly under docs/
Last verified: 2026-11-02; source layout and reader-build change

## Find your task

Start at the [documentation home](../README.md). The Understand, Operate,
Extend and Reference tracks link to the owning explanations and tasks.
Use the reader's search for a term or exact identifier. Search data stays local
to the artifact; no query is sent to an external service. Large retained
references can make the initial search-index load substantial.

## Build and read locally

Follow [Maintain the documentation](../extend/documentation-maintenance.md)
for dependency installation, source checks and the local reader build.
`npm run docs:build` produces `.tmp/docs-publication/`; `npm run docs:serve`
serves it on loopback. The output contains HTML, navigation, search, examples,
assets and rendered diagrams with their adjacent text alternatives.
The original Markdown and runnable examples live directly in `docs/`.

## Scope and limits

A reader build is not deployment, accessibility certification, full reference
regeneration or product acceptance. Source citations can intentionally describe
historical revisions. They do not establish the state of a running deployment.
Existing reference content is retained while its future generator scope is
simplified. Legacy migration and review records are available through Git
history, not as a second documentation tree or build prerequisite.

## Existing routes

[Route redirects](documentation-route-registry.json) preserve earlier public
reader URLs. Moving repository sources from `docs/site/` into `docs/` does not
change those reader URLs. Source permalinks to historical commits stay unchanged.
