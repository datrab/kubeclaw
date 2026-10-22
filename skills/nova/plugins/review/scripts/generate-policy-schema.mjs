import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { repositoryGradeSchema } from '../src/review-owned-policy-schema.ts';
import {ownedPolicyProfilesSchema} from '../src/review-owned-policy-schema.ts';
import fs from 'node:fs';
import { createRequire } from 'node:module';

import { reviewPolicySchema } from '../src/review-policy-contract.ts';
import { REVIEW_SEMANTIC_ENCODING } from '../src/review-semantics.ts';

const policyTarget = new URL('../schemas/review-policy.v2.schema.json', import.meta.url);
const configTarget = new URL('../schemas/config.schema.json', import.meta.url);
const repositoryAuditConfigTarget = new URL('../schemas/repository-audit-config.schema.json', import.meta.url);
const policySource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://kubeclaw.dev/plugins/review/review-policy.v2.schema.json',
  ...reviewPolicySchema,
}, null, 2)}\n`;
const ownedProfiles = ownedPolicyProfilesSchema('#/$defs/reviewOwnedPolicy');
const configSource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  $defs: {reviewOwnedPolicy: reviewPolicySchema},
  required: ['agent'],
  properties: {
    reviewSemanticEncoding: { const: REVIEW_SEMANTIC_ENCODING },
    reportArtifactEncoding: { const: 'kubeclaw-json.utf16.v1' },
    agent: { type: 'string', minLength: 1 },
    profile: { enum: ['gate', 'lean', 'audit'], default: 'gate' },
    policy: reviewPolicySchema,
    ownedPolicyProfiles: ownedProfiles,
  },
  allOf: [{ not: { type: 'object', properties: {ownedPolicyProfiles: {}, policy: {}}, required: ['ownedPolicyProfiles','policy'] } }, {
    if: { properties: { reviewSemanticEncoding: { const: REVIEW_SEMANTIC_ENCODING } }, required: ['reviewSemanticEncoding'] },
    then: { properties: { reportArtifactEncoding: { const: 'kubeclaw-json.utf16.v1' } }, required: ['reportArtifactEncoding'] },
  }],
}, null, 2)}\n`;
const repositoryAuditConfigSource = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  $defs: {reviewOwnedPolicy: reviewPolicySchema},
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
    ownedPolicyProfiles: ownedProfiles,
    repositoryRuntimeTarget:{type:'object',additionalProperties:false,required:['tokenizerEncoding','maxInputTokens','maxOutputTokens','maxContextTokens','maxPromptBytes'],properties:{tokenizerEncoding:{enum:['o200k_base','cl100k_base']},...Object.fromEntries(['maxInputTokens','maxOutputTokens','maxContextTokens','maxPromptBytes'].map(k=>[k,{type:'integer',minimum:1}]))}},
  },
  allOf: [{not: {type:'object',properties:{ownedPolicyProfiles:{},policy:{}},required:['ownedPolicyProfiles','policy']}}],
}, null, 2)}\n`;

// Compile the same canonical schema at build time; stages load only static code.
const gradeAjv = new Ajv2020({ strict: true, code: { source: true, esm: true } });
const gradeValidator = gradeAjv.compile({ type: 'object', additionalProperties: false,
  required: ['fast', 'standard', 'deep'],
  properties: { fast: repositoryGradeSchema, standard: repositoryGradeSchema, deep: repositoryGradeSchema } });
// Resolve through the actual installation, but use canonical module identities in
// the emitted bundle. npm and pnpm must generate byte-identical static validators.
const requireFromGenerator = createRequire(import.meta.url);
const gradeRuntimePlugin = {
  name: 'grade-runtime',
  setup(builder) {
    builder.onResolve({ filter: /^(?:ajv\/dist\/runtime\/equal|fast-deep-equal)$/ }, (args) => ({
      path: args.path, namespace: 'grade-runtime',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'grade-runtime' }, (args) => ({
      contents: fs.readFileSync(requireFromGenerator.resolve(args.path), 'utf8'), loader: 'js',
    }));
  },
};
const gradeBuild = await build({ plugins: [gradeRuntimePlugin], absWorkingDir: fileURLToPath(new URL('../', import.meta.url)), stdin: { contents: standaloneCode(gradeAjv, gradeValidator),
  resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'js' },
  bundle: true, platform: 'neutral', format: 'esm', write: false, legalComments: 'inline' });
const gradeSource = gradeBuild.outputFiles[0].text.replace(/^\s*(?:ucs2length|equal)\.code = [^\n]+;$/gmu, '');
if (/\b(?:eval|Function|require)\s*\(/u.test(gradeSource)) throw new Error('Grade validator must be static and CSP-safe');
const gradeTarget = new URL('../src/repository-grade-validator.generated.mjs', import.meta.url);
const gradeTypesTarget = new URL('../src/repository-grade-validator.generated.d.mts', import.meta.url);

const generatedFiles = [
  [gradeTarget, '// Generated from repositoryGradeSchema; do not edit.\n' + gradeSource],
  [gradeTypesTarget, 'declare const validateGrades: (value: unknown) => boolean;\nexport default validateGrades;\n'],
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
