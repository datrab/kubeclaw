/** Public, non-secret subset of the verified Studio startup snapshot. No client defaults. */
export interface StudioBrowserPolicy {
  readonly maximumPreviewAssetBytes: number;
  readonly previewAssetTimeoutMs: number;
  readonly roundPolling: PollingPolicy;
  readonly revisionPolling: PollingPolicy;
  readonly initialDirectionPolling: PollingPolicy;
}
export interface PollingPolicy { readonly maximumAttempts: number; readonly intervalMs: number }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('PRISM_STUDIO_BROWSER_POLICY_INVALID');
  return value as Record<string, unknown>;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) throw new Error('PRISM_STUDIO_BROWSER_POLICY_INVALID');
  return value;
}
function polling(value: unknown): PollingPolicy {
  const row = object(value, ['maximumAttempts', 'intervalMs']);
  return Object.freeze({ maximumAttempts: positive(row.maximumAttempts), intervalMs: positive(row.intervalMs) });
}
export function studioBrowserPolicy(value: unknown): StudioBrowserPolicy {
  const row = object(value, ['maximumPreviewAssetBytes', 'previewAssetTimeoutMs', 'roundPolling', 'revisionPolling', 'initialDirectionPolling']);
  return Object.freeze({ maximumPreviewAssetBytes: positive(row.maximumPreviewAssetBytes), previewAssetTimeoutMs: positive(row.previewAssetTimeoutMs),
    roundPolling: polling(row.roundPolling), revisionPolling: polling(row.revisionPolling), initialDirectionPolling: polling(row.initialDirectionPolling) });
}
export async function loadStudioBrowserPolicy(): Promise<StudioBrowserPolicy> {
  const response = await fetch('/studio-config', { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error(`PRISM_STUDIO_BROWSER_POLICY_HTTP:${response.status}`);
  return studioBrowserPolicy(await response.json());
}
