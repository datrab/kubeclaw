# Deployment Verification

## Procedure

Render manifests, validate schemas, and inspect image/config references.

## Verification

```bash
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

## Troubleshooting

Regenerate values/reference inventories after changing chart or deploy inputs.
