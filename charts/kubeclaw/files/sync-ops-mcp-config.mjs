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
  // Persisted gateways must receive the dedicated operator-managed diagnosis
  // policy too; reconcile this entry only, never unrelated agent permissions.
  const diagnosis = desired.agents?.entries?.['buster-diagnosis'];
  if (diagnosis) {
    config.agents ??= {};
    config.agents.ownership = 'explicit';
    config.agents.entries ??= {};
    config.agents.entries['buster-diagnosis'] = diagnosis;
    // This operator-managed main policy preserves the coding core exclusions,
    // while avoiding a core-only inherited allowlist at HTTP sessions_spawn.
    const mainTools = desired.agents?.entries?.main?.tools;
    if (mainTools) {
      config.agents.entries.main ??= {};
      const currentTools = config.agents.entries.main.tools ?? {};
      config.agents.entries.main.tools = { ...currentTools, profile: mainTools.profile,
        deny: [...new Set([...(currentTools.deny ?? []), ...(mainTools.deny ?? [])])] };
    }
  }
  const temporaryPath = `${configPath}.ops-mcp.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, configPath);
}
