import assert from 'node:assert/strict';
import {
  attachRuntimeEvidence,
  buildOpenClawTask,
  type RuntimeSessionEvidence,
} from '../../../skills/common/plugins/runtime-dispatch/src/openclaw.ts';
import {
  buildArchitectureRequest,
} from '../../../skills/nova/plugins/architecture-validator/src/protocol.ts';
import {
  parseArchitectureOutput,
} from '../../../skills/nova/plugins/architecture-validator/src/output.ts';
import {
  buildRequest as buildImplementationRequest,
  parseCompletion,
} from '../../../skills/nova/plugins/implementation-agent/src/protocol.ts';
import {
  buildReviewDispatchRequest,
} from '../../../skills/nova/plugins/review/src/protocol.ts';
import {
  parseEchoReviewDispatchResponse,
} from '../../../skills/nova/plugins/review/src/echo-review-parser.ts';
import {
  getReviewPolicyProfile,
} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {
  resolveReviewPolicy,
} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {
  buildRequest as buildPipelineReviewRequest,
  parseReport,
} from '../../../skills/nova/plugins/pipeline-review/src/protocol.ts';
import {
  buildRequest as buildQualityRequest,
  parseVerdict as parseQualityVerdict,
} from '../../../skills/nova/plugins/buster-quality-gate/src/protocol.ts';
import {
  buildRequest as buildCaseStudyRequest,
  parseCaseStudy,
  requiredSections,
} from '../../../skills/nova/plugins/case-study/src/protocol.ts';
import {
  buildRequest as buildBusterRequest,
  parseVerdict as parseBusterVerdict,
} from '../../../skills/buster/plugins/test-agent/src/protocol.ts';

type Json = Record<string, unknown>;

const session: RuntimeSessionEvidence = {
  sessionId: 'session:contract',
  startedAt: '2026-07-29T00:00:00.000Z',
  completedAt: '2026-07-29T00:00:01.000Z',
  transcriptDigest: 'a'.repeat(64),
  termination: 'completed',
};

function contract(request: Readonly<Record<string, unknown>>): Json {
  assert.ok(request.outputContract && typeof request.outputContract === 'object');
  const value = request.outputContract as Json;
  assert.equal(value.type, 'object');
  assert.equal(value.additionalProperties, false);
  assert.ok(Array.isArray(value.required));
  return value;
}

function taskContract(request: Readonly<Record<string, unknown>>): void {
  contract(request);
  const task = buildOpenClawTask(request as Json, '/tmp/kubeclaw-result.json');
  assert.match(task, /immutable input envelope/u);
  assert.match(task, /Return only the agent-owned fields/u);
  assert.match(task, /no additional fields/u);
}

const architectureRequest = buildArchitectureRequest('architect', { task: 'Validate.' }, null);
taskContract(architectureRequest);
parseArchitectureOutput({ result: {
  verdict: 'passed',
  summary: 'Valid.',
  findings: [],
  checkedFiles: ['README.md'],
} });
assert.throws(() => parseArchitectureOutput({ result: {
  verdict: 'passed',
  summary: 'Invalid envelope.',
  findings: [],
  checkedFiles: ['README.md'],
  protocol: architectureRequest.protocol,
} }));

const implementationInput = {
  runId: 'run-1',
  moduleId: 'module-1',
  attempt: 1,
  task: 'Implement.',
  headBefore: 'a'.repeat(40),
};
const implementationRequest = buildImplementationRequest('forge', implementationInput);
taskContract(implementationRequest);
const implementationRaw = {
  status: 'ready_for_testing',
  summary: 'Implemented.',
  changedPaths: ['src/index.ts'],
  checks: [{ name: 'unit', passed: true }],
};
parseCompletion(
  attachRuntimeEvidence(implementationRequest as Json, implementationRaw, session),
  implementationInput,
);
assert.throws(() => parseCompletion(
  attachRuntimeEvidence(
    implementationRequest as Json,
    { ...implementationRaw, protocol: implementationRequest.protocol },
    session,
  ),
  implementationInput,
));

