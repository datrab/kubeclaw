import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { configuredTargetFilesForScope } from './discovery.ts';

function finding(file: string, code: string, message: string) {
  return { file, line: null, column: null, severity: 'error', code, message };
}
function pathItem(spec: any, value: any): any | null {
  let current = value;
  const seen = new Set<string>();
  for (let depth = 0; depth < 32; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    if (current.$ref === undefined) return current;
    if (typeof current.$ref !== 'string' || !current.$ref.startsWith('#/') || seen.has(current.$ref)) return null;
    seen.add(current.$ref);
    let resolved: any = spec;
    for (const part of current.$ref.slice(2).split('/').map((item: string) => item.replace(/~1/gu, '/').replace(/~0/gu, '~'))) {
      if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)
        || !Object.prototype.hasOwnProperty.call(resolved, part)) return null;
      resolved = resolved[part];
    }
    current = resolved;
  }
  return null;
}
function operationFindings(file: string, route: string, resolved: any, seen: Set<string>) {
  const findings: any[] = [];
  for (const method of ['delete', 'get', 'head', 'options', 'patch', 'post', 'put']) {
    const operation = resolved[method];
    if (!operation) continue;
    if (typeof operation !== 'object' || Array.isArray(operation)) {
      findings.push(finding(file, 'openapi-operation', `Operation ${method.toUpperCase()} ${route} must be an object.`));
      continue;
    }
    if (typeof operation.operationId !== 'string' || seen.has(operation.operationId)) {
      findings.push(finding(file, 'openapi-operation-id', 'Every operation must have a unique operationId.'));
    } else seen.add(operation.operationId);
    if (!operation.responses || typeof operation.responses !== 'object') {
      findings.push(finding(file, 'openapi-responses', `Operation ${String(operation.operationId)} must declare responses.`));
    }
  }
  return findings;
}
function specFindings(file: string, spec: any) {
  const findings: any[] = [];
  if (typeof spec?.openapi !== 'string' || !spec.openapi.startsWith('3.')) findings.push(finding(file, 'openapi-version', 'The contract must declare OpenAPI 3.'));
  if (!spec?.paths || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) findings.push(finding(file, 'openapi-paths', 'The contract must declare a paths object.'));
  const seen = new Set<string>();
  for (const [route, raw] of Object.entries(spec?.paths ?? {})) {
    const resolved = pathItem(spec, raw);
    if (!resolved) findings.push(finding(file, 'openapi-path-item', `Path ${route} must be an object or a valid local reference.`));
    else findings.push(...operationFindings(file, route, resolved, seen));
  }
  return findings;
}
function fileFindings(file: string) {
  const document = parseDocument(fs.readFileSync(file, 'utf8'), { uniqueKeys: true });
  if (document.errors.length) return document.errors.map((error) => finding(file, 'openapi-syntax', error.message));
  let spec: any;
  try { spec = document.toJS({ maxAliasCount: 0 }); }
  catch (error) {
    return [finding(file, 'openapi-syntax', error instanceof Error ? error.message : 'The contract contains unsupported YAML aliases.')];
  }
  return specFindings(file, spec);
}
export function openapiContractTool() {
  const filePattern = (file: string) => /(?:^|\/)openapi\.(?:json|ya?ml)$/iu.test(file.split(path.sep).join('/'));
  return {
    id: 'openapi-contract', name: 'OpenAPI contract validation', binary: 'node', tier: 'full',
    detect: () => true,
    run: (ctx: any) => {
      const findings = configuredTargetFilesForScope(ctx, filePattern).flatMap(fileFindings);
      return { errors: findings.length, warnings: 0, findings };
    },
  };
}
