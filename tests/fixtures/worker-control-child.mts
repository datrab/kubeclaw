import { Socket } from 'node:net';
import { NativeWorkerControlChannel } from '../../skills/worker/core/worker/native-control-channel.ts';

const socket = new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true });
const mode = process.argv[2];
if (mode === 'oversized' || mode === 'truncated' || mode === 'cumulative') {
  const header = Buffer.alloc(4); header.writeUInt32BE(mode === 'oversized' ? 9999 : 10);
  const bytes = mode === 'oversized' ? header : Buffer.concat([header, Buffer.alloc(mode === 'truncated' ? 3 : 10)]);
  socket.end(mode === 'cumulative' ? Buffer.concat([bytes, bytes, bytes]) : bytes);
} else {
  const channel = new NativeWorkerControlChannel(socket, { maximumMessageBytes: 1024, maximumSessionBytes: 8192 });
  let input = '';
  for await (const chunk of process.stdin) input += String(chunk);
  if (input !== 'original envelope') throw new Error('original input was not preserved');
  await channel.send(Buffer.from('ready'));
  let teardown = false;
  for await (const message of channel.messages()) {
    if (teardown || message.toString() !== 'teardown') throw new Error('unexpected phase');
    teardown = true; await channel.end();
  }
  if (!teardown) throw new Error('control closed before teardown');
  process.stdout.write('completed after teardown');
}
