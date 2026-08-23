# Create A First Plugin

Status: implemented
Audience: plugin author
Owner: plugin-foundation
Evidence: skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; scripts/verify-plugin-packages.mjs
Applies to: pipeline-plugin-v2
Last verified: generated during publication

## Objective

Create a plugin package that the canonical registry can inspect without executing package code.

## Prerequisites

- Choose one unique package identifier.
- Choose one supported extension surface.
- Use only public SDK imports.

## Procedure

1. Create a package directory under the applicable plugin root.
2. Add an inert `plugin.json` manifest.

```json
{
  "id": "acme.example",
  "apiVersion": "pipeline-plugin-v2",
  "packageVersion": "1.0.0",
  "stages": [
    {
      "id": "example",
      "type": "acme.example.stage",
      "module": "src/stage.ts",
      "export": "execute",
      "requiredCapabilities": [],
      "configSchema": "schemas/config.schema.json",
      "inputSchema": "schemas/input.schema.json",
      "resultSchema": "schemas/result.schema.json"
    }
  ],
  "observers": [],
  "adapters": []
}
```

3. Add each declared module, export, and schema.
4. Add package tests for validation, denial, failure, cancellation, and cleanup.
5. Run the package and platform verification gates.

```bash
npm run verify:plugin-packages
npm run verify:plugin-system-v2
```

## Expected Result

Discovery validates inert metadata before activation. The registry rejects missing files, duplicate ownership, and undeclared authority.

## Verification

Confirm that the generated [Plugin Catalogue](plugin-catalogue/README.md) contains the new package after generation.

## Common Failures

- A duplicate identifier conflicts with an installed package.
- A missing schema blocks registration.
- A private core import violates the package boundary.
- A requested capability without an operator grant blocks startup.

## Recovery

Correct the manifest or package boundary. Do not add an alias, fallback reader, or parallel implementation.
