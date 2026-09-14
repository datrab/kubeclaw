import { NativeWorkerOutputSpool } from '../../skills/worker/core/worker/native-output-spool.ts';
const spool = await NativeWorkerOutputSpool.create(process.argv[2], 65536);
await spool.append('stdout', Buffer.from([0, 1, 2, 255, 10]));
await spool.append('stderr', Buffer.from('original stderr: demo-password-is-preserved\n'));
await spool.flush();
process.stdout.write('durable\n');
await new Promise(resolve => process.stdin.once('end', resolve).resume());
await spool.close();
