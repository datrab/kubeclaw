import fs from 'node:fs';

import { reviewPolicySchema } from '../src/review-policy-contract.ts';

const policyTarget = new URL('../schemas/review-policy.v2.schema.json', import.meta.url);
const configTarget = new URL('../schemas/config.schema.json', import.meta.url);
const repositoryAuditConfigTarget = new URL('../schemas/repository-audit-config.schema.json', import.meta.url);
const policySource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://kubeclaw.dev/plugins/review/review-policy.v2.schema.json',
  ...reviewPolicySchema,
}, null, 2)}\n`;
const configSource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['agent'],
  properties: {
    agent: { type: 'string', minLength: 1 },
    profile: { enum: ['gate', 'lean', 'audit'], default: 'gate' },
    policy: reviewPolicySchema,
  },
}, null, 2)}\n`;
const repositoryAuditConfigSource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['agent', 'reviewerModel'],
  properties: {
    agent: { type: 'string', minLength: 1 },
    reviewerModel: { type: 'string', minLength: 1,
      description: 'Exact model identity used by repository-audit cache keys.' },
    reviewerRuntime: { enum: ['acp', 'subagent'], default: 'subagent' },
    reviewerAgentId: { type: 'string', minLength: 1, default: 'codex' },
    reviewerThinking: { type: 'string', minLength: 1, default: 'high' },
    profile: { enum: ['gate', 'lean', 'audit'], default: 'audit' },
    policy: reviewPolicySchema,
  },
}, null, 2)}\n`;

const generatedFiles = [
  [policyTarget, policySource],
  [configTarget, configSource],
  [repositoryAuditConfigTarget, repositoryAuditConfigSource],
];

if (process.argv.includes('--check')) {
  for (const [target, source] of generatedFiles) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== source) {
      throw new Error(`${target.pathname} is stale; run npm run schema:generate`);
    }
  }
} else {
  for (const [target, source] of generatedFiles) fs.writeFileSync(target, source);
}
