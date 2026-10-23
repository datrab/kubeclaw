import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Four exact owner-purpose routes below; one distinct external-CI seed follows.
// No output/runtime/module receipt.
// Existing operation, graph, dynamic-loader, alias and public-target guards
// remain mandatory; this cannot accept qualification DATA by itself.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const reviewedDocumentationOwnerPurposes=freeze({
  "scripts/check-capability-registrations-drift-controls.mjs": {
    "kind": "external-capability-reader-drift-controls/v1",
    "sourceSha256": "e76c88fe7d72eff87a6ba1e2ff63d8630ae6c7ec861e884dc8e3575c0ce5e3cb",
    "consumer": "Owned temporary manifest Add/Change/Remove and malformed-input controls for the canonical capability reader, not runtime configuration.",
    "purposeInputs": [
      {
        "path": "docs/site/reference/capabilities.md",
        "canonical": "docs/site/reference/capabilities.md",
        "sha256": "1785cb37214915c9a52658cb68426fcb7d4ae1acd576052b5b7a398f50a9dfd4"
      },
      {
        "path": "package.json",
        "canonical": "package.json",
        "sha256": "4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3"
      },
      {
        "path": "scripts/check-capability-registrations-drift.mjs",
        "canonical": "scripts/check-capability-registrations-drift.mjs",
        "sha256": "8a4d3b81e0f8f2ac374bcda38a6502c78c37308a218230c908e544a7766f0180"
      },
      {
        "path": "scripts/docs-tree-boundary.mjs",
        "canonical": "scripts/docs-tree-boundary.mjs",
        "sha256": "ee1487ec2e081cc6630ac7869895bd69f3251e0c44ffd8877e574b335981ae52"
      },
      {
        "path": "scripts/tests/docs-tree-boundary.test.mjs",
        "canonical": "scripts/tests/docs-tree-boundary.test.mjs",
        "sha256": "1f045e306575b2df32f9fc574b4f29c773cfa0c1489286441229a36853be348d"
      }
    ],
    "allowedSelectedAncestors": [
      "scripts/check-capability-registrations-drift-controls.mjs"
    ],
    "allowedNativePackageEntries": []
  },
  "scripts/docs-ap09-mutation-fixture.mjs": {
    "kind": "finite-documentation-patch-constructor/v1",
    "sourceSha256": "f46c275fce0ef9d55e2ac61a4bcc7b466519d42f07bec4ec8d86a7c2ce6fc687",
    "consumer": "Registered deterministic unified patches consumed only by the already reviewed documentation mutation callers in owned temporary copies.",
    "purposeInputs": [
      {
        "path": "charts/kubeclaw/files/config/swarm.config.json",
        "canonical": "charts/kubeclaw/files/config/swarm.config.json",
        "sha256": "e7331f631ed85b4c85ca6b4ab5fccd62a1381e40f973e441888d8aa59cb3f678"
      },
      {
        "path": "charts/kubeclaw/templates/deployment.yaml",
        "canonical": "charts/kubeclaw/templates/deployment.yaml",
        "sha256": "8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883"
      },
      {
        "path": "charts/kubeclaw/values.yaml",
        "canonical": "charts/kubeclaw/values.yaml",
        "sha256": "2bff3214d88e912445b1c435b6353cfb438cd5184124b3eb0cc9f7394dfc05aa"
      },
      {
        "path": "charts/prism/templates/services.yaml",
        "canonical": "charts/prism/templates/services.yaml",
        "sha256": "c09a05501eca8a1876e44c1d70898fb5dd6770210e777353d6eff0ee9cd9ae1b"
      },
      {
        "path": "docs/blueprint/AP09-acceptance-fixtures.json",
        "canonical": "docs/blueprint/AP09-acceptance-fixtures.json",
        "sha256": "5671508592d263002a2689007cd554b7e2c179403bc9e0e793a7a6a22adb88a8"
      },
      {
        "path": "docs/site/use/workflows/wait-resume/platform.template.json",
        "canonical": "docs/site/use/workflows/wait-resume/platform.template.json",
        "sha256": "8d9f160964ea4c3ff5c924c3c4c36291f5a6bfa969807721f5a8383578a5b1ef"
      },
      {
        "path": "my-values/setup-secrets.sh",
        "canonical": "my-values/setup-secrets.sh",
        "sha256": "d417ee6bb8f6ba1008ad077f7cb4bf6172891aa9d8753681701aad4697e1834c"
      },
      {
        "path": "package.json",
        "canonical": "package.json",
        "sha256": "4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3"
      },
      {
        "path": "scripts/check-capability-drift-mutations.mjs",
        "canonical": "scripts/check-capability-drift-mutations.mjs",
        "sha256": "11127a406716cf4372a6e066eb2700367d77da14927c7cb42d1bcb723fa6dbe0"
      },
      {
        "path": "scripts/check-capability-policy-drift-mutations.mjs",
        "canonical": "scripts/check-capability-policy-drift-mutations.mjs",
        "sha256": "aab7f432c3f92f5c01397007c49e1527bb901741277fbfc6e2fd0a0c4887b08f"
      },
      {
        "path": "scripts/check-capability-vocabulary-drift-mutations.mjs",
        "canonical": "scripts/check-capability-vocabulary-drift-mutations.mjs",
        "sha256": "160e780708a62f95238dfc435d105aaf60f8e653029f3c895b6fceb8c0b14325"
      },
      {
        "path": "scripts/check-contract-drift-mutations.mjs",
        "canonical": "scripts/check-contract-drift-mutations.mjs",
        "sha256": "cd1bdc5438cb072bd495892f871888460226cfcb5a8e85a27cc48c173ae2e623"
      },
      {
        "path": "scripts/check-error-code-drift-mutations.mjs",
        "canonical": "scripts/check-error-code-drift-mutations.mjs",
        "sha256": "47b1dd5a26085725b1464752e1c8c18753ed2bbff9f230affdf165b4c5c8ffb5"
      },
      {
        "path": "scripts/check-extension-class-drift-mutations.mjs",
        "canonical": "scripts/check-extension-class-drift-mutations.mjs",
        "sha256": "34358ec82373a23a66cc47a489927b18a7612f92c778f7287f81c31795bb32f4"
      },
      {
        "path": "scripts/check-fixture-registration-drift-mutations.mjs",
        "canonical": "scripts/check-fixture-registration-drift-mutations.mjs",
        "sha256": "69873ea3df07137d5ebaa89344de1168ca9786245d642436de3059d3f1b03ece"
      },
      {
        "path": "scripts/check-plugin-manifest-drift-mutations.mjs",
        "canonical": "scripts/check-plugin-manifest-drift-mutations.mjs",
        "sha256": "d0463149d637e0061da26512f73048a949846c964ef6dfc82480325762675653"
      },
      {
        "path": "scripts/check-progress-contract-drift-mutations.mjs",
        "canonical": "scripts/check-progress-contract-drift-mutations.mjs",
        "sha256": "c740b33340853111031e6ebea7adb0a145cdc1b1d1773ba7cc33c2b11467a5aa"
      },
      {
        "path": "scripts/check-provider-registration-drift-mutations.mjs",
        "canonical": "scripts/check-provider-registration-drift-mutations.mjs",
        "sha256": "e923ea164e2686b835c70fc8edd3041c4e49a04f582b305d7859daf0782fb30d"
      },
      {
        "path": "scripts/check-report-registration-drift-mutations.mjs",
        "canonical": "scripts/check-report-registration-drift-mutations.mjs",
        "sha256": "bc064e1f02567b515a69efe6b0c1b0d20b64ed835017e24d3a3739237f021c4e"
      },
      {
        "path": "scripts/check-schema-drift-mutations.mjs",
        "canonical": "scripts/check-schema-drift-mutations.mjs",
        "sha256": "307a040b9875969e5533c2edd46f9ce301cca001d2ddc606f70e546cc9bac73f"
      },
      {
        "path": "scripts/check-sdk-contract-mutation-constructors.mjs",
        "canonical": "scripts/check-sdk-contract-mutation-constructors.mjs",
        "sha256": "24837bf0fe0391ac6cc48b17bcce2ff2bf05da7f962c0cd3be1732321afdf325"
      },
      {
        "path": "scripts/check-workflow-drift-mutations.mjs",
        "canonical": "scripts/check-workflow-drift-mutations.mjs",
        "sha256": "94324dda29e23fe924eb89282a882ed6e46442ec066caf5f728a641d1755fd41"
      },
      {
        "path": "scripts/deploy.sh",
        "canonical": "scripts/deploy.sh",
        "sha256": "97c1e39bf9cec6c1d5d8e11198af90ed04efd15a6077f2bbac1129c2ea0741e2"
      },
      {
        "path": "skills/buster/engine/test-gates/production.ts",
        "canonical": "skills/buster/engine/test-gates/production.ts",
        "sha256": "79c47d55e525f5ebb5e7e05a9c52e18514f9e464401c51e7def38dcec7f646a3"
      },
      {
        "path": "skills/buster/plugins/junit-report-adapter/plugin.json",
        "canonical": "skills/buster/plugins/junit-report-adapter/plugin.json",
        "sha256": "9787400a76dea54fbfe31a6371c1724f60fdacb7fc544fa33c0c454132e92b77"
      },
      {
        "path": "skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts",
        "canonical": "skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts",
        "sha256": "147fae4d867752edcb4cb1bf9966ed62372e77a5e90402a9f8fac9a8ab170fa0"
      },
      {
        "path": "skills/common/plugin-runtime/foundation/registry/types.ts",
        "canonical": "skills/common/plugin-runtime/foundation/registry/types.ts",
        "sha256": "6667bd4389377d33ba41c2c7166f3488c40f0cad1fc0e7c067fb37a6f2eca291"
      },
      {
        "path": "skills/common/plugin-runtime/sdk/src/generated/contracts.ts",
        "canonical": "skills/common/plugin-runtime/sdk/src/generated/contracts.ts",
        "sha256": "8ade81b1f64c78b4cf2198f7ae7dc0c726fb4cec3ffa553986310d353dbc71c1"
      },
      {
        "path": "skills/common/plugin-runtime/sdk/src/index.ts",
        "canonical": "skills/common/plugin-runtime/sdk/src/index.ts",
        "sha256": "464a94399315ad25f40511b8d1ee93c76b3535a82cd90fbde06bf0a58aa0cc9a"
      },
      {
        "path": "skills/nova/core/cli.ts",
        "canonical": "skills/nova/core/cli.ts",
        "sha256": "09121b4b0a160d2e5e35448795156856b15ccc078a229bb1895f570c22f76787"
      },
      {
        "path": "skills/nova/core/test-gates/production.ts",
        "canonical": "skills/nova/core/test-gates/production.ts",
        "sha256": "886c5898b90473ac1f547a40136ed43de2e40bd556bb1acde025fcd95c2a0be1"
      },
      {
        "path": "skills/nova/plugins/lint/plugin.json",
        "canonical": "skills/nova/plugins/lint/plugin.json",
        "sha256": "3d671a34bb259b1c031d7f2ac1c54b19b4821e023bb53c7d43e5642dd1a0ce04"
      },
      {
        "path": "skills/nova/plugins/lint/schemas/config.schema.json",
        "canonical": "skills/nova/plugins/lint/schemas/config.schema.json",
        "sha256": "02ee8a644c0e7ce0bfa58b0fe22582ba12e97f65c3a1e13170304231662a5bf8"
      },
      {
        "path": "skills/nova/plugins/lint/src/engine/policy-paths.ts",
        "canonical": "skills/nova/plugins/lint/src/engine/policy-paths.ts",
        "sha256": "4e7723eb14813fe5d594222d8a9b69809f809abaa379fbb44041793f28aa66e3"
      },
      {
        "path": "skills/nova/project/compiler.ts",
        "canonical": "skills/nova/project/compiler.ts",
        "sha256": "9d8ccdb3a1ccc56c58c1ec510aed54473f7db6d4135d28b2e265bbf90d7f1ef5"
      },
      {
        "path": "skills/nova/project_setup/tools/progress-scaffold-validation.ts",
        "canonical": "skills/nova/project_setup/tools/progress-scaffold-validation.ts",
        "sha256": "dafa016f41e824b82951a8532b0c291cda421181de1614d79f0cffd91ee436fe"
      },
      {
        "path": "skills/prism/server/control-server.ts",
        "canonical": "skills/prism/server/control-server.ts",
        "sha256": "c165fb6b20bc6b608ae2bc859f52fc5700856e6cea3798916df921dcac5ce8ac"
      },
      {
        "path": "tests/verification/e2e/fixture-coverage.mjs",
        "canonical": "tests/verification/e2e/fixture-coverage.mjs",
        "sha256": "eae30bf79e5ed942658322be75dc75a98b74ceacae57cd9072f5a7b81e118aa6"
      },
      {
        "path": "tests/verification/e2e/provider-catalog.mjs",
        "canonical": "tests/verification/e2e/provider-catalog.mjs",
        "sha256": "04fe590099a3a9803cc610389528190d330b75527305b50c409d0e9de647293e"
      },
      {
        "path": "tools/ops-mcp/src/server.mjs",
        "canonical": "tools/ops-mcp/src/server.mjs",
        "sha256": "a4fef1a5e66a45ea2885cc9a1715aba5835d77cb5219e39ac35a5f50b5bab65d"
      }
    ],
    "allowedSelectedAncestors": [
      "scripts/docs-ap09-mutation-fixture.mjs",
      "scripts/check-capability-drift-mutations.mjs",
      "scripts/check-capability-policy-drift-mutations.mjs",
      "scripts/check-capability-vocabulary-drift-mutations.mjs",
      "scripts/check-contract-drift-mutations.mjs",
      "scripts/check-error-code-drift-mutations.mjs",
      "scripts/check-extension-class-drift-mutations.mjs",
      "scripts/check-fixture-registration-drift-mutations.mjs",
      "scripts/check-plugin-manifest-drift-mutations.mjs",
      "scripts/check-progress-contract-drift-mutations.mjs",
      "scripts/check-provider-registration-drift-mutations.mjs",
      "scripts/check-report-registration-drift-mutations.mjs",
      "scripts/check-schema-drift-mutations.mjs",
      "scripts/check-sdk-contract-mutation-constructors.mjs",
      "scripts/check-workflow-drift-mutations.mjs"
    ],
    "allowedNativePackageEntries": []
  },
  "scripts/plugin-system-inventory.mjs": {
    "kind": "canonical-plugin-documentation-inventory/v1",
    "sourceSha256": "e5bd5dc0d681be0762c51e42ee5654b973c8f260fe7ff5919c7494ac3f42fb2c",
    "consumer": "Inert manifest/file discovery writes fixed documentation JSON/Markdown inventories; existing non-doc-prefixed command names do not grant plugin activation.",
    "purposeInputs": [
      {
        "path": ".github/workflows/docs-checks.yaml",
        "canonical": ".github/workflows/docs-checks.yaml",
        "sha256": "96e54e68a99450a6b4cdd1568cd4309cf290ee54f8b368efa76b032f2c7b48b4"
      },
      {
        "path": "package.json",
        "canonical": "package.json",
        "sha256": "4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3"
      }
    ],
    "allowedSelectedAncestors": [
      "scripts/plugin-system-inventory.mjs"
    ],
    "allowedNativePackageEntries": [
      {
        "name": "plugin-system:inventory",
        "command": "node scripts/plugin-system-inventory.mjs",
        "source": "scripts/plugin-system-inventory.mjs"
      },
      {
        "name": "plugin-system:inventory:check",
        "command": "node scripts/plugin-system-inventory.mjs --check",
        "source": "scripts/plugin-system-inventory.mjs"
      }
    ]
  },
  "scripts/vendor-external-helm-authorities.mjs": {
    "kind": "manual-vendored-chart-evidence-owner/v1",
    "sourceSha256": "077c8136790d759262609f716ab6c77b0049d19bb7e2208c27a7c3733d6a96f8",
    "consumer": "Locked archive extraction generates documentation field/schema/template-context evidence; copied chart inputs and Source evidence never grant deployed-chart authority or API apply.",
    "purposeInputs": [
      {
        "path": "docs/generated/inventory/configuration-values.json",
        "canonical": "docs/generated/inventory/configuration-values.json",
        "sha256": "86576d0f96d9787028c87e6d2b489f956b34d00284ef6ad34cdcbdc01fcf9467"
      },
      {
        "path": "docs/site/extend/documentation-maintenance.md",
        "canonical": "docs/site/extend/documentation-maintenance.md",
        "sha256": "a8727c33bb81242fb446e89a66101b9f5182f2c5a54ae26ff3cfc7499a120b14"
      },
      {
        "path": "package.json",
        "canonical": "package.json",
        "sha256": "4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3"
      },
      {
        "path": "scripts/docs-external-helm-authority-lock.json",
        "canonical": "scripts/docs-external-helm-authority-lock.json",
        "sha256": "257d829a2e4d79ed9bc886c33c8c5e8b8a64a9fc05a36e7f378173b54c76516a"
      },
      {
        "path": "scripts/external-helm-archives.json",
        "canonical": "scripts/external-helm-archives.json",
        "sha256": "4b79ed0dc21517f54ae1a167a79930524c01e85418bd75e8694478ce7f365070"
      },
      {
        "path": "scripts/external-helm-archives.sha256",
        "canonical": "scripts/external-helm-archives.sha256",
        "sha256": "55bf67770822d32ea8ab515be87dad57f7079d95dddb23a7aa5c2252965f75a3"
      },
      {
        "path": "scripts/tests/vendor-external-helm-authorities.test.mjs",
        "canonical": "scripts/tests/vendor-external-helm-authorities.test.mjs",
        "sha256": "9fbf8dabefbeba2ee504204e5d1a7b9451505ffe685bff7b486218043d24640c"
      },
      {
        "path": "scripts/yaml-field-path.mjs",
        "canonical": "scripts/yaml-field-path.mjs",
        "sha256": "646f14105e48d9401b8d8ac99a0c439f60c8b69e42d72c15c0b66e132a1c9a2d"
      }
    ],
    "allowedSelectedAncestors": [
      "scripts/vendor-external-helm-authorities.mjs"
    ],
    "allowedNativePackageEntries": []
  }
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function assertDocumentationOwnerPurpose(root,source){
 if(readerArtifactCiRoleSources.has(source))assertReaderArtifactExternalCiPurpose(root); // before direct role-cache entry too
 const profile=reviewedDocumentationOwnerPurposes[source];if(!profile)return null;
 root=path.resolve(root);
 const acquire=(selected,expected)=>{const file=path.join(root,selected);assert(fs.existsSync(file)&&fs.realpathSync(file)===file&&fs.statSync(file).isFile()&&sha(fs.readFileSync(file))===expected,`DOCUMENTATION_OWNER_PURPOSE_INPUT_DRIFT: ${source}; ${selected}`);};
 acquire(source,profile.sourceSha256);
 for(const input of profile.purposeInputs)acquire(input.path,input.sha256);
 return profile;
}
// Call with actual original graph/entry observations, never inferred entries.
// Synthetic unit contexts exercise only this guard, not the real graph owner.
export function assertDocumentationOwnerAncestry(root,source,ancestors,docsReachable,allNativeEntries){
 const profile=assertDocumentationOwnerPurpose(root,source);assert(profile&&ancestors instanceof Set&&ancestors.has(source),`DOCUMENTATION_OWNER_PURPOSE_UNQUALIFIED: ${source}`);
 for(const consumer of ancestors)assert(profile.allowedSelectedAncestors.includes(consumer)&&(consumer===source||docsReachable.has(consumer)),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; ${consumer}`);
 const actual=allNativeEntries.filter(entry=>ancestors.has(entry.source)&&!entry.name.startsWith('docs:')&&!entry.name.startsWith('verify:docs:'));
 assert.deepEqual(actual,profile.allowedNativePackageEntries,`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; native package invocation changed`);
 return profile;
}
export function documentationOwnerNativeEntryMatches(source,entry){
 return reviewedDocumentationOwnerPurposes[source]?.allowedNativePackageEntries.some(value=>JSON.stringify(value)===JSON.stringify(entry))??false;
}

// Exact external CI caller seeds, separate from root-package/native entries.
// Full physical caller/consumer proof is acquired before graph and role caches.
const readerArtifactCiPurpose=freeze({
  "kind": "exact-external-ci-reader-artifact-verifier/v1",
  "source": "scripts/docs-reader/check-artifact.mjs",
  "meaning": "Analysis-only purpose reachability from the actual external CI/documented normal checker caller. No package/native entry, role receipt, API or execution authority.",
  "inputs": [
    {
      "path": "scripts/docs-reader/check-search.mjs",
      "canonical": "scripts/docs-reader/check-search.mjs",
      "sha256": "6eb9c612a24e87e3697094de6e0853b865644e0ed95bf12877c6ab214b644452"
    },
    {
      "path": "scripts/docs-reader/search-questions.json",
      "canonical": "scripts/docs-reader/search-questions.json",
      "sha256": "10657354f2e2cef6dbd7e748a01874b008541944755894914e4ce781df1b0fd5"
    },
    {
      "path": "scripts/docs-reader/check-artifact.mjs",
      "canonical": "scripts/docs-reader/check-artifact.mjs",
      "sha256": "7f4e8cb928a5fba48bbd590e5349ce6247264f9cae1935a1e3679ae54c1a2a67"
    },
    {
      "path": "scripts/docs-reader/page-records.mjs",
      "canonical": "scripts/docs-reader/page-records.mjs",
      "sha256": "6268501ef047b13e0794950a85d57e2c7aaf54e85a16d77ca8c1263237691a2f"
    },
    {
      "path": "scripts/docs-publication.mjs",
      "canonical": "scripts/docs-publication.mjs",
      "sha256": "fdae9667aa99505d4fcc90681f081fb45717ab9f9d4333a30544abdea33525a4"
    },
    {
      "path": "scripts/docs-reader/renderer.mjs",
      "canonical": "scripts/docs-reader/renderer.mjs",
      "sha256": "a0bf02d079637cf862fe0a40bbc34e4bfbd982c58126e347d8aea079047abd87"
    },
    {
      "path": "scripts/docs-reader/redirects.mjs",
      "canonical": "scripts/docs-reader/redirects.mjs",
      "sha256": "0b186c9da87055e1a13afb0aace0b72e04099c3ed49879a422ca3acbbe778caf"
    },
    {
      "path": ".github/workflows/docs-checks.yaml",
      "canonical": ".github/workflows/docs-checks.yaml",
      "sha256": "96e54e68a99450a6b4cdd1568cd4309cf290ee54f8b368efa76b032f2c7b48b4"
    },
    {
      "path": "scripts/tests/docs-reader-page-records.test.mjs",
      "canonical": "scripts/tests/docs-reader-page-records.test.mjs",
      "sha256": "0333fffb872837af59396ff47dafb1401a87b00627d96de524e9322e12f15d83"
    },
    {
      "path": "scripts/tests/docs-reader.test.mjs",
      "canonical": "scripts/tests/docs-reader.test.mjs",
      "sha256": "abd6a6431110a7b8a1486bbbce4648a118d31fe6f517813c4d9d6ed2e6177e28"
    },
    {
      "path": "scripts/tests/docs-reader-redirects.test.mjs",
      "canonical": "scripts/tests/docs-reader-redirects.test.mjs",
      "sha256": "4d08e2533bda82a536a9c61ab27a3fca94939a484a5a2154e012ff9507f26155"
    },
    {
      "path": "docs/site/reference/documentation-site.md",
      "canonical": "docs/site/reference/documentation-site.md",
      "sha256": "c0c4b55949be05d571aa4ea5b353c5ab479caeafd3ebbcdeb70ebec0ca10a1e0"
    },
    {
      "path": "package.json",
      "canonical": "package.json",
      "sha256": "4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3"
    },
    {
      "path": "scripts/lib/docs-publication-assets.mjs",
      "canonical": "scripts/lib/docs-publication-assets.mjs",
      "sha256": "239950ea0ebc87501d03aa178d07b99922cb4ec7dabdded3fbf8f8ab5c5de6f0"
    },
    {
      "path": "scripts/lib/docs-route-continuity.mjs",
      "canonical": "scripts/lib/docs-route-continuity.mjs",
      "sha256": "95ebc24186da8c7b446a5bd3edb36f8514b79cb4104dc0394f0b381ddb5dd449"
    },
    {
      "path": "scripts/docs-reader/metadata.mjs",
      "canonical": "scripts/docs-reader/metadata.mjs",
      "sha256": "51e0b027356401a68c52a3b8b1fe4d6c6ed35070dfcb300067dd1b9af8da0abc"
    }
  ],
  "ciRunLine": "run: npm run docs:publication:check && node --test scripts/tests/docs-reader.test.mjs scripts/tests/docs-reader-page-records.test.mjs scripts/tests/docs-reader-redirects.test.mjs scripts/tests/docs-reader-source-links.test.mjs scripts/tests/docs-reader-source-previews.test.mjs scripts/tests/docs-reader-diagrams.test.mjs && node scripts/tests/docs-reader-redirects.browser.mjs && npm run docs:publication:build && node --max-old-space-size=4096 scripts/docs-reader/check-artifact.mjs && node scripts/docs-reader/check-search.mjs && node --max-old-space-size=4096 scripts/docs-reader/check-source-links.mjs && node --max-old-space-size=4096 scripts/docs-reader/check-source-previews.mjs && node --max-old-space-size=4096 scripts/docs-reader/check-diagrams.mjs",
  "manualCommand": "node scripts/docs-reader/check-artifact.mjs /path/to/reader-artifact /path/to/source-checkout"
});
const readerArtifactCiProofs=new WeakMap();
const readerArtifactCiEntrySources=['scripts/docs-reader/check-artifact.mjs','scripts/docs-reader/check-search.mjs'];
const readerArtifactCiRoleSources=new Set([...readerArtifactCiEntrySources,'scripts/docs-reader/page-records.mjs','scripts/docs-publication.mjs','scripts/docs-reader/renderer.mjs','scripts/docs-reader/redirects.mjs']);
export function assertReaderArtifactExternalCiPurpose(root){
 root=path.resolve(root);
 const profile=readerArtifactCiPurpose,source=path.join(root,profile.source),ci=path.join(root,'.github/workflows/docs-checks.yaml');
 // A copied external caller alone is not selected-verifier/project authority.
 // Detect an actual verifier directory entry (including a dangling symlink), or
 // the finite reviewed artifact-project context when its verifier is missing.
 // Context only triggers the complete physical proof below; it never grants one.
 const present=relative=>{try{fs.lstatSync(path.join(root,relative));return true;}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return false;throw error;}};
 const context=['scripts/docs-reader/page-records.mjs','scripts/docs-publication.mjs','scripts/docs-reader/renderer.mjs'];
 const packageInput=profile.inputs.find(input=>input.path==='package.json');
 const packageFile=path.join(root,packageInput.path);
 const reviewedPackage=present(packageInput.path)&&fs.statSync(packageFile).isFile()&&sha(fs.readFileSync(packageFile))===packageInput.sha256;
 const artifactProject=context.every(present)||(reviewedPackage&&context.some(present));
 // No proof/seed for unrelated scoped roots; ordinary selected-graph guards remain.
 if(!present(profile.source)&&!artifactProject)return null;
 assert.equal(fs.realpathSync(root),root,'DOCUMENTATION_READER_CI_PURPOSE_DRIFT: nonphysical root');
 for(const input of profile.inputs){
  const file=path.join(root,input.path);
  assert(fs.existsSync(file)&&fs.realpathSync(file)===file&&fs.statSync(file).isFile()&&sha(fs.readFileSync(file))===input.sha256,
   `DOCUMENTATION_READER_CI_PURPOSE_DRIFT: ${input.path}`);
 }
 const runLines=fs.readFileSync(ci,'utf8').split('\n').filter(line=>/^\s*run:/u.test(line)&&line.includes(profile.source)).map(line=>line.trim());
 assert.deepEqual(runLines,[profile.ciRunLine],'DOCUMENTATION_READER_CI_PURPOSE_DRIFT: exact normal CI argv');
 assert(fs.readFileSync(path.join(root,'docs/site/reference/documentation-site.md'),'utf8').includes(profile.manualCommand),
  'DOCUMENTATION_READER_CI_PURPOSE_DRIFT: documented normal checker argv');
 const definition=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert(!Object.values(definition.scripts??{}).some(command=>typeof command==='string'&&command.includes(profile.source)),
  'DOCUMENTATION_READER_CI_PURPOSE_DRIFT: verifier is not a root package entry');
 const proof=Object.freeze({kind:profile.kind,source:profile.source,authority:'external-ci-analysis-only'});
 readerArtifactCiProofs.set(proof,root);return proof;
}
export function addReaderArtifactExternalCiSeed(proof,graph,docsReachable){
 if(proof===null)return false;
 assert(readerArtifactCiProofs.has(proof),'DOCUMENTATION_READER_CI_PURPOSE_UNQUALIFIED: unacquired proof');
 const root=readerArtifactCiProofs.get(proof);
 assert(assertReaderArtifactExternalCiPurpose(root)!==null,'DOCUMENTATION_READER_CI_PURPOSE_DRIFT: acquired verifier context removed'); // stale handles cannot become unrelated-root authority
 assert(Array.isArray(graph?.executableSources)&&Array.isArray(graph.edges)&&docsReachable instanceof Set,'DOCUMENTATION_READER_CI_PURPOSE_UNQUALIFIED: selected graph context');
 const selected=readerArtifactCiEntrySources.filter(source=>graph.executableSources.includes(source));
 // Validate every selected external entry before granting any reachability.
 for(const source of selected)assert(!graph.edges.some(edge=>edge.target===source),
  'DOCUMENTATION_READER_CI_PURPOSE_UNQUALIFIED: new selected verifier importer');
 for(const source of selected)docsReachable.add(source);
 return selected.length>0;
}
