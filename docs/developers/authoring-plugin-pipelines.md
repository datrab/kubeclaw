# Authoring v2 plugin pipelines

Status: target v2 authoring contract. V1 remains production authority until the
Phase 12 atomic cutover.

A pipeline definition contains only generic stage nodes. Each node selects an
installed plugin-defined `type`, declares ordinary dependencies, supplies
schema-validated configuration and input, and sets core-owned execution policy.

```json
{
  "schemaVersion": "pipeline-definition.v2",
  "id": "pipeline:example",
  "maxConcurrency": 2,
  "stages": [
    {
      "id": "implement",
      "type": "acme.implementation",
      "dependsOn": [],
      "config": {},
      "input": {},
      "execution": {
        "maxAttempts": 3,
        "maxRemediationCycles": 1,
        "orchestratorAfterAttempt": 2,
        "timeoutMs": 600000
      }
    },
    {
      "id": "review",
      "type": "acme.review",
      "dependsOn": ["implement"],
      "config": {},
      "input": {},
      "execution": {
        "maxAttempts": 3,
        "maxRemediationCycles": 1,
        "timeoutMs": 300000
      },
      "on": {
        "request_fix": "implement"
      }
    }
  ]
}
```

Ordinary dependencies must be acyclic; fan-out and fan-in are supported.
Remediation is a separate bounded edge. Plugins cannot add nodes or edges after
run creation.

Core freezes the graph and pins its digest. Editing a definition cannot change
an existing run: resume with a different graph fails. Create a new run for a
new graph.

Canonical results are `passed`, `retry`, `request_fix`, `wait`,
`orchestrator_required`, `blocked`, `failed`, `timed_out`, `rate_limited`, and
`cancelled`. `needs_nova` and `action_required` are not aliases and fail schema
validation.
