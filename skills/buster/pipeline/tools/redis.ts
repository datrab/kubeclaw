#!/usr/bin/env node
import { fileURLToPath } from 'url';
import process from 'process';
import fs from 'fs';
import { parseCliFlagValues } from '../cli-args.ts';
import { createRedisClient, loadRedisCtor } from '../telemetry.ts';
import { resolveDiscordWebhookUrl } from '../services/runtime.ts';
import { loadBusterGatewayHealthPolicy } from '../services/runtime-policy.ts';
import { formatSummaryForDiscord, summarizePayloadForDiscord } from '../egress.ts';
import { assertRedisTaskEntry, buildRedisTaskStreamEntry } from '../services/redis-message-contract.ts';
import { createRedisEventBus, createRedisTaskQueue } from '../services/task-transport-contract.ts';
import { sendDiscord } from '../services/discord.ts';
import { waitForRedisReady as waitForRedisTransportReady } from '../redis-transport.ts';
import { errorMessage } from '../value-boundary.ts';
import { readBusterEnvironment } from '../runtime-environment.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// DELETE_LEGACY: direct completion emission and implicit sender/consumer
// identities are removed. Producer and consumer identity must be explicit typed
// metadata via AGENT_NAME and REDIS_CONSUMER_NAME/AGENT_CONSUMER_NAME.
// KEEP_TYPED_POLICY: legacy send/read tool modes and target aliases remain as
// external CLI adapter surface; Redis ready/BUSYGROUP startup races and
// publish-side Discord notification failures remain noncritical.

type AnyRecord = Record<string, any>;

type RedisClient = AnyRecord & {
  once(event: string, listener: (...args: any[]) => void): unknown;
};

interface PublishOptions {
  sender?: string;
  source?: string;
}

interface ReadOptions {
  consumerName?: string;
}

const redisToolState: { redis: RedisClient | null } = { redis: null };

function redisReadyTimeoutMs(): number {
  return loadBusterGatewayHealthPolicy().readyTimeoutMs;
}

function stringValue(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function getRequiredEnv(name: string, value: unknown): string {
  const normalized = stringValue(value).trim();
  if (!normalized) throw new Error(`${name} is required explicit Redis task identity metadata`);
  return normalized;
}

function getRedis(): RedisClient {
  if (!redisToolState.redis) {
    redisToolState.redis = createRedisClient(loadRedisCtor(), {}, {
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableReadyCheck: true,
    }) as RedisClient;
    redisToolState.redis.on('error', (err: unknown) => console.error('[Redis Error]', errorMessage(err)));
  }
  return redisToolState.redis as RedisClient;
}

export function waitForRedisReady(redis: RedisClient, timeoutMs = redisReadyTimeoutMs()): Promise<void> {
  return waitForRedisTransportReady(redis, timeoutMs);
}

const WEBHOOK_URL = resolveDiscordWebhookUrl();

function shouldNotifyRedisTaskPayload(target: string, taskPayload: AnyRecord): boolean {
  if (target !== 'buster') return true;
  return !['module_test', 'gate_test'].includes(String(taskPayload.task_type || ''));
}

async function logToDiscord(sender: string, target: string, type: string, iter: number | string, payload: unknown): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    const taskPayload = payload && typeof payload === 'object' ? payload as AnyRecord : {};
    if (!shouldNotifyRedisTaskPayload(target, taskPayload)) return;
    const header = `**${sender}** → **${target}**\nType: \`${type}\` | Iter: \`${iter}\``;
    const payloadSummary = summarizePayloadForDiscord(payload, 'task_payload');
    await sendDiscord({
      embeds: [{
        title: `⚡ Task: ${sender} → ${target}`,
        color: 5763719,
        description: `${header}\n\nPayload shown with bounded formatting.`,
        fields: [{ name: 'Payload', value: formatSummaryForDiscord(payloadSummary), inline: false }],
      }],
    }, {
      project: selectTruthyValue(() => (taskPayload.project), () => (null)),
      run_id: selectTruthyValue(() => (taskPayload.run_id), () => (null)),
      module_id: taskPayload.gate_id ? null : (selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.module_id), () => (taskPayload.module))), () => (null))),
      gate_id: selectTruthyValue(() => (taskPayload.gate_id), () => (null)),
      gate_type: selectTruthyValue(() => (taskPayload.gate_type), () => (null)),
      attempt: taskAttemptAuthority(taskPayload, iter),
      dispatch_id: selectTruthyValue(() => (taskPayload.dispatch_id), () => (null)),
      session_key: selectTruthyValue(() => (selectTruthyValue(() => (taskPayload.session_key), () => (taskPayload.session?.label))), () => (null)),
      pipeline_log_path: selectTruthyValue(() => (taskPayload.pipeline_log_path), () => (null)),
      pipeline_run_log_path: selectTruthyValue(() => (taskPayload.pipeline_run_log_path), () => (null)),
      webhook_url: WEBHOOK_URL,
    });
  } catch (_error) { /* INTENTIONAL_NONCRITICAL(noncritical_side_effect_failed): this side effect is noncritical and the owning operation remains authoritative. */
    // Discord is noncritical operator notification policy.
  }
}

function taskAttemptAuthority(taskPayload: Record<string, any>, iter: number | string): number {
  if (taskPayload.attempt !== undefined && taskPayload.attempt !== null) return taskPayload.attempt;
  return Number(iter);
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
    const targetKey = stringValue(targetAgent).toLowerCase();
    const streamKey = TARGET_STREAMS[targetKey];
    if (!streamKey) throw new Error(`Unknown target: ${targetAgent}`);

    const senderInput = options.sender !== undefined ? options.sender : readBusterEnvironment('AGENT_NAME');
    const sender = getRequiredEnv('AGENT_NAME', senderInput);
    const sourceInput = options.source !== undefined ? options.source : sender;
    const source = getRequiredEnv('task source', sourceInput);
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
    const myName = getRequiredEnv('AGENT_NAME', readBusterEnvironment('AGENT_NAME'));
    const consumerIdentity = getRequiredEnv(
      'REDIS_CONSUMER_NAME',
      options.consumerName !== undefined ? options.consumerName : readBusterEnvironment('REDIS_CONSUMER_NAME'),
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
    if (redisToolState.redis) {
      await redisToolState.redis.quit();
      redisToolState.redis = null;
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
        const iter = flags.iteration;
        if (!iter) throw new Error('Missing --iteration');
        const payloadText = flags.payload;
        if (!payloadText) throw new Error('Missing --payload');
        const payload = JSON.parse(payloadText);
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
