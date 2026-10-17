/** Browser identity is observed by the capture owner, never inferred from a profile. */
export function assertBaselineVersion(schemaVersion) {
  if (schemaVersion === 'kubeclaw.visual-baselines.v1') {
    throw new Error('VISUAL_BASELINE_MIGRATION_REQUIRED:recapture and approve browser-bound v2 baselines');
  }
  if (schemaVersion !== 'kubeclaw.visual-baselines.v2') throw new Error('VISUAL_MANIFEST_INVALID');
}

export function assertBrowserVersion(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256
    || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('VISUAL_BROWSER_VERSION_INVALID');
  }
  return value;
}

export function assertBaselineBrowserVersion(baseline, current, id) {
  const expected = assertBrowserVersion(baseline);
  const actual = assertBrowserVersion(current);
  if (actual !== expected) {
    throw new Error(`VISUAL_BASELINE_BROWSER_VERSION_MISMATCH:${id}:expected=${expected}:actual=${actual}`);
  }
}
