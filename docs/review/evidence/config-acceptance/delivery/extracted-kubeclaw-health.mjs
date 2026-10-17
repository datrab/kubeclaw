import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mode = process.argv[2] || 'readiness';
const agent = process.env.AGENT_NAME || 'unknown';
const containerRole = process.env.KUBECLAW_CONTAINER_ROLE || 'agent';
const timeoutMs = Number.parseInt(process.env.KUBECLAW_HEALTH_TIMEOUT_MS || '5000', 10);
const startupStatusPath = process.env.KUBECLAW_HEALTH_STARTUP_STATUS_PATH || '/home/node/.openclaw/logs/startup-verification.json';
const startupEventLogPath = process.env.KUBECLAW_HEALTH_STARTUP_EVENT_LOG_PATH || '/home/node/.openclaw/logs/startup-verification.jsonl';
const failures = [];

function enabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw);
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function check(name, fn) {
  try {
    await withTimeout(Promise.resolve().then(fn), name);
  } catch (error) {
    failures.push(`${name}: ${error?.message || error}`);
  }
}

function requirePath(path, type) {
  const stat = fs.statSync(path);
  if (type === 'file' && !stat.isFile()) throw new Error(`${path} is not a file`);
  if (type === 'dir' && !stat.isDirectory()) throw new Error(`${path} is not a directory`);
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function readBundleManifest() {
  const manifestPath = process.env.KUBECLAW_CODE_BUNDLE_MANIFEST || '/runtime-config/code-bundle-manifest.json';
  requirePath(manifestPath, 'file');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function writeStartupVerification(ok, detailFailures = []) {
  const record = {
    ok,
    mode: 'startup',
    agent,
    containerRole,
    checkedAt: new Date().toISOString(),
    failures: Array.isArray(detailFailures) ? detailFailures : [],
  };
  ensureParentDir(startupStatusPath);
  ensureParentDir(startupEventLogPath);
  fs.writeFileSync(startupStatusPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.appendFileSync(startupEventLogPath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

function readStartupVerification() {
  requirePath(startupStatusPath, 'file');
  return JSON.parse(fs.readFileSync(startupStatusPath, 'utf8'));
}

function baseUrl(raw) {
  return String(raw || '').trim().replace(/\/tools\/invoke$/, '').replace(/\/v1$/, '').replace(/\/$/, '');
}

async function httpOk(url, headers = {}, accepted = new Set()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok && !accepted.has(response.status)) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function checkGateway() {
  const url = `${baseUrl(process.env.OPENCLAW_GATEWAY_URL || `http://127.0.0.1:${process.env.GATEWAY_PORT || '18789'}`)}/health`;
  const headers = process.env.OPENCLAW_GATEWAY_TOKEN
    ? { Authorization: `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}` }
    : {};
  await httpOk(url, headers);
}

async function openRedis() {
  const Redis = require('ioredis');
  if (!process.env.REDIS_HOST) throw new Error('REDIS_HOST is required');
  if (!process.env.REDIS_PORT) throw new Error('REDIS_PORT is required');
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number.parseInt(process.env.REDIS_PORT, 10),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  redis.on('error', () => {});
  await redis.connect();
  return redis;
}

async function checkRedis() {
  const redis = await openRedis();
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error(`unexpected PING response: ${pong}`);
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

async function checkRedisStream() {
  const redis = await openRedis();
  try {
    const stream = process.env.KUBECLAW_HEALTH_REDIS_STREAM || `kubeclaw:health:${agent}`;
    const maxLen = String(Number.parseInt(process.env.KUBECLAW_HEALTH_REDIS_STREAM_MAX_LEN || '1000', 10));
    const id = await redis.xadd(stream, 'MAXLEN', '~', maxLen, '*',
      'agent', agent,
      'pod', process.env.HOSTNAME || '',
      'mode', mode,
      'ts', String(Date.now()));
    if (!id) throw new Error('XADD returned no entry id');
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

async function checkLiteLLM() {
  const url = `${baseUrl(process.env.LITELLM_URL)}/health`;
  const headers = process.env.LITELLM_API_KEY
    ? { Authorization: `Bearer ${process.env.LITELLM_API_KEY}` }
    : {};
  await httpOk(url, headers);
}


async function checkRegistries() {
  const entries = String(process.env.KUBECLAW_HEALTH_REGISTRIES || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw new Error('no registry endpoints configured');
  for (const entry of entries) {
    const url = `${baseUrl(entry.startsWith('http') ? entry : `http://${entry}`)}/v2/`;
    await httpOk(url, {}, new Set([401]));
  }
}

function checkDrainState() {
  if (mode !== 'readiness') return;
  const path = process.env.KUBECLAW_DRAIN_FILE || '/tmp/kubeclaw-draining';
  if (fs.existsSync(path)) throw new Error(`${path} exists; container is draining`);
}

function checkStartupVerificationStatus() {
  if (!enabled('KUBECLAW_HEALTH_REQUIRE_STARTUP_MARKER', true)) return;
  const record = readStartupVerification();
  if (record?.ok !== true) {
    throw new Error(`startup verification did not pass: ${JSON.stringify(record?.failures || [])}`);
  }
}

function checkCodeBundle() {
  if (!enabled('KUBECLAW_CODE_BUNDLE_ENABLED', false)) return;
  const manifest = readBundleManifest();
  const expectedAgent = process.env.KUBECLAW_CODE_BUNDLE_AGENT || agent;
  const expectedCommit = String(process.env.KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT || '').trim();
  const expectedContract = String(process.env.KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION || '').trim();
  if (manifest?.role !== expectedAgent) {
    throw new Error(`bundle role ${manifest?.role || '<missing>'} does not match ${expectedAgent}`);
  }
  if (expectedCommit && manifest?.commit !== expectedCommit) {
    throw new Error(`bundle commit ${manifest?.commit || '<missing>'} does not match ${expectedCommit}`);
  }
  if (expectedContract && manifest?.contractVersion !== expectedContract) {
    throw new Error(`bundle contract ${manifest?.contractVersion || '<missing>'} does not match ${expectedContract}`);
  }
}

if (mode === 'startup-status') {
  await check('startup verification status', checkStartupVerificationStatus);
} else if (mode === 'liveness') {
  if (enabled('KUBECLAW_HEALTH_CHECK_GATEWAY', true)) await check('gateway', checkGateway);
} else {
  await check('runtime openclaw config', () => requirePath('/home/node/.openclaw/openclaw.json', 'file'));
  await check('runtime swarm config', () => requirePath(process.env.SWARM_CONFIG, 'file'));
  await check('code bundle', checkCodeBundle);
  await check('skills', () => requirePath('/app/skills', 'dir'));
  if (mode === 'startup') {
    if (enabled('KUBECLAW_HEALTH_CHECK_GATEWAY', true)) await check('gateway', checkGateway);
    if (enabled('KUBECLAW_HEALTH_CHECK_REDIS', true)) await check('redis ping', checkRedis);
    if (enabled('KUBECLAW_HEALTH_CHECK_REDIS_STREAM', true)) await check('redis stream', checkRedisStream);
    if (enabled('KUBECLAW_HEALTH_CHECK_LITELLM', false)) await check('litellm', checkLiteLLM);
    if (enabled('KUBECLAW_HEALTH_CHECK_REGISTRIES', false)) await check('registries', checkRegistries);
  } else {
    await check('drain state', checkDrainState);
    await check('startup verification status', checkStartupVerificationStatus);
    if (enabled('KUBECLAW_HEALTH_CHECK_GATEWAY', true)) await check('gateway', checkGateway);
    if (enabled('KUBECLAW_HEALTH_CHECK_REDIS', true)) await check('redis ping', checkRedis);
  }
}

if (failures.length > 0) {
  if (mode === 'startup') {
    const record = writeStartupVerification(false, failures);
    console.error(JSON.stringify(record));
  }
  console.error(JSON.stringify({ ok: false, mode, agent, failures }));
  process.exit(1);
}
if (mode === 'startup') {
  const record = writeStartupVerification(true);
  console.log(JSON.stringify(record));
}
console.log(JSON.stringify({ ok: true, mode, agent }));
