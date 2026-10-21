# KubeClaw Documentation

Status: implemented
Audience: operator, plugin author, maintainer, architecture reader
Owner: documentation
Evidence: packaging/runtime/package-ownership.json
Applies to: current supported release
Last verified: generated during publication

## Purpose

Start with the task that you must complete. Each route has one primary reader and one clear result.

## Start With Your Task

| Task | Shortest route | Result |
| --- | --- | --- |
| Understand what KubeClaw controls | [Architecture entry](understand/README.md) | System boundary, roles, authority, and request flow |
| Understand or change Prism | [Prism architecture](understand/prism.md) | Complete runtime, data, operator, and developer route |
| Understand or change Buster | [Buster architecture](understand/buster.md) | Plan resolution, remote execution, evidence, suites, and safe extension routes |
| Check a local checkout | [Operator quickstart](use/quickstart.md) | Verified source and documentation inputs without external effects |
| Plan or install the platform | [Plan and Install](use/install.md) | Verified deployment or an exact blocked prerequisite |
| Configure, start, or inspect a run | [Configure and Operate](use/operate.md) | Recorded command, run identity, and result boundary |
| Run an approval or test workflow | [Pipeline workflows](use/workflows/README.md) | Concrete inputs, ordered procedures, and explicit execution limits |
| Diagnose an active problem | [Observe and Diagnose](use/diagnose.md) | Cause class, retained evidence, and safe next action |
| Recover durable state | [Back Up and Recover](use/recovery.md) | Verified recovery or a declared missing prerequisite |
| Plan capacity or retention | [Capacity and Retention](use/capacity.md) | Measured limits, owned cleanup, and retained recovery evidence |
| Activate or remove a plugin | [Operate Plugins](use/plugins.md) | Verified package, registration, grant, activation, and removal boundaries |
| Operate Prism and Studio | [Prism and Studio](use/prism-studio.md) | Source-backed setup, health, recovery, and cleanup procedures |
| Deliver a demo for human acceptance | [Demo Delivery](use/demo-delivery.md) | Immutable technical handoff kept separate from human acceptance |
| Create a first pipeline plugin | [First plugin](extend/first-plugin.md) | Tested package, activation proof, and removal proof |
| Select or change an extension type | [Extension decision guide](extend/README.md) | Smallest supported change and its authority boundary |
| Find an exact name or setting | [Reference](reference/README.md) | Source-backed command, setting, registration, or limit |
| Check current support and limits | [Current Status](status/current.md) | Implemented, open, and live-acceptance states kept separate |

The [Product Surface Map](product-surfaces.md) lists every public surface family.
Use it when you do not know which track owns a component, interface, or configuration.

## Three Connected First Journeys

- Architecture readers start with [Understand KubeClaw](understand/README.md).
- Operators start with the [Operator Quickstart](use/quickstart.md), then compile the [maintained first project](use/workflows/README.md#materialize-and-compile-a-first-project). Use [Configure and Operate](use/operate.md) for governed execution.
- Plugin developers start with [Create and Activate a First Pipeline Plugin](extend/first-plugin.md).

The first-project exercise supplies the complete local project and repository
inputs, compiles the eight-stage graph, and explains inspection, failures and
cleanup. It does not admit or execute that graph. A governed run additionally
requires operator-owned runtime platform configuration, grants and services.
[The two command forms](use/operate.md#understand-the-two-command-forms)
define that separate execution boundary.

## Documentation Tracks

- [Understand](understand/README.md) explains architecture, authority, runtime flow, and system boundaries.
- [Operate](use/README.md) explains planning, installation, daily operation, diagnosis, recovery, maintenance, and retirement.
- [Extend](extend/README.md) explains plugin authoring, testing, packaging, and supported extension points.
- [Reference](reference/README.md) contains generated facts from current source, configuration references, and the glossary.
- [Current Status](status/current.md) links current work, local closure and separate live acceptance.
- [Open issues](status/open-issues.md) lists remaining implementation work and completion criteria.
- [Roadmap](status/roadmap.md) explains planned platform improvements and why they matter.
- [Decisions](decisions/README.md) records enduring constraints, their rationale and approval evidence.
