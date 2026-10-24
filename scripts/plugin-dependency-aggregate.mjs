import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { acquireSchemaClosure } from './plugin-schema-closure.mjs';

// Pure acquisition boundary: caller must first check fresh discovery and ownership.
export function acquireDependencyAggregate({ root, report, sourceOwner, bindings = {} }) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const roles = ['configSchema', 'inputSchema', 'resultSchema', 'checkpointSchema'];
  return {
    schemaVersion: 'plugin-dependency-aggregate.v1',
    qualification: 'Native declarations and bounded source observations only; not runtime grants, schema validation, operational ownership, credential classification or DATA acceptance.',
    discovery: { predecessor: 'scripts/ap08-extension-inventory.mjs --check' },
    ownership: { predecessor: 'scripts/check-runtime-package-ownership.mjs',
      sourceSha256: digest('scripts/check-runtime-package-ownership.mjs'),
      inventorySha256: digest('packaging/runtime/package-ownership.json') },
    bindings,
    packages: report.packages.map(plugin => {
      const manifest = read(plugin.manifest);
      const attribution = { author: manifest.author ?? null, developer: manifest.developer ?? null };
      return { ...plugin, nativeManifest: manifest, manifestSha256: digest(plugin.manifest),
        sourceClassification: sourceOwner(plugin.root) ?? null,
        nativeAttribution: attribution, operationalOwner: null,
        hostSchema: plugin.hostConfigSchema === null || plugin.hostConfigSchema === undefined ? null
          : acquireSchemaClosure({ root, source: plugin.hostConfigSchema.source,
            schema: plugin.hostConfigSchema.schema, bindings }),
        registrations: plugin.registrations.map(registration => ({ ...registration,
          schemaSources: Object.fromEntries(roles.map(role => [role,
            registration[role] === null || registration[role] === undefined ? null
              : acquireSchemaClosure({ root, source: path.posix.join(plugin.root, registration[role]), bindings })])),
        })),
      };
    }),
  };
}

export function aggregateBytes(aggregate) {
  return `${JSON.stringify(aggregate, null, 2)}\n`;
}
export function checkAggregate(target, bytes) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bytes) {
    throw new Error(`Missing or stale dependency aggregate: ${target}`);
  }
}
