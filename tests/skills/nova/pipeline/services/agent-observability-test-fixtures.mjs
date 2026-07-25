export function telemetryXreadResult(id, event) {
  return [['telemetry-stream', [[id, ['data', JSON.stringify(event)]]]]];
}

export function lazyTelemetryRedis({ calls, event }) {
  return class FakeRedis {
    constructor() {
      this.status = 'wait';
    }

    on() {}

    async connect() {
      calls.push('connect');
      this.status = 'ready';
    }

    async ping() {
      calls.push('ping');
      return 'PONG';
    }

    async xread(...args) {
      calls.push(['xread', ...args]);
      return telemetryXreadResult('1-0', event);
    }

    disconnect() {
      calls.push('disconnect');
    }
  };
}
