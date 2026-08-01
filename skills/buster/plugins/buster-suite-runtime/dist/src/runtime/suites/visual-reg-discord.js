import fs from 'fs';
import { Buffer } from 'buffer';
import { STATUS } from '../services/verdict-schema.js';
import { deliverDiscordWebhookRequest } from '../services/discord.js';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// KEEP_TYPED_POLICY: Discord media upload is optional, noncritical, and bounded
// to Discord-friendly embed/file limits. Delivery failures must not replace the
// visual-reg verdict authority.
const DEFAULT_DISCORD_DIFF_THRESHOLD = 2;
const DISCORD_DELIVERY_FAILED_DETAIL = 'discord delivery failed';
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (selectTruthyValue(() => (selectTruthyValue(() => (error === undefined), () => (error === null))), () => (error === '')))
        return DISCORD_DELIVERY_FAILED_DETAIL;
    return String(error);
}
function deliverySkippedNoWebhook() {
    return { status: 'skipped_no_webhook', sent: false };
}
export function deliverySkippedCapability(error) {
    return { status: 'skipped_capability', sent: false, error: errorMessage(error) };
}
function deliverySent() {
    return { status: 'sent', sent: true };
}
function deliveryFailed(error) {
    return { status: 'failed_noncritical', sent: false, error: errorMessage(error) };
}
function buildDeliveryContext(moduleId, options = {}) {
    const deliveryContext = options.deliveryContext && typeof options.deliveryContext === 'object' ? options.deliveryContext : {};
    return {
        ...deliveryContext,
        module_id: visualDeliveryModuleId(deliveryContext, moduleId),
        telemetry_context: selectDefinedValue(() => (options.telemetryContext), () => (null)),
    };
}
function visualDeliveryModuleId(deliveryContext, moduleId) {
    if (typeof deliveryContext.module_id === 'string' && deliveryContext.module_id)
        return deliveryContext.module_id;
    return moduleId;
}
function pageStatusIcon(status) {
    if (status === STATUS.PASS)
        return '✅';
    if (status === STATUS.FAIL)
        return '❌';
    if (status === STATUS.SKIP)
        return '⏭️';
    return '⚠️';
}
function buildSummaryEmbed(moduleId, pageResults, overallStatus, enforced) {
    const passCount = pageResults.filter((page) => page.status === STATUS.PASS).length;
    const failCount = pageResults.filter((page) => page.status === STATUS.FAIL).length;
    const skipCount = pageResults.filter((page) => page.status === STATUS.SKIP || page.status === STATUS.ERROR).length;
    const lines = pageResults.map((page) => `${pageStatusIcon(page.status)} **${page.name}** — ${page.diffPercent === null ? '—' : `${page.diffPercent}%`}`);
    return {
        title: `${overallStatus === STATUS.PASS ? '✅' : '⚠️'} Visual Regression: Module ${moduleId}`,
        color: overallStatus === STATUS.PASS ? 5763719 : 16776960,
        description: [`**${passCount}** pass · **${failCount}** fail · **${skipCount}** skip`, `Mode: ${enforced ? 'enforced' : 'evidence-only'}`, '', lines.join('\n')].join('\n'),
        footer: { text: `Buster Visual-Reg • ${pageResults.length} pages • ${new Date().toISOString()}` },
    };
}
function collectSummaryAttachments(pageResults, threshold) {
    return pageResults
        .filter((page) => typeof page.diffPercent === 'number' && page.diffPercent > threshold && page.diffPath && fs.existsSync(page.diffPath))
        .map((page) => ({ path: page.diffPath, filename: `diff-${page.name}.png` }));
}
function multipartBody(boundary, embed, attachments) {
    const bodyParts = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ embeds: [embed] })}`, 'utf8')];
    attachments.slice(0, 10).forEach((attachment, index) => {
        bodyParts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files[${index}]"; filename="${attachment.filename}"\r\nContent-Type: image/png\r\n\r\n`, 'utf8'));
        bodyParts.push(fs.readFileSync(attachment.path));
    });
    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
    return Buffer.concat(bodyParts);
}
export async function discordSummary(moduleId, pageResults, overallStatus, enforced, { webhookUrl = '', discordDiffThreshold = DEFAULT_DISCORD_DIFF_THRESHOLD, log = () => { }, deliveryContext = null, telemetryContext = null } = {}) {
    if (!webhookUrl)
        return deliverySkippedNoWebhook();
    try {
        const embed = buildSummaryEmbed(moduleId, pageResults, overallStatus, enforced);
        const attachments = collectSummaryAttachments(pageResults, discordDiffThreshold);
        if (attachments.length > 0 && attachments.length <= 4) {
            embed.image = { url: `attachment://${attachments[0].filename}` };
        }
        const boundary = `----VisRegSummary${Date.now()}`;
        const maxAttach = Math.min(attachments.length, 10);
        await deliverDiscordWebhookRequest({
            webhook_url: webhookUrl,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: multipartBody(boundary, embed, attachments),
        }, buildDeliveryContext(moduleId, { deliveryContext, telemetryContext }));
        log(`Discord: summary sent (${pageResults.length} pages, ${maxAttach} diff images attached)`);
        return deliverySent();
    }
    catch (error) {
        log(`Discord summary failed (non-critical): ${errorMessage(error)}`);
        return deliveryFailed(error);
    }
}
function singleStatusPresentation(status, diffPercent) {
    const isAppShot = status === 'APP_SCREENSHOT';
    const isBaseline = status === 'NEW_BASELINE';
    let icon = '📸';
    if (isBaseline)
        icon = '🆕';
    else if (status === STATUS.PASS)
        icon = '✅';
    else if (status === STATUS.FAIL)
        icon = '❌';
    let description = `**${diffPercent}%** pixel difference detected.`;
    if (isAppShot)
        description = 'Current state of the running application.';
    else if (isBaseline)
        description = 'New baseline generated from HTML design reference.';
    else if (diffPercent === 0)
        description = 'Pixel-perfect match with baseline.';
    return { isAppShot, isBaseline, icon, description };
}
function buildSingleEmbed(moduleId, pageName, diffPercent, status) {
    const view = singleStatusPresentation(status, diffPercent);
    const color = view.isAppShot ? 5793266 : view.isBaseline ? 3447003 : (diffPercent === 0 ? 5763719 : (diffPercent > 5 ? 15548997 : 16776960));
    const fields = [
        { name: 'Page', value: pageName, inline: true },
        { name: 'Status', value: view.isAppShot ? 'Live' : view.isBaseline ? 'Baseline' : status, inline: true },
    ];
    if (!view.isAppShot && !view.isBaseline)
        fields.push({ name: 'Diff', value: `${diffPercent}%`, inline: true });
    return {
        title: `${view.icon} ${view.isAppShot ? 'Live App' : 'Visual Regression'}: ${pageName} (${moduleId})`,
        color,
        description: view.description,
        fields,
        image: { url: 'attachment://screenshot.png' },
        footer: { text: `Buster Visual-Reg • ${new Date().toISOString()}` },
    };
}
export async function discordSingle(moduleId, pageName, actualPath, diffPath, diffPercent, status, { webhookUrl = '', log = () => { }, deliveryContext = null, telemetryContext = null } = {}) {
    if (!webhookUrl)
        return deliverySkippedNoWebhook();
    try {
        const boundary = `----VisRegBoundary${Date.now()}`;
        const attachments = [{ path: actualPath, filename: 'screenshot.png' }];
        if (diffPath && diffPercent > 0 && fs.existsSync(diffPath))
            attachments.push({ path: diffPath, filename: 'diff.png' });
        await deliverDiscordWebhookRequest({
            webhook_url: webhookUrl,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: multipartBody(boundary, buildSingleEmbed(moduleId, pageName, diffPercent, status), attachments),
        }, buildDeliveryContext(moduleId, { deliveryContext, telemetryContext }));
        log(`Discord: ${pageName} sent`);
        return deliverySent();
    }
    catch (error) {
        log(`Discord screenshot failed (non-critical): ${errorMessage(error)}`);
        return deliveryFailed(error);
    }
}
