import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
export type AnyRecord = Record<string, any>;
export type TestCredentialSpec = { secretName: string; keys: string[]; purpose: string | null };

function isObjectDoc(doc: unknown): doc is AnyRecord {
  return Boolean(doc) && typeof doc === 'object' && !Array.isArray(doc);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(selectDefinedValue(() => (value), () => (''))).trim()).filter(Boolean))];
}

export function parseSecretNameFromRef(ref: string | null): string | null {
  if (selectTruthyValue(() => (typeof ref !== 'string'), () => (!ref.trim()))) return null;
  const trimmed = ref.trim();
  const prefixed = trimmed.match(/^secret\/([A-Za-z0-9._-]+)$/);
  if (prefixed) return prefixed[1];
  if (/^[A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  return null;
}

function normalizeSecretName(value: unknown): string | null {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) return null;
  const parsed = parseSecretNameFromRef(value);
  return parsed && /^[A-Za-z0-9._-]+$/.test(parsed) ? parsed : null;
}

function normalizeCredentialKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.filter((key): key is string => typeof key === 'string' && Boolean(key.trim())))
    : [];
}

export function normalizeTestCredentialSpecs(k8sCfg: AnyRecord = {}, previewCfg: AnyRecord = {}): TestCredentialSpec[] {
  const specs: TestCredentialSpec[] = [];
  const configured = Array.isArray(k8sCfg.test_credentials) ? k8sCfg.test_credentials : [];

  for (const entry of configured) {
    if (!isObjectDoc(entry)) continue;
    const secretName = normalizeSecretName(entry.secret_name);
    const keys = normalizeCredentialKeys(entry.keys);
    if (selectTruthyValue(() => (!secretName), () => (keys.length === 0))) continue;
    specs.push({
      secretName,
      keys,
      purpose: typeof entry.purpose === 'string' && entry.purpose.trim() ? entry.purpose.trim() : null,
    });
  }

  const previewReveal = selectTruthyValue(() => (previewCfg.reveal_credentials === true), () => (previewCfg.credentials_delivery === 'discord'));
  const previewSecret = normalizeSecretName(previewCfg.credentials_secret_name);
  const previewKeys = normalizeCredentialKeys(previewCfg.credentials_keys);
  if (previewReveal && previewSecret && previewKeys.length > 0) {
    specs.push({
      secretName: previewSecret,
      keys: previewKeys,
      purpose: 'final-preview login',
    });
  }

  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = `${spec.secretName}:${spec.keys.join(',')}:${selectDefinedValue(() => (spec.purpose), () => (''))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shellSingleQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildPreviewCredentialCommand(secretName: string | null, keys: string[], namespace: string): string | null {
  if (!secretName) return null;
  const namespaceArg = shellSingleQuote(namespace);
  const secretArg = shellSingleQuote(secretName);
  if (keys.length > 0) {
    const keyList = keys.map(shellSingleQuote).join(' ');
    return `for k in ${keyList}; do printf '%s: ' "$k"; kubectl -n ${namespaceArg} get secret ${secretArg} -o "go-template={{ index .data \\"$k\\" | base64decode }}"; printf '\\n'; done`;
  }
  return `kubectl -n ${namespaceArg} get secret ${secretArg} -o 'go-template={{range $k,$v := .data}}{{printf "%s: " $k}}{{base64decode $v}}{{"\\n"}}{{end}}'`;
}
