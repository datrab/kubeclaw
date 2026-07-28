import fs from 'node:fs';
import path from 'node:path';
import { executeLintReport } from './engine/index.js';
function configuredRoots(config, key) {
    const value = config[key];
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
        throw new Error(`lint adapter ${key} must be a non-empty string array`);
    }
    return value.map((root) => fs.realpathSync(path.resolve(root)));
}
function requireInside(value, roots, label) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${label}_INVALID`);
    const canonical = fs.realpathSync(path.resolve(value));
    if (!roots.some((root) => canonical === root || canonical.startsWith(`${root}${path.sep}`))) {
        throw new Error(`${label}_DENIED:${canonical}`);
    }
    return canonical;
}
function requestPayload(value) {
    const tier = value.tier;
    if (tier !== 'pre-check' && tier !== 'full')
        throw new Error('LINT_TIER_INVALID');
    const changedFiles = value.changedFiles;
    if (changedFiles !== undefined && (!Array.isArray(changedFiles) || changedFiles.some((item) => typeof item !== 'string'))) {
        throw new Error('LINT_CHANGED_FILES_INVALID');
    }
    if (typeof value.workingDirectory !== 'string')
        throw new Error('LINT_WORKING_DIRECTORY_INVALID');
    if (typeof value.policyPath !== 'string')
        throw new Error('LINT_POLICY_PATH_INVALID');
    if (typeof value.policyProject !== 'string')
        throw new Error('LINT_POLICY_PROJECT_INVALID');
    return {
        workingDirectory: value.workingDirectory,
        policyPath: value.policyPath,
        policyProject: value.policyProject,
        tier,
        ...(typeof value.project === 'string' ? { project: value.project } : {}),
        ...(typeof value.modulePath === 'string' ? { modulePath: value.modulePath } : {}),
        ...(Array.isArray(changedFiles) ? { changedFiles: changedFiles } : {}),
        ...(value.includeDebt === true ? { includeDebt: true } : {}),
        ...(value.includeExperimental === true ? { includeExperimental: true } : {}),
    };
}
export function activate(context) {
    const repositoryRoots = configuredRoots(context.config, 'allowedRepositoryRoots');
    const policyRoots = configuredRoots(context.config, 'allowedPolicyRoots');
    return {
        async ready() { },
        async invoke({ request, signal, confidential, fence }) {
            if (!confidential)
                fence.assertCurrent();
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (request.capability !== 'lint.execute' || request.operation !== 'run_report') {
                throw new Error(`LINT_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
            }
            const payload = requestPayload(request.payload);
            const workingDirectory = requireInside(payload.workingDirectory, repositoryRoots, 'LINT_WORKING_DIRECTORY');
            const policyPath = requireInside(payload.policyPath, policyRoots, 'LINT_POLICY_PATH');
            const report = await executeLintReport({ ...payload, workingDirectory, policyPath });
            return { report };
        },
        async shutdown() { },
    };
}
