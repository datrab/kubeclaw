# HTTP Test Provider

This plugin performs one bounded HTTP request through the Buster network
capability. It verifies the response status, content type, and optional text.

The provider can use an explicit origin or a typed Kubernetes deployment
fixture. It does not deploy workloads, start servers, or expose services.

Run its verification with:

```bash
npm test --prefix skills/buster/plugins/http
```

The configuration schema intentionally does not default `path`. After plan
resolution an omitted path retains a linked public endpoint's URL path. An
explicit path overrides it; a target origin without a path still uses `/`.
