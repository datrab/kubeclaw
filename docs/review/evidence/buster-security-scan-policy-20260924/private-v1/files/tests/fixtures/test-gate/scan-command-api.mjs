/** Actual executable, stdio and filesystem boundary; modeled Trivy JSON/DB bytes.
 * Original native Trivy and authentic advisory database tests remain separate. */
import fs from 'node:fs';
import path from 'node:path';

export function scanCommandApi(root) {
  const log = path.join(root, 'scan-commands.jsonl');
  const control = path.join(root, 'scan-control.json');
  const executable = path.join(root, 'trivy-local');
  const cache = path.join(root, 'cache');
  const source = fs.readFileSync(new URL('./scan-command-program.cjs', import.meta.url), 'utf8');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fixture = ${JSON.stringify({ log, control })};\n${source}`, { mode: 0o700, flag: 'wx' });
  const seed = (settings = {}) => fs.writeFileSync(control, JSON.stringify(settings));
  const databases = ({ ageMs = 1000, javaAgeMs = ageMs, bytes = 64, padding = 0 } = {}) => {
    for (const [directory, file, version, age] of [['db', 'trivy.db', 2, ageMs], ['java-db', 'trivy-java.db', 1, javaAgeMs]]) {
      const folder = path.join(cache, directory); fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, file), Buffer.alloc(bytes, version));
      fs.writeFileSync(path.join(folder, 'metadata.json'), JSON.stringify({ Version: version,
        UpdatedAt: new Date(Date.now() - age).toISOString(), NextUpdate: new Date(Date.now() + 86400000).toISOString(), padding: 'x'.repeat(padding) }));
    }
  };
  seed(); databases();
  return { executable, cache, seed, databases, calls: () => fs.existsSync(log)
    ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [] };
}
