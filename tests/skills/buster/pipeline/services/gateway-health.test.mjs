import assert from 'node:assert/strict';
import test from 'node:test';

test('startGatewayHealthMonitor returns the interval handle so callers can clear it', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervalHandle = { id: 'gateway-health-interval' };
  let scheduledCallback = null;
  let scheduledDelay = null;
  let clearedHandle = null;

  globalThis.setInterval = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return intervalHandle;
  };
  globalThis.clearInterval = (handle) => {
    clearedHandle = handle;
  };

  try {
    const { startGatewayHealthMonitor, GATEWAY_HEALTH_INTERVAL } = await import('../../../../../skills/buster/pipeline/services/gateway-health.ts');
    const returnedHandle = startGatewayHealthMonitor({ shutdown: () => {} });

    assert.equal(returnedHandle, intervalHandle);
    assert.equal(typeof scheduledCallback, 'function');
    assert.equal(scheduledDelay, GATEWAY_HEALTH_INTERVAL);

    clearInterval(returnedHandle);
    assert.equal(clearedHandle, intervalHandle);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('waitForGateway without shutdown throws a structured gateway timeout error', async () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => {
    now += 120001;
    return now;
  };

  try {
    const { waitForGateway } = await import('../../../../../skills/buster/pipeline/services/gateway-health.ts');
    await assert.rejects(
      () => waitForGateway(),
      (error) => {
        assert.equal(error.signal, 'GATEWAY_READY_TIMEOUT');
        assert.equal(error.opts.cleanupStage, 'gateway-ready-timeout');
        assert.equal(error.opts.reason, 'gateway_ready_timeout');
        assert.match(error.message, /Gateway shutdown requested: GATEWAY_READY_TIMEOUT/);
        return true;
      }
    );
  } finally {
    Date.now = originalNow;
  }
});

test('startGatewayHealthMonitor without shutdown throws a structured health failure error', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalFetch = globalThis.fetch;
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const originalGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  let scheduledCallback = null;

  globalThis.setInterval = (callback) => {
    scheduledCallback = callback;
    return { id: 'gateway-health-interval' };
  };
  globalThis.fetch = async () => ({ ok: false });
  process.env.OPENCLAW_GATEWAY_URL = 'http://gateway.test';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'token';

  try {
    const { startGatewayHealthMonitor } = await import('../../../../../skills/buster/pipeline/services/gateway-health.ts');
    startGatewayHealthMonitor();

    await scheduledCallback();
    await scheduledCallback();
    await assert.rejects(
      () => scheduledCallback(),
      (error) => {
        assert.equal(error.signal, 'GATEWAY_HEALTH_FAILED');
        assert.equal(error.opts.cleanupStage, 'gateway-health-failed');
        assert.equal(error.opts.reason, 'gateway_unreachable');
        assert.match(error.message, /Gateway shutdown requested: GATEWAY_HEALTH_FAILED/);
        return true;
      }
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.fetch = originalFetch;
    if (originalGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl;
    if (originalGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalGatewayToken;
  }
});

test('startGatewayHealthMonitor treats thrown health checks as failures', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalFetch = globalThis.fetch;
  const originalOpenClawGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const originalOpenClawGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  let scheduledCallback = null;

  globalThis.setInterval = (callback) => {
    scheduledCallback = callback;
    return { id: 'gateway-health-interval' };
  };
  globalThis.fetch = async () => ({ ok: true });
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const { startGatewayHealthMonitor } = await import('../../../../../skills/buster/pipeline/services/gateway-health.ts');
    startGatewayHealthMonitor();

    await scheduledCallback();
    await scheduledCallback();
    await assert.rejects(
      () => scheduledCallback(),
      (error) => {
        assert.equal(error.signal, 'GATEWAY_HEALTH_FAILED');
        assert.equal(error.opts.cleanupStage, 'gateway-health-failed');
        assert.equal(error.opts.reason, 'gateway_unreachable');
        assert.match(error.message, /Gateway shutdown requested: GATEWAY_HEALTH_FAILED/);
        return true;
      }
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.fetch = originalFetch;
    if (originalOpenClawGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = originalOpenClawGatewayUrl;
    if (originalOpenClawGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = originalOpenClawGatewayToken;
  }
});
