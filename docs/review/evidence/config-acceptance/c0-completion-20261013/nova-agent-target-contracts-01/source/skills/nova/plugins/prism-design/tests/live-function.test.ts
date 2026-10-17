import assert from 'node:assert/strict';
import type { PluginInvocationContext } from '@kubeclaw/plugin-sdk';
import { execute } from '../src/stage.ts';

const result = await execute({
  runId: 'run:prism-not-required',
  projectId: 'project-without-design-work',
  architectureArtifact: {
    artifactId: 'architecture:not-used',
    contentDigest: `sha256:${'0'.repeat(64)}`,
    revision: 1,
  },
  requiresDesign: false,
}, undefined as unknown as PluginInvocationContext);

assert.deepEqual(result, {
  schemaVersion: 'stage-result.v2',
  outcome: 'passed',
  artifacts: [],
});
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.prism-design', path: 'design-not-required', mocks: 0 }));
