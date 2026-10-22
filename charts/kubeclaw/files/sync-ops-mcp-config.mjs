import fs from 'node:fs';

// Reconcile only our managed connector, including persisted installations and
// disabling it. Other connectors, agent policy and workspace notes stay owned
// by their existing sources. No bearer value is ever written into config.
const [configPath, desiredPath] = process.argv.slice(2);
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const desired = JSON.parse(fs.readFileSync(desiredPath, 'utf8'));
  const connector = desired.mcp?.servers?.ops;
  if (connector) {
    config.mcp ??= {};
    config.mcp.servers ??= {};
    config.mcp.servers.ops = connector;
  } else if (config.mcp?.servers) {
    delete config.mcp.servers.ops;
  }
  const temporaryPath = `${configPath}.ops-mcp.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
}
