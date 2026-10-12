// Diagnostic only: observe the original methods/HTTP server events, preserve all arguments/results/deadlines.
import fs from 'node:fs';
import http from 'node:http';
import { HttpRemotePlanTransport } from '@kubeclaw/nova-core';
import { BusterRemotePlanService } from '../../../../skills/buster/engine/test-gates/remote-plan-service.ts';
const events = [];
const record = value => { if (events.length < 10000) events.push({ at: performance.now(), ...value }); };
for (const [owner, label, methods] of [[HttpRemotePlanTransport, 'transport', ['cancel']], [BusterRemotePlanService, 'service', ['cancel']]]) {
  for (const method of methods) {
    const original = owner.prototype[method];
    owner.prototype[method] = function (...args) {
      record({ kind: `${label}.${method}.start`, jobId: args[0] });
      return Reflect.apply(original, this, args).then(result => {
        record({ kind: `${label}.${method}.result`, jobId: args[0], state: result.state }); return result;
      }, error => {
        record({ kind: `${label}.${method}.error`, jobId: args[0], error: error.message }); throw error;
      });
    };
  }
}
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (name, ...args) {
  if (name === 'request' && args[0].method === 'DELETE') {
    const [request, response] = args;
    const identity = { port: request.socket.localPort, path: request.url };
    record({ kind: 'http.delete.receive', ...identity });
    response.once('finish', () => record({ kind: 'http.delete.finish', status: response.statusCode, ...identity }));
    response.once('close', () => record({ kind: 'http.delete.close', finished: response.writableFinished, ...identity }));
  }
  return Reflect.apply(emit, this, [name, ...args]);
};
process.once('exit', code => fs.writeFileSync(new URL('./cancellation-timing.json', import.meta.url), JSON.stringify({ code, events }, null, 2)));
