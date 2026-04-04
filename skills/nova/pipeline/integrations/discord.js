import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';

function curlPost(url, jsonPayload, opts = {}) {
  execFileSync('curl', ['-s', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', jsonPayload, url], { stdio: 'ignore', timeout: 10000, ...opts });
}

// Discord embed limits: field name ≤ 256 chars, field value ≤ 1024 chars,
// description ≤ 4096 chars (keep under 500 for readability), title ≤ 256 chars.
// Use truncateForDiscord() from services/failures.js when building field values.
export async function discord(config, level, title, description, fields = []) {
  try {
    if (config._runLogDir || config._logDir) {
      try {
        const logDir = config._runLogDir || path.join(config._logDir, 'pipeline');
        const entry = { ts: new Date().toISOString(), level, title, description, fields };
        fs.appendFileSync(path.join(logDir, 'discord.jsonl'), JSON.stringify(entry) + '\n');
      } catch {}
    }
    if (!config.discord_webhook_url) return;
    if (!config.discord_alerts?.[level.toLowerCase()]) return;
    const colors = { INFO: 0x3498db, WARN: 0xe67e22, CRITICAL: 0xe74c3c, OK: 0x2ecc71 };
    const icons = { INFO: 'ℹ️', WARN: '⚠️', CRITICAL: '🚨', OK: '✅' };
    const payload = { embeds: [{ title: `${icons[level] || ''} ${title}`, description, color: colors[level] || 0x95a5a6, fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: f.inline ?? true })), footer: { text: `KubeClaw Pipeline · ${config.project}` }, timestamp: new Date().toISOString() }] };
    curlPost(config.discord_webhook_url, JSON.stringify(payload));
  } catch {
    log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
  }
}
export { curlPost };
