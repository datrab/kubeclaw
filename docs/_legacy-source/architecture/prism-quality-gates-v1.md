# Prism Quality Gates v1

Status: accepted architecture contract

## Decision

Prism uses two evaluation groups and one combined report:

```text
deterministic validation
  + design review
  -> combined findings report
  -> user fixes or accepts non-blocking limits
  -> explicit approval
```

Prism does not calculate one general design score. A total score can hide a serious
failure.

## Group 1: deterministic validation

This group checks facts that Prism can reproduce.

### Document checks

Prism checks schema validity, IDs, references, node properties, component cycles,
assets, flow actions, runtime support, and resource limits.

### Coverage checks

Prism compares the design with the approved architecture and design request. It
checks that all required screens, states, flows, surfaces, and important experience
areas exist.

### Flow checks

Each required flow must have a valid start, declared actions and responses, a
reachable success state, required error paths, and required recovery paths. Required
flows must not contain unreachable steps or unintended dead ends.

### Responsive checks

Prism checks each required `compact`, `regular`, and `wide` target. Content must fit,
remain readable, preserve important information, and keep navigation and controls
usable. Mobile targets must have usable touch targets.

### Automatic accessibility checks

Prism checks contrast, heading order, labels, alternative text, keyboard access,
focus behavior, touch-target size, reduced motion, and other reproducible rules.

A deterministic validation failure blocks publication when its configured level is
`blocking`.

## Group 2: design review

This group reviews matters that need design judgment:

- visual hierarchy;
- consistency;
- readability;
- information density;
- typography, spacing, color, and component use;
- interaction clarity;
- content quality;
- originality;
- fit with the brief and selected direction;
- manual accessibility concerns.

Design review must identify separate concerns. It must not hide them in one score.
Subjective concerns normally require review. Only clear violations of an accepted
requirement cause a blocking finding.

Prism's own review cannot approve a design and cannot become evidence of user taste.

## One finding format

Both groups use one structure:

```json
{
  "id": "missing-password-recovery",
  "group": "deterministic-validation",
  "check": "flow",
  "level": "blocking",
  "message": "The sign-in flow has no password recovery path.",
  "target": {
    "kind": "flow",
    "id": "authentication"
  },
  "fix": "Add a password recovery path."
}
```

Each finding must use plain language, identify the exact target, explain the problem,
and give a useful fix when one is known. Studio links the finding to the affected
view, state, flow, component, or node.

## Finding levels

V1 uses only:

- `blocking`: the user must fix the problem before publication;
- `review`: the user must fix it or explicitly accept the limitation;
- `information`: advice that does not require an action.

Prism does not use a larger severity scale.

## Combined report

The two groups produce one immutable report for one exact input set:

```text
Design Document digest
+ preview index digest
+ runtime profile digest
+ gate-pack digest
+ evaluator versions
```

The report shows one project state:

- `ready`: no blocking or unresolved review findings;
- `needs-attention`: no blocking findings, but review findings remain;
- `blocked`: one or more blocking findings remain.

A changed Design Document, preview, runtime profile, or gate pack makes the old
report stale.

## Execution model

Worker-core receives at most two Prism evaluation operations for one review cycle:

```text
deterministic validation
design review
```

Each operation can run its internal checks in parallel. Prism does not create one
worker attempt for each individual check.

The operations are idempotent. The same immutable inputs and evaluator versions
must produce the same automatic result. A worker or provider failure is an execution
failure. It is not a design finding.

## Gate packs

Checks are customizable through versioned gate packs:

```text
Prism core gate pack
+ optional surface pack
+ optional domain pack
+ project requirements
```

Examples include mobile application, developer-tool, commerce, healthcare, and TUI
packs.

A pack can add checks or make a requirement stricter. A project cannot disable
platform safety, document integrity, or required accessibility checks. Every report
records the exact gate-pack digest.

## User decision

Studio lets the user:

- open the exact affected design target;
- request or make a fix;
- accept a non-blocking limitation with a reason;
- reject an incorrect subjective finding;
- approve the exact design revision.

A blocking finding cannot be accepted as a limitation unless an authorized platform
policy change changes its level.

Publication requires explicit user approval. Automatic checks and AI review cannot
publish a Baseline Bundle.

## Reliability rules

- Checks never change the Design Document.
- Failed checks preserve the last valid design and report.
- Reports bind to immutable input digests and evaluator versions.
- Stale reports cannot authorize publication.
- The same finding format is used in Studio and the Baseline Bundle evidence.
- Accepted limitations and their reasons enter the publication evidence.
- Automatic evaluation does not create preference-learning events.
- The system remains correct without an optional design-review provider; publication
  waits or follows an explicit configured manual-review path.

## Deferred work

V1 does not use a universal score, learned quality model, service per check, complex
severity system, automatic approval, or project-controlled removal of core gates.

## Acceptance checks

Point 10 is implemented only when tests prove that:

1. invalid documents and missing required flows block publication;
2. all required viewports are evaluated;
3. deterministic checks reproduce the same report for the same inputs;
4. a worker failure does not become a design failure;
5. changed inputs make old reports stale;
6. gate packs cannot disable mandatory platform checks;
7. every finding links to an exact design target;
8. review findings require a fix or recorded user decision;
9. blocking findings cannot be accepted without an authorized policy change;
10. only explicit approval can publish the evaluated revision.
