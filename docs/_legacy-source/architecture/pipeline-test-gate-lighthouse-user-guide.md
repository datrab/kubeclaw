# Lighthouse test user guide

Use `kubeclaw.lighthouse@1` for performance, SEO, or best-practices checks. Create separate nodes for separate purposes.

## Performance example

```json
{
  "uses": "kubeclaw.lighthouse@1",
  "mode": "blocking",
  "config": {
    "purpose": "performance",
    "routes": ["/", "/account"],
    "settingsFile": ".swarm/lighthouse-settings.json",
    "profile": "desktop",
    "budget": "release",
    "runs": 3
  }
}
```

Use three runs for normal gates. Use five runs only for an important gate. The provider runs samples sequentially and uses the median result. Each route must meet all values in the selected budget.

## SEO and best-practices

Set `purpose` to `seo` or `best-practices`. Use one run. Do not set a performance budget. A blocking node fails for each failed audit unless an exact acceptance applies.

An acceptance contains `audit`, `route`, `reason`, and `expiresAt`. It does not hide the finding. Review the acceptance before its expiry date.

## Target selection

Prefer a typed deployment or public-endpoint input. Use `url` only for an operator-approved origin. Do not put credentials in a URL.

## Evidence

The result stores every Lighthouse JSON report. One performance report per route uses evidence type `performance-report-representative`. The other reports use `performance-report`. Provider details record the selected profile, versions, benchmark index, routes, metrics, and worker limits.

## Add and verify the node

1. Add `.swarm/lighthouse-settings.json` and validate it against the published settings schema.
2. Add one node for each required purpose.
3. Link the node to the deployment fixture when the application runs in Kubernetes.
4. Run `npm run verify:test-gate:lighthouse-cutover` before review.
5. Inspect every report and the representative report in evidence storage.

In CI, keep a blocking performance node with a named budget. Use advisory mode for a measurement that has no budget. A blocking performance node without a budget is rejected during plan resolution.

## Disable a check

Remove the node from the reviewed pipeline declaration. Do not use an empty route list or an empty budget to disable it. To pause one budget value, remove that value from the named budget and record the review decision in source control.

## Failure recovery

For a budget failure, inspect the representative report and all sample reports. For an audit failure, inspect the exact audit identifier and route. For an execution error, use the error reference and Buster attempt logs. A retry uses a new browser process. Do not add an acceptance for a browser, network, or report error.

## Migration

Old `test_config.perf` thresholds are not converted. Create named profiles and budgets explicitly. Project setup fails with `LEGACY_PERF_CONFIGURATION_RETIRED` until the replacement node exists and old configuration is removed.
