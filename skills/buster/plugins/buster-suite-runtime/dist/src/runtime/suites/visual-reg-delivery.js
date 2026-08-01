import { emitPluginEvent } from '../services/telemetry.js';
import { createSuiteVerdict, STATUS } from '../services/verdict-schema.js';
import { discordSingle, discordSummary } from './visual-reg-discord.js';
function isDeliveryResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const status = value.status;
    return ['sent', 'skipped_no_webhook', 'skipped_capability', 'failed_noncritical'].includes(status ?? '')
        && typeof value.sent === 'boolean';
}
export function summarizeDiscordDelivery(results = []) {
    results.forEach((result) => { if (!isDeliveryResult(result))
        throw new Error('visual-reg Discord delivery result must be a typed delivery result'); });
    const sent = results.filter((result) => result.status === 'sent' && result.sent).length;
    const failed = results.filter((result) => result.status === 'failed_noncritical').length;
    const skipped = results.filter((result) => ['skipped_no_webhook', 'skipped_capability'].includes(result.status)).length;
    const skippedCapability = results.filter((result) => result.status === 'skipped_capability').length;
    let status = 'not_attempted';
    if (results.length > 0)
        status = sent === results.length ? 'sent'
            : skippedCapability === results.length ? 'skipped_capability'
                : skipped === results.length ? 'skipped_no_webhook'
                    : failed === results.length ? 'failed_noncritical' : sent > 0 ? 'partial' : failed > 0 ? 'failed_noncritical' : 'skipped';
    return { discord_sent: sent > 0, discord_status: status, discord_attempts: results.length, discord_successes: sent,
        discord_failures: failed, discord_skipped: skipped, discord_skipped_capability: skippedCapability };
}
export function resolveVisualRegOverallStatus(results, enforced = false) {
    if (results.some((result) => result.status === STATUS.ERROR))
        return STATUS.ERROR;
    if (results.some((result) => result.status === STATUS.FAIL))
        return enforced ? STATUS.FAIL : STATUS.ERROR;
    return STATUS.PASS;
}
export async function deliverVisualResults(input) {
    const deliveries = [];
    if (input.capabilitySkip)
        deliveries.push(input.capabilitySkip);
    else if (input.mode === 'summary')
        deliveries.push(await discordSummary(input.moduleId, input.pageResults, input.status, input.enforced, {
            webhookUrl: input.webhookUrl, discordDiffThreshold: 2, log: input.log, deliveryContext: input.deliveryContext,
        }));
    else
        for (const page of input.pageResults)
            if (page.actualPath)
                deliveries.push(await discordSingle(input.moduleId, page.name, page.actualPath, page.diffPath ?? null, page.diffPercent ?? 0, page.status, { webhookUrl: input.webhookUrl, log: input.log, deliveryContext: input.deliveryContext }));
    return { deliveries, discordMode: input.mode };
}
export async function finalizeVisualReg(input) {
    const duration_ms = Date.now() - input.startTime;
    const discord = summarizeDiscordDelivery(input.deliveries);
    const compared = input.result.pageResults.filter((page) => page.diffPercent != null).length;
    input.log(`${input.status === STATUS.PASS ? '✅' : '⚠️'} ${input.mode}: ${input.result.checksPassed}/${input.result.checksTotal} passed (${duration_ms}ms)`);
    await emitPluginEvent(input.telemetryContext, 'visual_reg', { module_id: input.moduleId, mode: 'multi_path', pages_total: input.pathsTotal,
        pages_compared: compared, pages_skipped: 0, page_results: input.result.pageResults.map((page) => ({ name: page.name, status: page.status, diff_percent: page.diffPercent })), overall: input.status, ...discord });
    return createSuiteVerdict('visual-reg', input.status, { critical: false, duration_ms, checks_total: input.result.checksTotal,
        checks_passed: input.result.checksPassed, checks_failed: input.result.checksFailed, findings: input.result.findings,
        metadata: { tool: 'pixelmatch', mode: input.mode, multi_path: true, pages_total: input.pathsTotal, pages_compared: compared,
            pages_skipped: 0, baseline_dir: input.baselineDir, discord_mode: input.discordMode, ...discord,
            page_results: input.result.pageResults.map((page) => ({ name: page.name, status: page.status, diff_percent: page.diffPercent })),
            ...(input.enforced ? { thresholds: input.thresholds } : {}) } });
}
