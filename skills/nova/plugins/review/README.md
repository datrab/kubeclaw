# Review plugin

Owns the deterministic protocol around judgment-based code review:

- prompt and task construction;
- the closed reviewer-output contract;
- PASS evidence validation;
- FAIL diagnostics and finding normalization;
- canonical v2 stage-result reduction.

Reviewer judgment intentionally remains behind `runtime.dispatch`. The package never
trusts a dispatched response as pipeline control data: it parses the `result` field
against its own closed contract and reduces it to a canonical result. Invalid or
contradictory output blocks the stage.

The package is not yet parity evidence for the complete legacy review lifecycle.
Agent session management, remediation cycles, publication, and final agent-backed
E2E coverage remain part of the final all-v2 cutover.

Run package-local deterministic tests with:

```bash
npm test
```
