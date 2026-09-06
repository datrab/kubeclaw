# Testing And CI

Permanent release checks:

```bash
npm run verify:plugin-system-v2
npm run typecheck:skills
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

The real model-backed harness is
`tests/verification/e2e/run-real-pipeline-e2e.mjs` and is run deliberately at
release cutover because it consumes external agent capacity.
