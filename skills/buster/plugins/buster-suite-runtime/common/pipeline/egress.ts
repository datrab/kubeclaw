// Shared pipeline egress helpers.
// Values are preserved; helpers only enforce bounded output and JSON-safe shapes.

import crypto from 'crypto';
import fs from 'fs';

import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';

type JsonObject = Record<string, any>;

declare const Buffer: {
  byteLength(value: string, encoding?: string): number;
};

const EMPTY_TEXT = '';
const DISCORD_FIELD_LIMIT = 1024;
const DISCORD_CONTENT_LIMIT = 1800;
const DISCORD_DESCRIPTION_LIMIT = 1400;
const DISCORD_TITLE_LIMIT = 240;

function textValue(value: unknown) {
  return typeof value === 'string' ? value : (value == null ? EMPTY_TEXT : String(value));
}

function limitText(value: unknown, maxChars = 1200) {
  const text = textValue(value);
  if (!Number.isFinite(maxChars) || maxChars < 1) return text;
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

function cloneJsonSafe(value: any, label = 'payload', seen = new WeakSet()): any {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return { type: 'circular', label };
    seen.add(value);
    const out = value.map((entry) => cloneJsonSafe(entry, label, seen));
    seen.delete(value);
    return out;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return { type: 'circular', label };
    seen.add(value);
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value)) out[key] = cloneJsonSafe(child, key, seen);
    seen.delete(value);
    return out;
  }
  return textValue(value);
}

export function formatSummaryForDiscord(summary: unknown, maxChars = 900) {
  const text = JSON.stringify(summary, null, 2);
  return `\`\`\`json\n${limitText(text, maxChars)}\n\`\`\``;
}

export function sanitizeTelemetryPayload(payload: unknown = {}) {
  return cloneJsonSafe(payload, 'telemetry');
}

function fieldText(value: unknown, maxChars = DISCORD_FIELD_LIMIT) {
  if (value == null) return '—';
  if (typeof value === 'object') return formatSummaryForDiscord(value, maxChars);
  return limitText(value, maxChars);
}

export function sanitizeDiscordMessage(message: any = {}) {
  const sanitizeEmbedObject = (value: any, stringLimits: JsonObject) => {
    if (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))) return undefined;
    const out: JsonObject = {};
    for (const [key, maxChars] of Object.entries(stringLimits)) {
      if (value[key] != null) out[key] = limitText(value[key], maxChars as number);
    }
    return Object.keys(out).length ? out : undefined;
  };

  const sanitizeEmbed = (embed: any = {}) => {
    const out: JsonObject = {};
    if (embed.title != null) out.title = limitText(embed.title, DISCORD_TITLE_LIMIT);
    if (embed.description != null) out.description = limitText(embed.description, DISCORD_DESCRIPTION_LIMIT);
    if (embed.url != null) out.url = limitText(embed.url, 900);
    if (embed.timestamp != null) out.timestamp = limitText(embed.timestamp, 80);
    if (embed.type != null) out.type = limitText(embed.type, 80);
    if (typeof embed.color === 'number' && Number.isFinite(embed.color)) out.color = embed.color;
    const footer = sanitizeEmbedObject(embed.footer, { text: 200, icon_url: 900 });
    if (footer) out.footer = footer;
    const image = sanitizeEmbedObject(embed.image, { url: 900 });
    if (image) out.image = image;
    const thumbnail = sanitizeEmbedObject(embed.thumbnail, { url: 900 });
    if (thumbnail) out.thumbnail = thumbnail;
    const author = sanitizeEmbedObject(embed.author, { name: 250, url: 900, icon_url: 900 });
    if (author) out.author = author;
    if (Array.isArray(embed.fields)) {
      out.fields = embed.fields.slice(0, 20).map((field: any = {}) => ({
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
