// Shared pipeline egress helpers.
// Values are preserved; helpers only enforce bounded output and JSON-safe shapes.
import crypto from 'crypto';
import fs from 'fs';
import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';
const EMPTY_TEXT = '';
const DISCORD_FIELD_LIMIT = 1024;
const DISCORD_CONTENT_LIMIT = 1800;
const DISCORD_DESCRIPTION_LIMIT = 1400;
const DISCORD_TITLE_LIMIT = 240;
function textValue(value) {
    return typeof value === 'string' ? value : (value == null ? EMPTY_TEXT : String(value));
}
function limitText(value, maxChars = 1200) {
    const text = textValue(value);
    if (!Number.isFinite(maxChars) || maxChars < 1)
        return text;
    return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}
export function shortHash(value) {
    return crypto.createHash('sha256').update(textValue(value)).digest('hex').slice(0, 16);
}
export function limitEgressText(value, maxChars = 1200) {
    return limitText(value, maxChars);
}
export function buildEgressPreview(value, label = 'content') {
    return limitText(value, label === 'content' ? 1200 : 500);
}
function cloneJsonSafe(value, label = 'payload', seen = new WeakSet()) {
    if (value == null)
        return value;
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (typeof value === 'bigint')
        return value.toString();
    if (Array.isArray(value)) {
        if (seen.has(value))
            return { type: 'circular', label };
        seen.add(value);
        const out = value.map((entry) => cloneJsonSafe(entry, label, seen));
        seen.delete(value);
        return out;
    }
    if (typeof value === 'object') {
        if (seen.has(value))
            return { type: 'circular', label };
        seen.add(value);
        const out = {};
        for (const [key, child] of Object.entries(value))
            out[key] = cloneJsonSafe(child, key, seen);
        seen.delete(value);
        return out;
    }
    return textValue(value);
}
export function sanitizeTranscriptDetail(value, _label = 'transcript_detail') {
    if (selectTruthyValue(() => (value == null), () => (value === '')))
        return null;
    return limitText(value, 500);
}
export function sanitizeAcpTranscriptEvidence(transcript, label = 'transcript') {
    if (transcript == null)
        return null;
    return cloneJsonSafe(transcript, label);
}
export function summarizeStructuredValue(value, label = 'payload') {
    let json = '';
    try {
        json = JSON.stringify(selectDefinedValue(() => (value), () => (null)));
    }
    catch (error) {
        json = `[unserializable ${label}: ${limitText(error?.message || error, 240)}]`;
    }
    const objectValue = value && typeof value === 'object' ? value : null;
    const keys = objectValue && !Array.isArray(objectValue) ? Object.keys(objectValue).slice(0, 12) : [];
    const summary = {
        label,
        value_type: Array.isArray(value) ? 'array' : typeof value,
        json_bytes: Buffer.byteLength(textValue(json), 'utf8'),
        sha256: shortHash(json),
    };
    if (keys.length > 0)
        summary.keys = keys;
    if (Array.isArray(value))
        summary.item_count = value.length;
    return summary;
}
export function sanitizeJsonEgress(payload = {}, label = 'egress') {
    return cloneJsonSafe(payload, label);
}
export function sanitizeMarkdownText(markdown = '') {
    return textValue(markdown);
}
export function formatSummaryForDiscord(summary, maxChars = 900) {
    const text = JSON.stringify(summary, null, 2);
    return `\`\`\`json\n${limitText(text, maxChars)}\n\`\`\``;
}
export function sanitizeTelemetryPayload(payload = {}) {
    return cloneJsonSafe(payload, 'telemetry');
}
function fieldText(value, maxChars = DISCORD_FIELD_LIMIT) {
    if (value == null)
        return '—';
    if (typeof value === 'object')
        return formatSummaryForDiscord(value, maxChars);
    return limitText(value, maxChars);
}
export function sanitizeDiscordMessage(message = {}) {
    const sanitizeEmbedObject = (value, stringLimits) => {
        if (selectTruthyValue(() => (!value), () => (typeof value !== 'object')))
            return undefined;
        const out = {};
        for (const [key, maxChars] of Object.entries(stringLimits)) {
            if (value[key] != null)
                out[key] = limitText(value[key], maxChars);
        }
        return Object.keys(out).length ? out : undefined;
    };
    const sanitizeEmbed = (embed = {}) => {
        const out = {};
        if (embed.title != null)
            out.title = limitText(embed.title, DISCORD_TITLE_LIMIT);
        if (embed.description != null)
            out.description = limitText(embed.description, DISCORD_DESCRIPTION_LIMIT);
        if (embed.url != null)
            out.url = limitText(embed.url, 900);
        if (embed.timestamp != null)
            out.timestamp = limitText(embed.timestamp, 80);
        if (embed.type != null)
            out.type = limitText(embed.type, 80);
        if (typeof embed.color === 'number' && Number.isFinite(embed.color))
            out.color = embed.color;
        const footer = sanitizeEmbedObject(embed.footer, { text: 200, icon_url: 900 });
        if (footer)
            out.footer = footer;
        const image = sanitizeEmbedObject(embed.image, { url: 900 });
        if (image)
            out.image = image;
        const thumbnail = sanitizeEmbedObject(embed.thumbnail, { url: 900 });
        if (thumbnail)
            out.thumbnail = thumbnail;
        const author = sanitizeEmbedObject(embed.author, { name: 250, url: 900, icon_url: 900 });
        if (author)
            out.author = author;
        if (Array.isArray(embed.fields)) {
            out.fields = embed.fields.slice(0, 20).map((field = {}) => ({
                name: fieldText(field.name, 250),
                value: fieldText(field.value, DISCORD_FIELD_LIMIT),
                inline: field.inline === true,
            }));
        }
        return out;
    };
    return {
        content: message.content ? limitText(message.content, DISCORD_CONTENT_LIMIT) : undefined,
        embeds: Array.isArray(message.embeds) ? message.embeds.map(sanitizeEmbed) : undefined,
        files: [],
    };
}
export function summarizePayloadForDiscord(payload, label = 'payload') {
    return {
        ...summarizeStructuredValue(payload, label),
        preview: limitText(JSON.stringify(selectDefinedValue(() => (payload), () => (null))), 900),
    };
}
export function writePromptArtifact(filePath, prompt, meta = {}) {
    const text = textValue(prompt);
    const content = [
        '# Prompt artifact',
        '',
        '| Field | Value |',
        '| --- | --- |',
        `| chars | ${text.length} |`,
        `| lines | ${text ? text.split(/\r?\n/).length : 0} |`,
        `| sha256 | ${shortHash(text)} |`,
        ...Object.entries(meta)
            .filter(([, value]) => value != null && value !== '')
            .map(([key, value]) => `| ${key} | ${limitText(value, 240)} |`),
        '',
        '```text',
        text,
        '```',
        '',
    ].join('\n');
    fs.writeFileSync(filePath, content);
}
export function copyTranscriptArtifact(sourcePath, destPath) {
    fs.copyFileSync(sourcePath, destPath);
}
