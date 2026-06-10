# Troubleshooting Entry Template

Status: template
Audience: documentation authors

## Purpose

Use this template inside task pages, runbooks, common failure pages, and failure drills.

````text
### Symptom

What the operator sees.

Likely cause:
What usually causes it.

Check:
```bash
command to confirm or rule it out
```

Recovery:
```bash
safe command or procedure
```

Expected recovery state:
What should be true after the fix.
````

## Required Content

- Observable symptom.
- Check that confirms or rules out the cause.
- Safe recovery step, or clear warning when the step is risky.
- Expected state that tells the operator when to stop.
