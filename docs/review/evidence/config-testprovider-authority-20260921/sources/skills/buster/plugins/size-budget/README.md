# Size Budget Test Provider

This plugin measures archive entries against declared byte limits. It can also compare the result with an optional baseline artifact.

The provider emits structured findings, logs, and a canonical baseline artifact. It returns an error when the input archive is unsafe or malformed.

Run its verification with:

```bash
npm test --prefix skills/buster/plugins/size-budget
```
