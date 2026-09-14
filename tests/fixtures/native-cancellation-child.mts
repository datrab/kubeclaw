import fs from 'node:fs/promises';

const [mode, target] = process.argv.slice(2);
const handle = await fs.open(target!, 'wx');
process.stdin.resume();
process.on('SIGTERM', () => {
  if (mode === 'unresponsive') return;
  void (async () => {
    await handle.writeFile('cleanup-complete'); await handle.sync(); await handle.close();
    process.stdin.destroy();
  })().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; process.stdin.destroy(); });
});
process.stdout.write('ready\n');
