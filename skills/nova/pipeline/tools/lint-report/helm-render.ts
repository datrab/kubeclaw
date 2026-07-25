import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { failParse } from './report.ts';

function renderChart(ctx: any, chartDir: any) {
  const release = `lint-${path.basename(chartDir).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
  const rendered = requireToolExecution(safeExec('helm', ['template', release, chartDir, '--include-crds'], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'helm-template');
  if (rendered.exitCode !== 0 || !rendered.stdout.trim()) failParse(ctx, 'helm-template', { error: 'render failed or produced no manifests' }, rendered, chartDir);
  return rendered.stdout;
}

export { renderChart };
