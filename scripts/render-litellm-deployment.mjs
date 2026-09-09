import crypto from 'node:crypto';
import fs from 'node:fs';
import { dump, loadAll } from 'js-yaml';

// Render the mounted bytes and their rollout annotation from one input snapshot.
const [configFile, deploymentFile] = process.argv.slice(2);
if (!configFile || !deploymentFile || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/render-litellm-deployment.mjs <config.yaml> <deployment.yaml>');
}
const config = fs.readFileSync(configFile, 'utf8');
const documents = loadAll(fs.readFileSync(deploymentFile, 'utf8')).filter(Boolean);
const deployments = documents.filter(value => value.kind === 'Deployment' && value.metadata?.name === 'litellm');
if (deployments.length !== 1) throw new Error('LITELLM_DEPLOYMENT_REQUIRED');
const deployment = deployments[0];
const volume = deployment.spec.template.spec.volumes.find(value => value.name === 'config');
if (volume?.configMap?.name !== 'litellm-config') throw new Error('LITELLM_CONFIG_MOUNT_INVALID');
deployment.spec.template.metadata.annotations = {
  ...deployment.spec.template.metadata.annotations,
  'checksum/litellm-config': crypto.createHash('sha256').update(config).digest('hex'),
};
const configMap = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'litellm-config' }, data: { 'config.yaml': config } };
process.stdout.write([configMap, ...documents].map(value => dump(value, { lineWidth: -1, noRefs: true })).join('---\n'));
