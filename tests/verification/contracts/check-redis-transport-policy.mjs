import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const transportPath = path.join(sourceRoot, 'skills/common/pipeline/redis-transport.ts');
const transportSource = fs.readFileSync(transportPath, 'utf8');
const runtimeRedisPreflightPath = path.join(sourceRoot, 'skills/nova/pipeline/services/runtime-redis-preflight.ts');
const runtimeRedisPreflightSource = fs.readFileSync(runtimeRedisPreflightPath, 'utf8');
const transport = await import(pathToFileURL(transportPath).href);

assert.equal(typeof transport.resolveRedisTransportConfig, 'function', 'shared Redis transport config resolver must be exported');
assert.equal(typeof transport.createRedisClient, 'function', 'shared Redis client factory must be exported');
assert.equal(typeof transport.MissingDependencyError, 'function', 'shared Redis transport must expose structured missing dependency errors');
assert.equal(transport.MISSING_DEPENDENCY_ERROR_CODE, 'MISSING_DEPENDENCY', 'missing dependency errors must use the canonical code');
assert.equal(transportSource.includes('requireFirst'), false, 'Redis dependency loading must not keep fallback candidate helpers');
assert.equal(transportSource.includes('/app/node_modules/ioredis'), false, 'Redis dependency loading must not probe container absolute fallback paths');
assert.equal(transportSource.includes('/usr/local/lib/node_modules/ioredis'), false, 'Redis dependency loading must not probe global absolute fallback paths');
assert.equal(transportSource.includes("require('ioredis')"), true, 'Redis dependency loading must use native Node package resolution only');
assert.equal(
  runtimeRedisPreflightSource.includes('env: Record<string, string | undefined> = process.env'),
  true,
  'runtime Redis preflight must use deployment env as the infrastructure authority for Redis coordinates',
);
assert.equal(
  runtimeRedisPreflightSource.includes('const env = {};'),
  false,
  'runtime Redis preflight must not force Redis coordinates into swarm.config.json by erasing deployment env',
);

try {
  transport.loadRedisCtor();
} catch (error) {
  assert.equal(error?.name, 'MissingDependencyError', 'missing ioredis must throw structured MissingDependencyError');
  assert.equal(error?.code, 'MISSING_DEPENDENCY', 'missing ioredis must throw the canonical missing dependency code');
  assert.equal(error?.dependency, 'ioredis', 'missing dependency diagnostics must name ioredis');
}

assert.throws(
  () => transport.resolveRedisTransportConfig({ redisHost: 'redis-master.kubeclaw.svc.cluster.local', redisPort: 6379 }, {}),
  (error) => error?.code === 'SECURE_REDIS_TRANSPORT_POLICY_VIOLATION'
    && String(error.message).includes('Secure Redis transport policy violation'),
  'non-local Redis without auth, TLS, or documented isolation must fail closed',
);

{
  const resolved = transport.resolveRedisTransportConfig({ redisHost: 'redis-master.kubeclaw.svc.cluster.local', redisPort: 6379, redisPassword: 'secret' }, {});
  assert.equal(resolved.redisOptions.password, 'secret');
  assert.equal(resolved.policy.authenticated, true);
}

{
  const resolved = transport.resolveRedisTransportConfig({ redisHost: 'redis-master.kubeclaw.svc.cluster.local', redisPort: 6379, redisTls: true }, {});
  assert.deepEqual(resolved.redisOptions.tls, {});
  assert.equal(resolved.policy.tls, true);
}

{
  const resolved = transport.resolveRedisTransportConfig({ redisHost: 'redis-master.kubeclaw.svc.cluster.local', redisPort: 6379, redisNetworkIsolation: 'documented' }, {});
  assert.equal(resolved.redisOptions.host, 'redis-master.kubeclaw.svc.cluster.local');
  assert.equal(resolved.policy.networkIsolation, true);
}

{
  const resolved = transport.resolveRedisTransportConfig({ redisHost: '127.0.0.1', redisPort: 6379, enforceSecureMode: false }, {});
  assert.equal(resolved.policy.insecureLocalVerification, true);
}

assert.throws(
  () => transport.resolveRedisTransportConfig({ redisHost: 'redis-master.kubeclaw.svc.cluster.local', redisPort: 6379, enforceSecureMode: false }, {}),
  /insecure verification mode is restricted to localhost/,
  'explicit insecure verification mode must not permit non-local Redis endpoints',
);

{
  const instances = [];
  class FakeRedis {
    constructor(options) {
      this.options = options;
      instances.push(this);
    }
  }
  const client = transport.createRedisClient(
    FakeRedis,
    { redisHost: '127.0.0.1', redisPort: 6379, enforceSecureMode: false },
    { host: 'redis-master.kubeclaw.svc.cluster.local', maxRetriesPerRequest: 1 },
    {},
  );
  assert.equal(client, instances[0]);
  assert.equal(client.options.host, '127.0.0.1', 'validated transport options must not be overridden by client options');
  assert.equal(client.options.maxRetriesPerRequest, 1);
}

console.log(JSON.stringify({ ok: true, checked: 'redis-transport-policy' }));
