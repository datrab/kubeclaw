import { verifyReportIdentity } from '../../../../../tests/verification/reliability/report-identity-fixture.mjs';
import { assertReportArtifact } from '../src/stage.ts';
const markdown = ['Context','Challenge','Approach','Implementation','Verification','Outcome'].map(section => `## ${section}\n\nDraft observations grounded in cited source facts; no narrative entailment proof.`).join('\n\n');
await verifyReportIdentity({ plugin: 'case-study', registration: 'case-study', type: 'kubeclaw.report.case-study', assertStored: assertReportArtifact,
  input: { task: 'Draft observations from the actual completed source run.' },
  valid: { status: 'generated', markdown } });
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.case-study', suite: 'live-function', modelExecution: false }));
