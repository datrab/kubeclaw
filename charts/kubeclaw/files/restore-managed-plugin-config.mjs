import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve(process.argv[2] ?? '');
const desiredPath = path.resolve(process.argv[3] ?? '');
if (path.basename(configPath) !== 'openclaw.json' || path.basename(desiredPath) !== 'openclaw.json') {
  throw new Error('Managed plugin config restore requires openclaw.json source and target paths');
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const desired = JSON.parse(fs.readFileSync(desiredPath, 'utf8'));
config.plugins ??= {};
if (Array.isArray(desired?.plugins?.allow)) {
  config.plugins.allow = structuredClone(desired.plugins.allow);
}
if (desired?.plugins?.entries && typeof desired.plugins.entries === 'object') {
  config.plugins.entries = structuredClone(desired.plugins.entries);
}
if (desired?.channels?.discord && typeof desired.channels.discord === 'object') {
  config.channels ??= {};
  config.channels.discord = structuredClone(desired.channels.discord);
}

const temporaryPath = `${configPath}.kubeclaw-managed-plugins.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, configPath);
console.log('Restored authoritative managed plugin and Discord configuration');
