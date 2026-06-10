# Developer Guides

Status: current
Audience: developer, maintainer

## Purpose

Use this section when changing KubeClaw source code, verification, or documentation.

## Guides

- [Contributing to KubeClaw](contributing.md)
- [Codebase tour](codebase-tour.md)
- [Adding pipeline features](adding-pipeline-features.md)
- [Adding gates](adding-gates.md)
- [Hooks and plugins](hooks-and-plugins.md)
- [Replacing or adapting the agent runtime](replacing-agent-runtime.md)
- [Adding Buster suites](adding-buster-suites.md)
- [Adding observability sinks](adding-observability-sinks.md)
- [Linting rules](linting-rules.md)
- [Adding verification](adding-verification.md)
- [Testing and CI](testing-and-ci.md)
- [Documentation conventions](documentation-conventions.md)

## Contributor Paths

- Docs and examples: `contributing.md`, `documentation-conventions.md`, and `../examples/README.md`
- Pipeline changes: `adding-pipeline-features.md`, `adding-gates.md`, and `replacing-agent-runtime.md`
- Runtime and extension changes: `hooks-and-plugins.md` and `adding-observability-sinks.md`
- Quality changes: `adding-buster-suites.md`, `linting-rules.md`, `adding-verification.md`, and `testing-and-ci.md`

## Development principle

The current behavior authority is source code plus verification. Archived plans and historical docs can explain why a surface exists, but they do not override current code.
