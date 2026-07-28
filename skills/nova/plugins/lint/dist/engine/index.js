import fs from 'node:fs';
import path from 'node:path';
import { detectProjectTypes, resolveScope, takeDiscoveryDiagnostics } from './discovery.js';
import { runAllTools as runToolsForRegistry } from './report.js';
import { validateLintReport } from './report-contract.js';
import { loadLintPolicy, policyDigest, selectPolicyProject, validatePolicyTargetPaths, } from './policy.js';
import { buildToolRegistry } from './tool-registry.js';
function normalizeModulePath(repositoryRoot, value) {
    if (!value)
        return null;
    if (path.isAbsolute(value))
        throw new Error('LINT_MODULE_PATH_ABSOLUTE');
    const normalized = path.normalize(value);
    const absolute = path.resolve(repositoryRoot, normalized);
    const relative = path.relative(repositoryRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('LINT_MODULE_PATH_ESCAPE');
    return normalized;
}
function normalizeChangedFiles(values) {
    if (!values)
        return [];
    return values.map((value) => {
        if (typeof value !== 'string' || value.length === 0)
            throw new Error('LINT_CHANGED_FILE_INVALID');
        if (path.isAbsolute(value))
            throw new Error('LINT_CHANGED_FILE_ABSOLUTE');
        const normalized = path.normalize(value);
        if (normalized === '..' || normalized.startsWith(`..${path.sep}`))
            throw new Error('LINT_CHANGED_FILE_ESCAPE');
        return normalized.split(path.sep).join('/');
    });
}
export async function executeLintReport(request) {
    const repositoryRoot = fs.realpathSync(request.workingDirectory);
    const policyPath = fs.realpathSync(request.policyPath);
    const policy = loadLintPolicy(policyPath);
    const policyProject = selectPolicyProject(policy, request.policyProject);
    validatePolicyTargetPaths(repositoryRoot, policy, policyProject);
    const modulePath = normalizeModulePath(repositoryRoot, request.modulePath);
    const changedFiles = normalizeChangedFiles(request.changedFiles);
    const { types: projectTypes } = detectProjectTypes(repositoryRoot, policyProject, policy.global_exclusions);
    const context = {
        repoRoot: repositoryRoot,
        modulePath,
        requestedModulePath: modulePath,
        project: request.project || path.basename(repositoryRoot),
        tier: request.tier,
        changedFiles,
        changedFilesRequested: changedFiles.length > 0,
        projectTypes,
        policy,
        policyPath,
        policyDigest: policyDigest(policy),
        policyProject,
        includeDebt: request.includeDebt === true,
        includeExperimental: request.includeExperimental === true,
        diagnostics: takeDiscoveryDiagnostics(),
    };
    if (changedFiles.length > 0)
        context.changedFiles = resolveScope(context);
    else
        resolveScope(context);
    context.diagnostics = [
        ...(Array.isArray(context.diagnostics) ? context.diagnostics : []),
        ...takeDiscoveryDiagnostics(),
    ];
    const report = await runToolsForRegistry(context, buildToolRegistry(policy, projectTypes));
    validateLintReport(report);
    return report;
}
