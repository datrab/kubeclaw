# Prism Preference Learning v1

Status: accepted architecture contract

## Decision

Prism stores append-only contextual preference evidence and derives an explainable,
rebuildable profile only when a consumer needs one.

```text
append-only preference events
  -> deterministic projection
  -> user-visible, correctable contextual rules
  -> bounded guidance for retrieval and generation
```

V1 does not use a global taste score, neural preference model, automatic time decay,
passive interaction tracking, shared population learning, or Prism's own design scores
as preference evidence.

## Event contract

```json
{
  "schema": "prism.preference-event.v1",
  "eventId": "preference-event-01",
  "userId": "user-01",
  "projectId": "user-app",
  "action": "selected",
  "target": {
    "kind": "direction",
    "id": "calm-technical",
    "revision": 1
  },
  "alternatives": [
    {
      "kind": "direction",
      "id": "expressive-editorial",
      "revision": 1
    }
  ],
  "context": {
    "surface": "web",
    "domain": "developer-tools",
    "audience": "technical-expert",
    "task": "operations-dashboard"
  },
  "traits": [
    {
      "name": "information-density",
      "value": "dense",
      "polarity": "positive"
    }
  ],
  "source": "explicit",
  "learningScope": "project",
  "occurredAt": "2026-08-15T20:00:00Z"
}
```

Required fields are `schema`, `eventId`, `userId`, `action`, `target`,
`alternatives`, `context`, `traits`, `source`, `learningScope`, and `occurredAt`.
`projectId` is required for project learning and optional for a personal preference
expressed outside a project. Events are immutable and idempotent by `eventId`.

## Actions and evidence

V1 actions are:

```text
selected
rejected
liked
disliked
preserved
changed
reverted
retracted
```

Prism records no preference event for passive clicks, scrolling, hovering, an
unchanged design, or a design that receives no user response. Baseline approval
remains in baseline and approval records; approval alone is not clear evidence of
taste.

Targets can be a direction, reference, design, view, component, node, trait,
baseline, or implementation. Versioned targets identify the revision the user saw.
Pairwise alternatives preserve the choice context and can be empty for direct
feedback.

## Traits and context

Traits record normalized explanations only when the user states them or Prism can
classify them with sufficient evidence:

```json
{
  "name": "navigation-density",
  "value": "compact",
  "polarity": "positive"
}
```

Polarity is `positive` or `negative`. Traits can cover visual tone, density,
typography, color roles, spacing, radius, elevation, layout, navigation, imagery,
motion, content style, interaction style, and accessibility preference.

`traits` can be empty. Prism does not invent an explanation to fill an event.

Context can include surface, domain, audience, task, view type, flow type, and project
stage. Project evidence must not become universal. A preference for dense expert
dashboards does not imply dense consumer onboarding.

## Source and influence

Source is:

- `explicit` for a direct statement, selection, like, dislike, or rejection;
- `observed` for a clear edit, preservation, or reversal.

Events do not store strength. The versioned projection derives influence:

- explicit pairwise selection, like, dislike, preservation, or reasoned rejection is
  strong evidence;
- a clear edit or reversal is medium evidence;
- repeated observed evidence is required before a rule is created;
- approval or unchanged survival alone produces no event.

## Learning scope

V1 permits:

- `project`: use only in the current project;
- `personal`: use in compatible contexts across the user's projects.

If learning is disabled, Prism creates no preference event. V1 has no `none` or
`shared` scope.

## Retraction

A retraction is a separate event variant:

```json
{
  "schema": "prism.preference-event.v1",
  "eventId": "preference-event-09",
  "userId": "user-01",
  "action": "retracted",
  "retractsEventId": "preference-event-01",
  "source": "explicit",
  "learningScope": "project",
  "occurredAt": "2026-08-15T21:00:00Z"
}
```

Retraction cannot target itself. Repeating the same effective retraction is
idempotent. Projection ignores retracted evidence and preserves the audit trail.

## Derived profile

The profile is not canonical and is stored only when the first consumer needs it:

```json
{
  "schema": "prism.preference-profile.v1",
  "userId": "user-01",
  "rules": [
    {
      "trait": {
        "name": "information-density",
        "value": "dense"
      },
      "context": {
        "surface": "web",
        "domain": "developer-tools",
        "audience": "technical-expert"
      },
      "polarity": "positive",
      "confidence": "high",
      "evidenceCount": 6,
      "supportingEventIds": [
        "preference-event-01",
        "preference-event-04"
      ]
    }
  ],
  "sourceEventDigest": "sha256:...",
  "projectionVersion": "preference-projection-v1"
}
```

Confidence is `low`, `medium`, or `high`. The normal interface does not expose
internal weights or decimal confidence.

## Projection and conflict rules

V1 projection is deterministic:

1. Remove retracted and ineligible events.
2. Keep project and personal scopes separate.
3. Group compatible trait evidence by context.
4. Derive influence from the fixed action/source mapping.
5. Reduce confidence when evidence conflicts.
6. Require repeated observed evidence.
7. Preserve supporting event IDs.
8. Record the ordered source-event digest and projection version.

V1 has no automatic time decay. Changed preferences appear as contradictory or
explicit corrective evidence. The same ordered events and projection version produce
the same profile digest.

Priority is:

```text
explicit current instruction
  > explicit project evidence
  > explicit contextual personal evidence
  > repeated observed project evidence
  > repeated observed personal evidence
  > no preference
```

Craft, accessibility, safety, the approved brief, and design-system role rules remain
independent constraints. Taste cannot authorize an inaccessible or unsafe design.

## Use and user control

Retrieval remains valid without a profile. Compatible rules can add preferred traits
to a query, add disliked traits to `avoid`, choose between otherwise relevant
references, preserve project language, and explain the choice.

V1 does not modify PostgreSQL RRF scores with preference multipliers:

```text
PostgreSQL retrieves relevant evidence
  -> Prism applies compatible preference rules
  -> Prism preserves diversity and craft constraints
  -> Prism explains the choice
```

Studio provides a small `What Prism learned` view. Each rule can be confirmed,
limited to the project, rejected as a general preference, or forgotten. These actions
append corrections or retractions rather than mutating history.

## Storage and recovery

Canonical events use `preference_event`. A future derived profile table stores the
subject, scope digest, profile JSON, projection version, source-event digest, and
update time.

Losing profiles does not lose evidence. Recovery restores events, applies retractions
and scope, and reruns the identified projection version.
