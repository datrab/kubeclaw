import process from 'node:process';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let handled = false;

lines.on('line', (line) => {
  void (async () => {
    if (handled) throw new Error('REPORT_ADAPTER_PROTOCOL_MULTIPLE_REQUESTS');
    handled = true;
    const command = JSON.parse(line);
    if (command.kind !== 'adapt') throw new Error('REPORT_ADAPTER_PROTOCOL_INVALID');
    const loaded = await import(pathToFileURL(command.modulePath).href);
    const adapt = loaded[command.exportName];
    if (typeof adapt !== 'function') throw new Error('REPORT_ADAPTER_EXPORT_INVALID');
    const bytes = Buffer.from(command.contentBase64, 'base64');
    const result = await adapt(Object.freeze({
      schemaVersion: 'report-adapter-input.v1',
      mediaType: command.mediaType,
      bytes,
      limits: Object.freeze({ ...command.limits }),
    }));
    send({ kind: 'result', value: result });
    lines.close();
  })().catch((error) => {
    send({ kind: 'error', error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
    lines.close();
  });
});
