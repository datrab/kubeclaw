import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
const selected = process.env.BUSTER_PROCESS_INPUT_FORWARD_MUTATION;
const mutations = {
  report: ['runner.ts', 'executionPolicy.processInput', 'undefined'],
  kubernetes: ['capability-runtime.ts', 'workspaceRoot: jobRoot, processInputPolicy,', 'workspaceRoot: jobRoot, processInputPolicy: undefined,'],
  tailscale: ['capability-runtime.ts', "'BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'), processInputPolicy }", "'BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'), processInputPolicy: undefined }"],
};
assert(Object.hasOwn(mutations, selected));
const [file, anchor, replacement] = mutations[selected];
const target = new URL(`../../../../../skills/buster/engine/test-gates/${file}`, import.meta.url).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  const source = fs.readFileSync(new URL(url), 'utf8');
  assert.equal(source.split(anchor).length, 2, 'one production forwarding edge');
  return { ...result, source: source.replace(anchor, replacement) };
} });
