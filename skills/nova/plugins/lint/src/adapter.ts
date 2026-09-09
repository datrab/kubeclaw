import fs from 'node:fs';
import { assertNotAborted } from './engine/process.ts';
import { withLintCandidate } from './candidate.ts';
import path from 'node:path';

import type { AdapterActivationContext, AdapterInstance } from '@kubeclaw/plugin-sdk';
import { requestPayload } from './request.ts';
import { executeLintReport } from './engine/index.ts';

function configuredRoots(config: Readonly<Record<string, unknown>>, key: string): string[] {
  const value = config[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    throw new Error(`lint adapter ${key} must be a non-empty string array`);
  }
  return value.map((root) => fs.realpathSync(path.resolve(root as string)));
}

function requireInside(value: unknown, roots: readonly string[], label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}_INVALID`);
  const canonical = fs.realpathSync(path.resolve(value));
  if (!roots.some((root) => canonical === root || canonical.startsWith(`${root}${path.sep}`))) {
    throw new Error(`${label}_DENIED:${canonical}`);
  }
  return canonical;
}


export function activate(context: AdapterActivationContext): AdapterInstance {
  const repositoryRoots = configuredRoots(context.config, 'allowedRepositoryRoots');
  const policyRoots = configuredRoots(context.config, 'allowedPolicyRoots');
  const shutdown = new AbortController();
  const active = new Set<Promise<Readonly<Record<string, unknown>>>>();
  return {
    async ready() {},
    async invoke({ request, signal: callerSignal, confidential, fence }) {
      const signal = AbortSignal.any([callerSignal, shutdown.signal]);
      const execute = async (): Promise<Readonly<Record<string, unknown>>> => {
      if (!confidential) fence.assertCurrent();
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      if (request.capability !== 'lint.execute' || request.operation !== 'run_report') {
        throw new Error(`LINT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
      }
      const payload = requestPayload(request.payload);
      const workingDirectory = requireInside(payload.workingDirectory, repositoryRoots, 'LINT_WORKING_DIRECTORY');
      const policyPath = requireInside(payload.policyPath, policyRoots, 'LINT_POLICY_PATH');
      const revision = request.payload.sourceRevision;
      if (revision !== undefined && (typeof revision !== 'string' || !/^[a-f0-9]{40}$/u.test(revision))) throw new Error('LINT_SOURCE_REVISION_INVALID');
      const run = (root: string) => executeLintReport({ ...payload, workingDirectory: root, policyPath, signal });
      const report = revision === undefined ? await run(workingDirectory)
        : await withLintCandidate(workingDirectory, revision, run, signal);
      assertNotAborted(signal);
      if (!confidential) fence.assertCurrent();
      return { report, ...(revision === undefined ? {} : { sourceRevision: revision }) };
      };
      const pending = execute();
      active.add(pending);
      try { return await pending; } finally { active.delete(pending); }
    },
    async shutdown() {
      shutdown.abort(new Error('LINT_ADAPTER_SHUTDOWN'));
      await Promise.allSettled([...active]);
    },
  };
}
