import fs from 'node:fs';
import path from 'node:path';
// A concrete isolated producer, not a bound on other providers' runtime DATA.
export function provider() {
  return { async execute(invocation, context) {
    const format = invocation.configuration.values.format;
    const bytes = fs.readFileSync(new URL(`./${format}.bin`, import.meta.url));
    fs.writeFileSync(path.join(context.workspaceRoot, invocation.workspace.evidence, 'api.bin'), bytes);
    return {
      schemaVersion: 'provider-result.v1', outcome: 'passed', summary: 'synthetic API evidence',
      counts: {total: 1, passed: 1, failed: 0, skipped: 0}, findings: [], metrics: [],
      evidenceFiles: [{evidenceId: 'api-data', type: 'log', file: 'api.bin', mediaType: 'application/octet-stream'}],
      reports: [], outputs: [], exitCode: 0, signal: null, providerDetails: null,
    };
  } };
}
