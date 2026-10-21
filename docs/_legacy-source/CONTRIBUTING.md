# Contributing

All runtime behavior belongs in a plugin registration or in generic v2 core.
Core must not import concrete plugins. Tests for plugin behavior use TypeScript
or the component's native language.

Before submitting changes:

```bash
npm run verify:plugin-system-v2
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

See [authoring-plugin-pipelines.md](developers/authoring-plugin-pipelines.md)
and [testing-and-ci.md](developers/testing-and-ci.md).
