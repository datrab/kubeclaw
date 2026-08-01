import fs from 'fs';
import path from 'path';
import { createSuiteVerdict, createFinding, STATUS, SEVERITY, } from '../services/verdict-schema.js';
import { resolveDiscordWebhookUrl } from '../services/runtime.js';
import { REPO_DIR, resolveRepoScopedPath } from './repo-paths.js';
import { deliverySkippedCapability } from './visual-reg-discord.js';
import { BUSTER_CAPABILITIES, resolveContextCapabilities } from '../services/capabilities.js';
import { createSuiteLog, suiteErrorMessage as errorMessage, suiteNonEmptyString as nonEmptyString, suiteObject as objectRecord, suiteObjectOrEmpty as objectRecordOrEmpty, } from './support.js';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { readBusterEnvironment } from '../buster-environment.js';
import { runMultiPath } from './visual-reg-multi.js';
import { deliverVisualResults, finalizeVisualReg, resolveVisualRegOverallStatus, summarizeDiscordDelivery } from './visual-reg-delivery.js';
export { resolveVisualRegOverallStatus, summarizeDiscordDelivery } from './visual-reg-delivery.js';
// DELETE_LEGACY: visual-reg requires explicit reviewed baseline metadata in
// paths.json plus per-route baseline PNGs. Legacy baseline path config,
// HTML auto-generation, missing-baseline SKIP, and implicit single-path mode
// are removed.
// KEEP_TYPED_POLICY: visual diffs remain evidence-only PASS without thresholds,
// artifact fan-out failures are noncritical, and task log/result fallback
// artifact directories preserve evidence when a task-specific screenshot dir is
// absent.
// STRICTIFY_TS_SLICE: Discord delivery telemetry requires typed delivery result
// shapes instead of accepting arbitrary unknown objects.
const DEFAULTS = {
    static_port: 9999,
    server_port: 3000,
    pixelmatch_threshold: 0.1,
    repo_dir: REPO_DIR,
    discord_diff_threshold: 2,
};
function contractFailure(startTime, message, log, metadata = {}) {
    const duration_ms = Date.now() - startTime;
    log(`Contract failure: ${message}`);
    return createSuiteVerdict('visual-reg', STATUS.ERROR, {
        critical: false,
        duration_ms,
        error: message,
        findings: [createFinding(SEVERITY.SERIOUS, message, { rule: 'visual-baseline-contract' })],
        metadata,
    });
}
function assertNoLegacyVisualRegPathConfig(vrConf = {}) {
    if (Object.prototype.hasOwnProperty.call(vrConf, 'baseline_dir')) {
        throw new Error('visual-reg.baseline_dir is no longer supported; baselines are derived from .swarm/modules/<module>/baselines');
    }
    if (Object.prototype.hasOwnProperty.call(vrConf, 'baseline_file')) {
        throw new Error('visual-reg.baseline_file is no longer supported; explicit paths.json metadata and per-route baselines are required');
    }
    if (Object.prototype.hasOwnProperty.call(vrConf, 'path')) {
        throw new Error('visual-reg.path single-path compatibility is no longer supported; explicit paths.json metadata is required');
    }
}
function safeModulePathSegment(moduleId) {
    const raw = typeof moduleId === 'string' ? moduleId.trim() : '';
    if (!raw)
        throw new Error('visual-reg requires explicit module identity');
    const segment = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
    if (!segment)
        throw new Error('visual-reg module identity is invalid after sanitization');
    return segment;
}
function requireRepoScopedPath(value, field) {
    if (!value)
        throw new Error(`${field} must resolve to a repo-scoped path`);
    return value;
}
function requireVisualRegViewport(vrConf) {
    const viewport = objectRecord(vrConf.viewport);
    const width = Number(viewport?.width);
    const height = Number(viewport?.height);
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!Number.isInteger(width)), () => (width <= 0))), () => (!Number.isInteger(height)))), () => (height <= 0))) {
        throw new Error('visual-reg.viewport requires positive integer width and height');
    }
    return { width, height };
}
export function resolveVisualRegProjectDir(serve = {}) {
    return serve.project_dir
        ? requireRepoScopedPath(resolveRepoScopedPath(serve.project_dir, { repoDir: DEFAULTS.repo_dir, field: 'serve.project_dir' }), 'serve.project_dir')
        : DEFAULTS.repo_dir;
}
export function resolveVisualRegBaselineDir(context = {}) {
    const moduleSegment = safeModulePathSegment(context.moduleId);
    return requireRepoScopedPath(resolveRepoScopedPath(path.join('.swarm', 'modules', moduleSegment, 'baselines'), {
        repoDir: DEFAULTS.repo_dir,
        field: 'visual-reg.baseline_dir',
    }), 'visual-reg.baseline_dir');
}
function resolveArtifactDir(context = {}) {
    const screenshotsDir = nonEmptyString(context.screenshotsDir);
    if (screenshotsDir !== null)
        return screenshotsDir;
    if (context.testsLogDir)
        return path.join(context.testsLogDir, 'visual-reg');
    const configuredResultsDir = nonEmptyString(context.resultsDir);
    const environmentResultsDir = readBusterEnvironment('BUSTER_RESULTS_DIR');
    const resultsDir = configuredResultsDir !== null
        ? configuredResultsDir
        : (environmentResultsDir === undefined ? '/home/builder/.openclaw/results' : environmentResultsDir);
    return path.join(resultsDir, 'visual-reg');
}
function resolveChildArtifactPath(dir, fileName, field) {
    const raw = fileName == null ? '' : String(fileName);
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!raw), () => (raw.includes('/')))), () => (raw.includes('\\')))), () => (raw.includes('\0')))) {
        throw new Error(`${field} must be a file name inside ${dir}`);
    }
    return requireRepoScopedPath(resolveRepoScopedPath(raw, {
        repoDir: dir,
        baseDir: dir,
        scopeDir: dir,
        field,
    }), field);
}
function baselinePathForName(baselineDir, name) {
    return resolveChildArtifactPath(baselineDir, `${name}-baseline.png`, 'visual-reg.baseline_file');
}
function outputPathForName(artifactDir, name, suffix) {
    return resolveChildArtifactPath(artifactDir, `visual-reg-${name}-${suffix}.png`, `visual-reg.${suffix}_path`);
}
function parsePathsJson(pathsJsonPath) {
    if (!fs.existsSync(pathsJsonPath)) {
        throw new Error(`Missing explicit visual-reg baseline metadata: ${pathsJsonPath}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(pathsJsonPath, 'utf8'));
    }
    catch (error) {
        throw new Error(`Invalid visual-reg paths.json: ${errorMessage(error)}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('visual-reg paths.json must be a non-empty array of route entries');
    }
    const names = new Set();
    return parsed.map((entry, index) => {
        const record = entry;
        if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!record), () => (typeof record !== 'object'))), () => (typeof record.name !== 'string'))), () => (typeof record.path !== 'string'))) {
            throw new Error(`visual-reg paths.json entry ${index} must include string name and path`);
        }
        if (names.has(record.name)) {
            throw new Error(`visual-reg paths.json contains duplicate route name: ${record.name}`);
        }
        names.add(record.name);
        if (!record.path.startsWith('/')) {
            throw new Error(`visual-reg paths.json entry ${record.name} path must start with /`);
        }
        return { name: record.name, path: record.path, ...(typeof record.nav === 'string' ? { nav: record.nav } : {}) };
    });
}
function visualDeliveryContext(ctx, moduleId, telemetryContext) {
    return {
        project: selectDefinedValue(() => nonEmptyString(ctx.project), () => nonEmptyString(ctx.config?.project)),
        run_id: ctx.runId ?? null, module_id: moduleId, attempt: ctx.attempt ?? null,
        dispatch_id: ctx.dispatchId ?? null, session_key: ctx.sessionKey ?? null,
        log_dir: selectDefinedValue(() => nonEmptyString(ctx.logDir), () => nonEmptyString(ctx.testsLogDir)),
        pipeline_log_path: ctx.pipelineLogPath ?? null,
        pipeline_run_log_path: ctx.pipelineRunLogPath ?? null,
        telemetry_context: telemetryContext,
    };
}
export async function runVisualReg(context) {
    const ctx = context;
    const log = createSuiteLog('visual-reg', 'VISUAL-REG', selectDefinedValue(() => (ctx.logSink), () => (null)));
    const tctx = selectDefinedValue(() => (ctx.telemetryContext), () => (null));
    const moduleId = safeModulePathSegment(ctx.moduleId);
    const discordDeliveryContext = visualDeliveryContext(ctx, moduleId, tctx);
    const startTime = Date.now();
    const serve = objectRecordOrEmpty(ctx.config?.serve);
    const vrConf = objectRecordOrEmpty(ctx.config?.['visual-reg']);
    const webhookUrl = resolveDiscordWebhookUrl() ?? '';
    let discordCapabilitySkip = null;
    try {
        assertNoLegacyVisualRegPathConfig(vrConf);
        resolveVisualRegProjectDir(serve);
    }
    catch (error) {
        return contractFailure(startTime, errorMessage(error), log);
    }
    if (webhookUrl) {
        const configuredCapabilities = resolveContextCapabilities(ctx);
        if (!configuredCapabilities.includes(BUSTER_CAPABILITIES.DISCORD_MEDIA)) {
            discordCapabilitySkip = deliverySkippedCapability(new Error(`Discord media upload requires ${BUSTER_CAPABILITIES.DISCORD_MEDIA}`));
            log(`Discord media upload skipped (non-critical): ${discordCapabilitySkip.error}`);
        }
    }
    const type = selectDefinedValue(() => (nonEmptyString(serve.type)), () => ('static'));
    const port = selectDefinedValue(() => (serve.port), () => ((type === 'server' ? DEFAULTS.server_port : DEFAULTS.static_port)));
    const baseUrl = `http://localhost:${port}`;
    const baselineDir = resolveVisualRegBaselineDir(ctx);
    const artifactDir = resolveArtifactDir(ctx);
    fs.mkdirSync(artifactDir, { recursive: true });
    const thresholds = objectRecord(vrConf.thresholds);
    const enforced = thresholds !== null;
    const mode = enforced ? 'enforced' : 'evidence-only';
    const pmThreshold = selectDefinedValue(() => (vrConf.pixelmatch?.threshold), () => (DEFAULTS.pixelmatch_threshold));
    log(`Baseline dir: ${baselineDir} (mode: ${mode})`);
    const pathsJsonPath = path.join(baselineDir, 'paths.json');
    let pathsJson;
    try {
        pathsJson = parsePathsJson(pathsJsonPath);
    }
    catch (error) {
        return contractFailure(startTime, errorMessage(error), log, { baseline_dir: baselineDir, paths_json: pathsJsonPath });
    }
    const { findings, pageResults, checksTotal, checksPassed, checksFailed } = await runMultiPath({
        context: ctx, pathsJson, baselineDir, artifactDir, baseUrl, pmThreshold, thresholds, enforced, log,
        viewport: () => requireVisualRegViewport(vrConf),
        fullPage: vrConf.fullPage === undefined ? true : Boolean(vrConf.fullPage),
        baselinePath: (name) => baselinePathForName(baselineDir, name),
        outputPath: (name, suffix) => outputPathForName(artifactDir, name, suffix),
    });
    const overallStatus = resolveVisualRegOverallStatus(pageResults, enforced);
    const discordMode = nonEmptyString(vrConf.discord) ?? (pathsJson.length > 3 ? 'summary' : 'all');
    const delivery = await deliverVisualResults({ moduleId, pageResults, status: overallStatus, enforced, mode: discordMode, webhookUrl, capabilitySkip: discordCapabilitySkip, deliveryContext: discordDeliveryContext, log });
    return finalizeVisualReg({ startTime, result: { findings, pageResults, checksTotal, checksPassed, checksFailed }, status: overallStatus, enforced, mode, thresholds, pathsTotal: pathsJson.length, baselineDir, discordMode: delivery.discordMode, deliveries: delivery.deliveries, moduleId, telemetryContext: tctx, log });
}
