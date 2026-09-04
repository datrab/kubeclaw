import path from 'node:path';
import { findingId, integer, object, policy, result } from './common.js';

function configuration(invocation, context) {
  const value = object(invocation.configuration.values, 'DEPENDENCY_SCAN_CONFIG_INVALID');
  if (typeof value.projectDirectory !== 'string' || value.projectDirectory.length < 1 || value.projectDirectory.length > 4096
    || path.isAbsolute(value.projectDirectory)) throw new Error('DEPENDENCY_SCAN_PATH_INVALID');
  const repository = path.resolve(context.workspaceRoot, invocation.workspace.repository);
  const projectDirectory = path.resolve(repository, value.projectDirectory);
  if (projectDirectory !== repository && !projectDirectory.startsWith(`${repository}${path.sep}`)) throw new Error('DEPENDENCY_SCAN_PATH_INVALID');
  return { projectDirectory, timeoutMs: integer(value.timeoutMs, 300_000, 1000, 900_000, 'DEPENDENCY_SCAN_TIMEOUT_INVALID'),
    policy: policy(value.policy) };
}

function findings(value) {
  if (!Array.isArray(value)) throw new Error('DEPENDENCY_SCAN_RESPONSE_INVALID');
  return value.map((raw) => {
    const item = object(raw, 'DEPENDENCY_SCAN_RESPONSE_INVALID');
    const id = findingId('dependency', item.id, item.package, item.sourceFile);
    return { id, severity: item.severity, message: `${String(item.package)} ${String(item.installedVersion)} has ${String(item.id)}.`,
      rule: String(item.id), file: typeof item.sourceFile === 'string' ? item.sourceFile : undefined,
      category: 'vulnerability', package: item.package, installedVersion: item.installedVersion,
      fixedVersion: item.fixedVersion, reachability: item.reachability, status: item.status };
  });
}

export function provider() {
  return { async execute(invocation, context) {
    const config = configuration(invocation, context);
    const response = object(await context.invoke('security.scan', { operation: 'dependency',
      resource: { type: 'repository.directory', canonicalId: config.projectDirectory },
      payload: { projectDirectory: config.projectDirectory, timeoutMs: config.timeoutMs } }), 'DEPENDENCY_SCAN_RESPONSE_INVALID');
    if (response.scanner !== 'trivy' || response.operation !== 'dependency') throw new Error('DEPENDENCY_SCAN_RESPONSE_INVALID');
    return result(invocation, 'dependency-trivy', findings(response.findings), config.policy,
      { resultDigest: response.resultDigest, projectDirectory: invocation.configuration.values.projectDirectory });
  } };
}

export const testContract = Object.freeze({ configuration, findings });
