import { verifyReportIdentity } from '../../../../../tests/verification/reliability/report-identity-fixture.mjs';
import { sha256Text } from '@kubeclaw/plugin-sdk';
import { assertReportArtifact } from '../src/stage.ts';
const observations = ['architecture','agents','prompts','tests','configuration'].map(dimension => ({ dimension, finding: `${dimension} transport fixture`, priority: 'low' }));
await verifyReportIdentity({ plugin: 'pipeline-review', registration: 'review', type: 'kubeclaw.report.pipeline-review', assertStored: assertReportArtifact,
  input: { runId: 'run:historical-A', attempt: 7, task: 'Review historical caller notes.', evidence: [{ kind: 'caller-note', digest: sha256Text('historical caller note, not authoritative run evidence') }] },
  valid: { status: 'reviewed', summary: 'Transport fixture; no reviewer model executed.', observations } });
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.pipeline-review', suite: 'live-function', modelExecution: false }));