const reviewRequest = buildReviewDispatchRequest(
  'echo',
  {
    task: 'Review.',
    requirements: [{ id: 'REQ-1', statement: 'The contract is satisfied.' }],
    evidence: [{
      kind: 'contract', digest: `sha256:${'a'.repeat(64)}`, content: { artifact: 'artifact-1' },
    }],
  },
  null,
  resolveReviewPolicy({ builtIn: getReviewPolicyProfile('gate') }),
);
taskContract(reviewRequest);
const review = parseEchoReviewDispatchResponse({ result: {
  schemaVersion: 'echo-review-output.v1',
  summary: 'Reviewed.',
  inspectedEvidence: [{ kind: 'contract', digest: `sha256:${'a'.repeat(64)}` }],
  requirementAssessments: {
    'REQ-1': {
      assessment: 'satisfied', explanation: 'The contract is satisfied.',
      evidence: [{ kind: 'contract', digest: `sha256:${'a'.repeat(64)}` }],
    },
  },
  proposedFindings: [],
} });
assert.equal(review.ok, true);

const pipelineReviewInput = {
  runId: 'run-1',
  attempt: 1,
  task: 'Review pipeline.',
  evidence: [{ kind: 'summary', digest: `sha256:${'a'.repeat(64)}` }],
};
const pipelineReviewRequest = buildPipelineReviewRequest('echo', pipelineReviewInput);
taskContract(pipelineReviewRequest);
const observations = ['architecture', 'agents', 'prompts', 'tests', 'configuration'].map(
  (dimension) => ({ dimension, finding: `${dimension} reviewed`, priority: 'low' }),
);
parseReport({ status: 'reviewed', summary: 'Reviewed.', observations }, pipelineReviewInput);
assert.throws(() => parseReport({
  status: 'reviewed',
  summary: 'Invalid envelope.',
  observations,
  identity: pipelineReviewRequest.identity,
}, pipelineReviewInput));

const qualityInput = {
  runId: 'run-1',
  gateId: 'quality',
  attempt: 1,
  task: 'Judge.',
  suiteEvidence: [{ suite: 'unit', passed: true, summary: 'Passed.' }],
};
const qualityRequest = buildQualityRequest('buster', qualityInput);
taskContract(qualityRequest);
parseQualityVerdict({
  outcome: 'passed',
  summary: 'Passed.',
  failureClass: 'none',
  findings: [],
}, qualityInput);
assert.throws(() => parseQualityVerdict({
  outcome: 'passed',
  summary: 'Invalid envelope.',
  failureClass: 'none',
  findings: [],
  identity: qualityRequest.identity,
}, qualityInput));

const busterInput = {
  runId: 'run-1',
  taskId: 'module-1',
  attempt: 1,
  task: 'Judge tests.',
  suiteEvidence: [{ suite: 'unit', passed: true, summary: 'Passed.' }],
};
const busterRequest = buildBusterRequest('buster', busterInput);
taskContract(busterRequest);
parseBusterVerdict(
  attachRuntimeEvidence(busterRequest as Json, {
    verdict: 'PASS',
    summary: 'Passed.',
    findings: [],
  }, session),
  busterInput,
);
assert.throws(() => parseBusterVerdict(
  attachRuntimeEvidence(busterRequest as Json, {
    protocol: busterRequest.protocol,
    verdict: 'PASS',
    summary: 'Invalid envelope.',
    findings: [],
  }, session),
  busterInput,
));

const markdown = requiredSections.map((section) => `## ${section}\n\nEvidence.`).join('\n\n');
const caseStudyInput = {
  projectId: 'project-1',
  runId: 'run-1',
  task: 'Write case study.',
  facts: [{ label: 'Tests', value: 'Passed' }],
};
const caseStudyRequest = buildCaseStudyRequest('writer', caseStudyInput);
taskContract(caseStudyRequest);
parseCaseStudy({ status: 'generated', markdown }, caseStudyInput);
assert.throws(() => parseCaseStudy({
  status: 'generated',
  markdown,
  identity: caseStudyRequest.identity,
}, caseStudyInput));

console.log(JSON.stringify({
  ok: true,
  suite: 'agent-output-contracts',
  registrations: 7,
  runtimeEvidenceProtocols: 2,
}));
