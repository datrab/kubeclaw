import fs from 'node:fs';
import path from 'node:path';

const projectsRoot = path.resolve(process.argv[2] ?? '');
if (path.basename(projectsRoot) !== 'projects' || path.basename(path.dirname(projectsRoot)) !== 'npm') {
  throw new Error(`Refusing to reset non-plugin path: ${projectsRoot}`);
}

fs.mkdirSync(projectsRoot, { recursive: true });
const entries = fs.readdirSync(projectsRoot);
for (const entry of entries) {
  fs.rmSync(path.join(projectsRoot, entry), { recursive: true, force: true });
}
console.log(`Reset ${entries.length} managed OpenClaw npm project root(s)`);
