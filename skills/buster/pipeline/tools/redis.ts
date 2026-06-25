#!/usr/bin/env node
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { fileURLToPath } from 'url';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import process from 'process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
import { parseCliFlagValues } from '../cli-args.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { resolveDiscordWebhookUrl } from '../services/runtime.ts';
import { loadBusterPlatformConfig } from '../services/runtime-policy.ts';
import { formatSummaryForDiscord, summarizePayloadForDiscord } from '../redaction.ts';
import { assertRedisTaskEntry, buildRedisTaskStreamEntry } from '../services/redis-message-contract.ts';
import { createRedisEventBus, createRedisTaskQueue } from '../services/task-transport-contract.ts';
import { sendDiscord } from '../services/discord.ts';

// DELETE_LEGACY: direct completion emission and implicit sender/consumer
// identities are removed. Producer and consumer identity must be explicit typed
// metadata via AGENT_NAME and REDIS_CONSUMER_NAME/AGENT_CONSUMER_NAME.
// KEEP_TYPED_POLICY: legacy send/read tool modes and target aliases remain as
// external CLI adapter surface; Redis ready/BUSYGROUP startup races and
// publish-side Discord notification failures remain noncritical.

type AnyRecord = Record<string, any>;

type RedisClient = AnyRecord;

interface PublishOptions {
  sender?: string;
  source?: string;
}

interface ReadOptions {
  consumerName?: string;
}

let _redis: RedisClient | null = null;

function redisReadyTimeoutMs(): number {
  const config = loadBusterPlatformConfig();
  const timeoutMs = Number(config?.gateway?.health?.ready_timeout_ms);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('config.gateway.health.ready_timeout_ms: required positive number in swarm.config.json');
  }
  return timeoutMs;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

function getRequiredEnv(name: string, value: unknown): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required explicit Redis task identity metadata`);
  return normalized;
}

function getRedis(): RedisClient {
  if (!_redis) {
    _redis = createRedisClient(loadRedisCtor(), {}, {
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    }) as RedisClient;
    _redis.on('error', (err: unknown) => console.error('[Redis Error]', errorMessage(err)));
  }
  return _redis as RedisClient;
}

export function waitForRedisReady(redis: RedisClient, timeoutMs = redisReadyTimeoutMs()): Promise<void> {
  if (redis.status === 'ready') return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (): void => {
      redis.off?.('ready', onReady);
      redis.off?.('error', onError);
      redis.off?.('end', onEnd);
      redis.off?.('close', onClose);
      if (timeout) clearTimeout(timeout);
    };
    const settle = (fn: (value?: any) => void, value?: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onReady = (): void => settle(resolve);
    const onError = (err: unknown): void => settle(reject, err instanceof Error ? err : new Error(String(err || 'Redis connection failed')));
    const onEnd = (): void => settle(reject, new Error('Redis connection ended before ready'));
    const onClose = (): void => settle(reject, new Error('Redis connection closed before ready'));

    redis.once('ready', onReady);
    redis.once('error', onError);
    redis.once('end', onEnd);
    redis.once('close', onClose);
    timeout = setTimeout(() => {
      settle(reject, new Error(`Redis did not become ready within ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

const WEBHOOK_URL = resolveDiscordWebhookUrl();

async function logToDiscord(sender: string, target: string, type: string, iter: number | string, payload: unknown): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    const taskPayload = payload && typeof payload === 'object' ? payload as AnyRecord : {};
    const header = `**${sender}** → **${target}**\nType: \`${type}\` | Iter: \`${iter}\``;
    const payloadSummary = summarizePayloadForDiscord(payload, 'task_payload');
    await sendDiscord({
      embeds: [{
        title: `⚡ Task: ${sender} → ${target}`,
        color: 5763719,
        description: `${header}\n\nPayload redacted by default.`,
        fields: [{ name: 'Payload', value: formatSummaryForDiscord(payloadSummary), inline: false }],
      }],
    }, {
      project: taskPayload.project || null,
      run_id: taskPayload.run_id || null,
      module_id: taskPayload.gate_id ? null : (taskPayload.module_id || taskPayload.module || null),
      gate_id: taskPayload.gate_id || null,
      gate_type: taskPayload.gate_type || taskPayload.gateType || null,
      attempt: taskPayload.attempt ?? iter,
      dispatch_id: taskPayload.dispatch_id || null,
      session_key: taskPayload.session_key || taskPayload.session?.label || null,
      pipeline_log_path: taskPayload.pipeline_log_path || null,
      pipeline_run_log_path: taskPayload.pipeline_run_log_path || null,
      webhook_url: WEBHOOK_URL,
    });
  } catch (_error) {
    // Discord is noncritical operator notification policy.
  }
}

