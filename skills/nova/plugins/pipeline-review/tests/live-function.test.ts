import { verifyReportIdentity } from '../../../../../tests/verification/reliability/report-identity-fixture.mjs';
import { assertReportArtifact } from '../src/stage.ts';
const observations = ['architecture','agents','prompts','tests','configuration'].map(dimension => ({ dimension, finding: `${dimension} transport fixture`, priority: 'low' }));
await verifyReportIdentity({ plugin: 'pipeline-review', registration: 'review', type: 'kubeclaw.report.pipeline-review', assertStored: assertReportArtifact,
  input: { task: 'Draft observations from the actual completed source run.' },
  valid: { status: 'reviewed', summary: 'Transport fixture; no reviewer model executed.', observations } });
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.pipeline-review', suite: 'live-function', modelExecution: false }));
