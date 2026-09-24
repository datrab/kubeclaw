# End-to-end test user guide

## Overview

Use `kubeclaw.playwright@1` to run your own Playwright configuration against a KubeClaw test deployment. Your repository owns the tests and Playwright behavior. KubeClaw does not rewrite assertions or select tests.

## Project configuration

Add a test node to `.swarm/pipeline.json`. Set `projectDirectory` to the directory that contains your application tests. Set `configFile` relative to that directory. Connect either a Kubernetes deployment output or a public endpoint output.

The Kubernetes Service for the E2E node must expose port `18080`. Add `kubeclaw/e2e-target: "true"` to the tested Deployment pod-template labels. The namespace controller uses that label and the lease identity to create a per-run Egress NetworkPolicy. A missing label makes the deployment unreachable from the Playwright process and fails the run.

Your Playwright config can read `PLAYWRIGHT_TEST_BASE_URL` or `BASE_URL`. It owns test selection, projects, retries, authentication setup, screenshots, video, traces, and test timeouts.

Use the complete example in `contracts/pipeline-test-gate/v1/examples/e2e-playwright.json`. A normal deployment-linked node has this shape:

```json
{
  "uses": "kubeclaw.playwright@1",
  "mode": "blocking",
  "retries": 0,
  "needs": ["kubernetes-deployment"],
  "concurrencyGroup": "browser-playwright",
  "config": {
    "projectDirectory": ".",
    "configFile": "playwright.config.ts",
    "workers": 2,
    "timeoutMs": 600000
  },
  "inputs": {
    "deployment": {
      "from": "kubernetes-deployment",
      "output": "deployment"
    }
  }
}
```

Keep pipeline retries at zero. Configure test retries in Playwright so its JSON report contains the complete attempt history.

## Result rules

- A test that still fails after project retries fails the provider result.
- Skipped tests remain visible and do not fail by default.
- A run that executes zero tests is an error.
- Advisory mode changes the Nova gate effect. It does not change the provider facts.
- The JSON report is authoritative. Console summaries are logs only.

## Evidence

The provider stores the Playwright JSON report. It also stores each screenshot, video, trace, and other attachment that Playwright reports, within operator limits.

Each result includes the selected browser-project names and one record for every test case. Failed cases include their final Playwright error as a stable finding.

## Common failures

- If the run reports zero tests, check `testDir`, project filters, and the config path.
- If Buster rejects the target, connect the deployment output or ask the operator to approve the exact origin.
- If evidence exceeds a limit, reduce retained video or trace data in the project config.
- If the total deadline expires, reduce the test set or ask the operator to review the maximum.
