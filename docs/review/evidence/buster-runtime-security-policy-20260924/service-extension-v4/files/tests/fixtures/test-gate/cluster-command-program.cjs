/* global fixture */
/* Copied into each private executable by cluster-command-api.mjs. fixture is
 * explicit serialized local state; no process environment determines policy. */
const fs = require('node:fs');
const args = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
fs.appendFileSync(fixture.log, JSON.stringify({ pid: process.pid, args, input }) + '\n');
let lease = JSON.parse(fs.readFileSync(fixture.state, 'utf8'));
let output;
if (args[0] === 'auth') output = 'yes';
else if (args[0] === 'apply') {
  if (input.includes('"kind":"BusterNamespaceLease"') && !args.includes('--dry-run=server')) {
    const requested = JSON.parse(input);
    lease = { ...requested, metadata: { ...requested.metadata, resourceVersion: '1', generation: 1, annotations: {} },
      status: { phase: 'Ready', namespaceName: requested.spec.namespaceName,
        createdAt: '2026-09-21T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' } };
  }
  output = '{}';
} else if (args[0] === 'patch') {
  const patch = JSON.parse(args[args.indexOf('-p') + 1]);
  Object.assign(lease.metadata.annotations, patch.metadata.annotations);
  Object.assign(lease.spec, patch.spec);
  lease.metadata.generation++;
  Object.assign(lease.status, { exposureOwner: lease.metadata.annotations['kubeclaw.forgestack.ai/exposure-owner'],
    exposureGeneration: lease.metadata.generation, exposurePhase: lease.spec.exposure.provider === 'off' ? 'Off' : 'Ready',
    previewUrl: `https://${fixture.hostname}/`, exposureHostname: fixture.hostname });
  output = '{}';
} else if (args[0] === 'delete') output = '{}';
else if (args[0] === 'get' && args[1].startsWith('busternamespaceleases.')) {
  if (!lease.status.runtimeSecurity) throw new Error('RUNTIME_SECURITY_OBSERVATION_NOT_SEEDED');
  lease.status.runtimeSecurity.observedAt = new Date().toISOString();
  output = JSON.stringify(lease);
}
else if (args[0] === 'get' && args[1] === 'busternamespacelease') output = JSON.stringify(lease);
else if (args[0] === 'get' && args[1] === 'pods') output = JSON.stringify({ items: [{ metadata: { name: 'app' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }] });
else if (args[0] === 'get' && args[1] === 'service') output = JSON.stringify({ spec: { ports: [{ port: 8080, targetPort: 8080 }] } });
else if (args[0] === 'get' && args[1] === 'endpoints') output = JSON.stringify({ subsets: [{ ports: [{ port: 8080 }], addresses: [{ ip: '127.0.0.1' }] }] });
else throw new Error(`UNEXPECTED_CLUSTER_COMMAND:${args.join(' ')}`);
fs.writeFileSync(fixture.state, JSON.stringify(lease));
process.stdout.write(output);
