import { arrayValue, firstDefinedValue, textValue } from '../../value-boundary.ts';

type AnyRecord = Record<string, any>;
const MISSING_SUITE = 'missing_suite_name';
function nonEmptyText(value: unknown, absent: string): string {
  return typeof value === 'string' && value ? value : absent;
}

function resultDetail(result: AnyRecord): string | null {
  if (typeof result.findings?.[0]?.message === 'string') return result.findings[0].message;
  if (typeof result.error === 'string') return result.error;
  if (typeof result.reason === 'string') return result.reason;
  return null;
}

function resultLine(result: AnyRecord): string {
  const suite = nonEmptyText(result.suite, MISSING_SUITE);
  const status = nonEmptyText(result.status, 'UNKNOWN');
  const detail = resultDetail(result);
  return detail ? `- ${suite}: ${status} - ${detail}` : `- ${suite}: ${status}`;
}

function buildAuthorityLines(build: AnyRecord | undefined): string[] {
  const lines: string[] = [];
  if (build?.status === 'PASS' && typeof build.metadata?.tool === 'string') {
    lines.push(`Build authority: ${build.metadata.tool} already produced the runnable artifact for this attempt.`);
  }
  const image = firstDefinedValue(build?.metadata?.image, build?.metadata?.image_ref);
  if (typeof image === 'string') lines.push(`Runtime image: \`${image}\``);
  return lines;
}

function runtimeLocationLines(build: AnyRecord | undefined, health: AnyRecord | undefined): string[] {
  const lines: string[] = [];
  if (typeof health?.metadata?.url === 'string') lines.push(`Running app URL: \`${health.metadata.url}\``);
  else if (health?.status === 'PASS' && build?.metadata?.port != null) lines.push(`Running app port: \`${build.metadata.port}\``);
  return lines;
}

function runtimeAuthorityLines(results: AnyRecord[]): string[] {
  const build = results.find(result => result.suite === 'build');
  const health = results.find(result => result.suite === 'health');
  const warning = [build?.status, health?.status].includes('PASS')
    ? ['Do not run another image build, deployment, `npm start`, or local server unless you are investigating a new failure the pre-test runner did not already cover.']
    : [];
  return [...warning, ...buildAuthorityLines(build), ...runtimeLocationLines(build, health)];
}

export function appendPreTestResultsToPrompt(prompt: unknown, suitesInfo: AnyRecord = {}): string {
  const results = arrayValue(suitesInfo.results) as AnyRecord[];
  if (results.length === 0) return textValue(prompt);
  const section = [
    '', '---', '', '## Pre-Test Results', '',
    `Summary: ${nonEmptyText(suitesInfo.suiteSummary, 'No suite summary available.')}`, '',
    ...results.map(resultLine), '',
    'These deterministic pre-test results are authoritative for build and initial app startup.',
    'Do not rerun build or start commands just to reconfirm them.',
    ...runtimeAuthorityLines(results), '', '',
  ].join('\n');
  const promptText = textValue(prompt);
  const marker = '\n## Test Instructions';
  const index = promptText.indexOf(marker);
  return index >= 0
    ? `${promptText.slice(0, index)}${section}${promptText.slice(index)}`
    : `${promptText}${section}`;
}

function isCredentialEntry(value: unknown): value is AnyRecord {
  if (!value) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return 'values' in value && Boolean((value as AnyRecord).values)
    && typeof (value as AnyRecord).values === 'object';
}

function credentialsForResult(result: AnyRecord): AnyRecord[] {
  const credentials: AnyRecord[] = [];
  const entries = arrayValue(result.metadata?.test_credentials) as AnyRecord[];
  for (const entry of entries) {
    if (!isCredentialEntry(entry)) continue;
    credentials.push({
        suite: nonEmptyText(result.suite, MISSING_SUITE),
        namespace: result.metadata?.test_namespace ?? null,
        service_url: result.metadata?.service_url ?? null,
        preview_url: result.metadata?.preview_url ?? null,
        secret: entry.secret ?? null,
        purpose: entry.purpose ?? null,
        values: entry.values,
    });
  }
  return credentials;
}

function collectCredentials(suitesInfo: AnyRecord): AnyRecord[] {
  return (arrayValue(suitesInfo.results) as AnyRecord[]).flatMap(credentialsForResult);
}

export function appendAppTestCredentialsToPrompt(prompt: unknown, suitesInfo: AnyRecord = {}): string {
  const credentials = collectCredentials(suitesInfo);
  if (credentials.length === 0) return textValue(prompt);
  return `${textValue(prompt)}${[
    '', '---', '', '## App Test Credentials', '',
    'The deterministic pre-test runner decoded only the app-under-test credentials explicitly declared in `test_config.k8s.test_credentials` or final-preview credential config.',
    'Use these values only for authenticated tests against the deployed app. Do not print them into `output_file` unless a failing assertion requires the credential evidence.',
    '', '```json', JSON.stringify(credentials, null, 2), '```', '',
  ].join('\n')}`;
}
