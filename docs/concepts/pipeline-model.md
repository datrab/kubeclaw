# Pipeline Model

Status: current
Audience: operators, developers

## Overview

The KubeClaw pipeline separates orchestration from test execution. Nova owns pipeline scheduling, module and gate lifecycle, status, resume, and terminal outcomes. Buster owns accepted test tasks and emits evidence back through the validated task/completion surface.

## Main Ideas

- Modules group work and can have dependencies.
- Gates validate work before a run proceeds.
- Buster suites run in a separate worker boundary.
- Redis transports task and completion messages.
- Artifacts, summaries, and status files give operators evidence for debugging and recovery.

## Related Pages

- `../pipeline/architecture.md`
- `../pipeline/runtime-flow.md`
- `../pipeline/modules-and-gates.md`
- `../pipeline/workers-and-buster.md`
