# HTTP Test Provider

This plugin performs one bounded HTTP request through the Buster network
capability. It verifies the response status, content type, and optional text.

The provider can use an explicit origin or a typed Kubernetes deployment
fixture. It does not deploy workloads, start servers, or expose services.

Run its verification with:

```bash
npm test --prefix skills/buster/plugins/http
```
