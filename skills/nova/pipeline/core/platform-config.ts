// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';

declare const process: {
  env: Record<string, string | undefined>;
};

export const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';

export function discoverPlatformSwarmConfigCandidates() {
  return [...new Set([
    DEFAULT_SWARM_CONFIG_PATH,
    process.env.SWARM_CONFIG,
  ].filter(Boolean).map(candidate => path.resolve(candidate)))];
}

export function discoverSwarmConfigPath(candidates = discoverPlatformSwarmConfigCandidates()) {
  const normalizedCandidates = [...new Set(candidates.filter(Boolean).map(candidate => path.resolve(candidate)))];
  for (const candidate of normalizedCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return normalizedCandidates[0];
}

export function loadPlatformSwarmConfig(configPath = discoverSwarmConfigPath()) {
  const resolvedPath = path.resolve(configPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Swarm config missing: ${resolvedPath}\n` +
      `  Expected ${DEFAULT_SWARM_CONFIG_PATH}; SWARM_CONFIG is checked only as a secondary candidate`
    );
  }
  try {
    return {
      path: resolvedPath,
      config: JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
    };
  } catch (error) {
    throw new Error(
      `Swarm config invalid: ${resolvedPath}\n` +
      `  ${(error as Error).message}`
    );
  }
}