const TARGET_STREAMS: Record<string, string> = {
  dev: 'swarm:forge:tasks',
  forge: 'swarm:forge:tasks',
  review: 'swarm:echo:tasks',
  echo: 'swarm:echo:tasks',
  test: 'swarm:buster:tasks',
  buster: 'swarm:buster:tasks',
};

const lib = {
  get client(): RedisClient { return getRedis(); },

  async publishTask(targetAgent: string, type: string, payload: unknown, iteration: number | string = 1, options: PublishOptions = {}): Promise<Record<string, unknown>> {
    const targetKey = String(targetAgent || '').toLowerCase();
    const streamKey = TARGET_STREAMS[targetKey];
    if (!streamKey) throw new Error(`Unknown target: ${targetAgent}`);

    const sender = getRequiredEnv('AGENT_NAME', options.sender || process.env.AGENT_NAME);
    const source = getRequiredEnv('task source', options.source || sender);
    const redis = getRedis();

    try {
      await waitForRedisReady(redis);
    } catch (error) {
      await lib.disconnect();
      throw error;
    }

    const taskEntry = buildRedisTaskStreamEntry({ type, sender, source, payload, iteration });
    assertRedisTaskEntry(taskEntry, { requireStreamId: false, requireCanonicalEnvelope: true });

    const published = await createRedisEventBus(redis).publish(streamKey, taskEntry);
    const id = published.id;

    console.error(`[Redis] Sent ${id} to ${streamKey}`);
    await logToDiscord(sender, targetKey, type, iteration, payload);
    return { status: 'sent', id, stream: streamKey };
  },

  async readMyTasks(count = 1, options: ReadOptions = {}): Promise<unknown> {
    const myName = getRequiredEnv('AGENT_NAME', process.env.AGENT_NAME);
    const consumerIdentity = getRequiredEnv(
      'REDIS_CONSUMER_NAME',
      options.consumerName || process.env.REDIS_CONSUMER_NAME || process.env.AGENT_CONSUMER_NAME,
    );

    const streamKey = `swarm:${myName}:tasks`;
    const groupName = `${myName}-group`;
    const consumerName = `${myName}-${consumerIdentity}`;
    const redis = getRedis();

    try {
      await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
    } catch (error) {
      if (!errorMessage(error).includes('BUSYGROUP')) throw error;
    }

    return await redis.xreadgroup('GROUP', groupName, consumerName, 'COUNT', count, 'BLOCK', 2000, 'STREAMS', streamKey, '>');
  },

  async disconnect(): Promise<void> {
    if (_redis) {
      await _redis.quit();
      _redis = null;
    }
  },
};

export default lib;

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  (async () => {
    try {
      const flags = parseCliFlagValues(process.argv.slice(2), {
        flags: {
          action: { type: 'string', required: true },
          target: { type: 'string' },
          type: { type: 'string' },
          iteration: { type: 'string', default: '1' },
          payload: { type: 'string', default: '{}' },
          consumer: { type: 'string' },
        },
      }) as Record<string, string | undefined>;
      const action = flags.action;

      if (action === 'send') {
        const target = flags.target;
        const type = flags.type;
        const iter = flags.iteration || '1';
        const payload = JSON.parse(flags.payload || '{}');
        if (!target || !type) throw new Error('Missing --target or --type');

        const res = await lib.publishTask(target, type, payload, iter);
        console.log(JSON.stringify(res));
      } else if (action === 'read') {
        const res = await lib.readMyTasks(1, flags.consumer ? { consumerName: flags.consumer } : {});
        console.log(JSON.stringify(res, null, 2));
      } else {
        throw new Error('Unknown action. Use --action send|read. Completion emission is owned by buster-pipeline.ts.');
      }
    } catch (error) {
      console.error(JSON.stringify({ error: errorMessage(error) }));
      await lib.disconnect();
      process.exit(1);
    }
    await lib.disconnect();
    process.exit(0);
  })();
}
