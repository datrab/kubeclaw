import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireToolExecution, safeExec } from './execution.js';
import { configuredTargetPaths, findFiles, listConfiguredTargetFiles, } from './discovery.js';
import { tryParseJson } from './parsers.js';
import { failConfigMissing, failParse, notApplicable, } from './report.js';
import { log } from './output.js';
import { arrayValue, objectRecord as recordValue, selectPresentValue, textValue } from '../support/value-boundary.js';
import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.js';
export const TOOL_ADAPTERS = [];
const TOOL_OUTPUT_EMPTY = '';
export const TOOL_OUTPUT_PREVIEW_MISSING = 'no output captured';
export const LINT_VULNERABILITY_FOUND = 'vulnerability found';
export function eslintFindingSeed(ctx, fileResult, message, occurrences) {
    const file = path.relative(ctx.repoRoot, fileResult.filePath).split(path.sep).join('/');
    const sourceLine = textValue(fileResult.source)
        .split('\n')[Math.max(0, (message.line ?? 1) - 1)]
        ?.trim() ?? '';
    const key = JSON.stringify({
        code: message.ruleId ?? 'eslint',
        file,
        message: message.message,
        source_line: sourceLine,
    });
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return {
        code: message.ruleId ?? 'eslint',
        file,
        message: message.message,
        source_line: sourceLine,
        occurrence,
    };
}
export function requireString(value, label) {
    if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim())))
        throw new Error(`${label}: required non-empty string`);
    return value.trim();
}
export function requireNumber(value, label) {
    if (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value))))
        throw new Error(`${label}: required number`);
    return value;
}
export function isJavaScriptOrTypeScriptProject(ctx) {
    return selectTruthyValue(() => (ctx.projectTypes.has('javascript')), () => (ctx.projectTypes.has('typescript')));
}
function pathContains(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export function affectedTypeScriptConfigs(ctx) {
    const configs = configuredTargetPaths(ctx);
    if (ctx.changedFilesRequested) {
        const changes = ctx.changedFiles.map((file) => path.resolve(ctx.repoRoot, file));
        return configs.filter((config) => changes.some((change) => pathContains(path.dirname(config), change)));
    }
    if (ctx.requestedModulePath) {
        const requested = path.resolve(ctx.repoRoot, ctx.requestedModulePath);
        return configs.filter((config) => pathContains(path.dirname(config), requested) || pathContains(requested, path.dirname(config)));
    }
    return configs;
}
export function uniqueTypeScriptFindings(repoRoot, findings) {
    const seen = new Set();
    return findings.filter((finding) => {
        const absolute = path.isAbsolute(finding.file) ? path.normalize(finding.file) : path.resolve(repoRoot, finding.file);
        const relative = path.relative(repoRoot, absolute);
        const file = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
            ? relative.split(path.sep).join('/')
            : finding.file.split(path.sep).join('/');
        const identity = JSON.stringify({
            file,
            line: finding.line,
            column: finding.column,
            severity: finding.severity,
            code: finding.code,
            message: finding.message,
        });
        if (seen.has(identity))
            return false;
        seen.add(identity);
        return true;
    });
}
export function npmAuditSeverity(severity) {
    return selectTruthyValue(() => (severity === 'critical'), () => (severity === 'high')) ? 'error' : 'warning';
}
export function registerTool(tool) {
    TOOL_ADAPTERS.push(tool);
}
export function buildToolRegistry(policy, projectTypes) {
    const adapters = new Map(TOOL_ADAPTERS.map((adapter) => [adapter.id, adapter]));
    const configured = policy.tools.map((settings) => {
        const adapter = adapters.get(settings.id);
        if (!adapter)
            throw Object.assign(new Error(`No lint adapter exists for configured tool '${settings.id}'`), { code: 'LINT_POLICY_ADAPTER_MISSING' });
        return {
            id: adapter.id,
            name: adapter.name,
            binary: adapter.binary,
            run: adapter.run,
            ...settings,
            detect: () => settings.languages.length === 0 || settings.languages.some((language) => projectTypes.has(language)),
        };
    });
    const configuredIds = new Set(policy.tools.map((tool) => tool.id));
    const unconfigured = TOOL_ADAPTERS.filter((adapter) => !configuredIds.has(adapter.id)).map((adapter) => adapter.id);
    if (unconfigured.length > 0)
        throw Object.assign(new Error(`Lint adapters missing canonical policy: ${unconfigured.join(', ')}`), { code: 'LINT_POLICY_TOOL_MISSING' });
    return configured;
}
