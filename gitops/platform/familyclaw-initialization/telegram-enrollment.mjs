import { generateKeyPairSync, privateDecrypt, constants, createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const bot = 'N0vbot12000bot';
const name = 'familyclaw-telegram';
const input = '/work/telegram-envelope.txt';
const kubectl = (...args) => execFileSync('kubectl', ['-n', 'familyclaw', ...args], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
});

async function main() {
  const existing = kubectl('get', 'secret', name, '--ignore-not-found', '-o', 'json');
  if (existing.trim()) {
    const secret = JSON.parse(existing);
    if (secret.metadata.annotations?.['familyclaw.io/telegram-bot'] !== bot || !secret.data?.TELEGRAM_BOT_TOKEN) {
      throw new Error('existing_secret_mismatch');
    }
    console.log(JSON.stringify({ state: 'already_stored', bot }));
    return;
  }
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const requestId = createHash('sha256').update(spki).digest('hex').slice(0, 24);
  const expiresAt = new Date(Date.now() + 7200000).toISOString();
  console.log(JSON.stringify({ state: 'waiting_for_encrypted_token', bot, requestId, expiresAt,
    publicKeySpki: spki.toString('base64') }));
  while (Date.now() < Date.parse(expiresAt)) {
    if (!existsSync(input)) { await setTimeout(1000); continue; }
    const envelope = readFileSync(input, 'utf8').trim();
    unlinkSync(input);
    try {
      const [prefix, id, encoded, ...extra] = envelope.split(':');
      if (prefix !== 'FAMILYCLAW_TELEGRAM_V1' || id !== requestId || extra.length ||
          !/^[A-Za-z0-9+/]{512}$/.test(encoded)) throw new Error('envelope_format');
      const token = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256' }, Buffer.from(encoded, 'base64')).toString('utf8').trim();
      if (!/^[0-9]{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('token_format');
      // Catch network errors locally; URL/response details must never reach logs.
      const telegram = async method => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${token}/${method}`,
            { method: 'POST', signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error();
          const body = await response.json();
          if (body.ok !== true) throw new Error();
          return body.result;
        } catch { throw new Error('telegram_verification_failed'); }
      };
      const identity = await telegram('getMe');
      if (identity.is_bot !== true || identity.username?.toLowerCase() !== bot.toLowerCase()) {
        throw new Error('wrong_bot');
      }
      if ((await telegram('getWebhookInfo')).url) throw new Error('existing_webhook');
      const secret = { apiVersion: 'v1', kind: 'Secret', type: 'Opaque',
        metadata: { name, namespace: 'familyclaw',
          labels: { 'app.kubernetes.io/part-of': 'familyclaw' },
          annotations: { 'familyclaw.io/telegram-bot': bot } },
        stringData: { TELEGRAM_BOT_TOKEN: token } };
      try {
        execFileSync('kubectl', ['-n', 'familyclaw', 'create', '-f', '-'], {
          input: JSON.stringify(secret), encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
        });
      } catch {
        // A timed-out create can have succeeded: stop and inspect, never retry.
        console.log(JSON.stringify({ state: 'storage_result_requires_inspection', bot }));
        return;
      }
      console.log(JSON.stringify({ state: 'stored', bot, secret: name, channelEnabled: false }));
      return;
    } catch (error) {
      const safe = new Set(['envelope_format', 'token_format', 'telegram_verification_failed', 'wrong_bot', 'existing_webhook']);
      console.log(JSON.stringify({ state: 'rejected', code: safe.has(error.message) ? error.message : 'invalid_envelope' }));
    }
  }
  console.log(JSON.stringify({ state: 'expired', bot, channelEnabled: false }));
}

main().catch(() => { console.error('Telegram enrollment failed; no credential details emitted.'); process.exitCode = 1; });
