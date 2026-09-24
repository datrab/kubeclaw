# Runbook Template

Status: template
Audience: documentation authors

## Purpose

Use this template for incident, stuck-state, and recovery pages.

```text
# Runbook name

## Symptoms
## Impact
## Fast checks
## Likely causes
## Recovery procedure
## Verification
## Escalation
## Prevention
## Related reference
```

## Required Content

- Observable symptoms from CLI output, logs, Discord messages, Kubernetes state, status files, or artifacts.
- Impact on operators, agents, pipeline state, or deployment health.
- Fast checks ordered from least invasive to most invasive.
- Likely causes that can be confirmed or ruled out.
- Recovery procedure that separates safe retries from risky state changes.
- Verification that proves the recovery worked.
- Escalation evidence to collect before handoff.
- Prevention or maintenance action where available.
