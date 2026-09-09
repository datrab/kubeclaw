import { verifyReportIdentity } from '../../../../../tests/verification/reliability/report-identity-fixture.mjs';
import { assertReportArtifact } from '../src/stage.ts';
const markdown = ['Context','Challenge','Approach','Implementation','Verification','Outcome'].map(section => `## ${section}\n\nCaller note; not verified evidence.`).join('\n\n');
await verifyReportIdentity({ plugin: 'case-study', registration: 'case-study', type: 'kubeclaw.report.case-study', assertStored: assertReportArtifact,
  input: { projectId: 'historical-project', runId: 'run:historical-A', task: 'Draft historical case study.', facts: [{ label: 'Caller note', value: 'Unverified historical description.' }] },
  valid: { status: 'generated', markdown } });
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.case-study', suite: 'live-function', modelExecution: false }));
