import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function toolchainKey(root, role, platform = 'linux/amd64') {
  if (!['nova', 'buster-runtime'].includes(role)) return undefined;
  if (!['linux/amd64', 'linux/arm64'].includes(platform)) throw new Error('Unsupported toolchain platform');
  const source = fs.readFileSync(path.join(root, `docker/Dockerfile.${role}`), 'utf8');
  const marker = '# Stable tools can be supplied by a content-keyed, digest-pinned CI image.';
  const end = source.indexOf(marker);
  if (end < 0) throw new Error('Missing toolchain boundary');
  const prefix = source.slice(0, end);
  // Fail closed if the Dockerfile grows a COPY form not covered by this key.
  const inputs = ['.dockerignore'];
  for (const line of prefix.replace(/\\\n/g, ' ').split('\n')) {
    if (!/^\s*(?:COPY|ADD)\s/i.test(line)) continue;
    if (/^COPY --from=buildkit /u.test(line)) continue; // pinned FROM is in prefix
    if (!/^COPY [\w./ -]+$/u.test(line)) throw new Error(`Unsupported toolchain input: ${line}`);
    inputs.push(...line.trim().split(/\s+/u).slice(1, -1));
  }
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const hash = createHash('sha256').update(JSON.stringify({ version: 1, role, platform, prefix }));
  for (const input of inputs) {
    const matches = tracked.filter(file => file === input || file.startsWith(`${input.replace(/\/$/u, '')}/`)).sort();
    if (!matches.length) throw new Error(`Missing toolchain input: ${input}`);
    for (const file of matches) {
      const target = path.join(root, file), stat = fs.lstatSync(target);
      if (!stat.isFile()) throw new Error(`Unsupported toolchain file: ${file}`);
      hash.update(JSON.stringify([file, stat.mode & 0o777])).update(fs.readFileSync(target));
    }
  }
  return hash.digest('hex');
}

export function inspectDigest(reference) {
  const result = spawnSync('docker', ['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Manifest}}'], { encoding: 'utf8' });
  if (result.status !== 0) {
    // Only an explicit missing manifest is a cache miss. Auth/network failures fail.
    if (/manifest unknown|not found|name unknown/iu.test(result.stderr ?? '')) return undefined;
    throw new Error(`Toolchain lookup failed: ${result.stderr ?? result.error}`);
  }
  const digest = JSON.parse(result.stdout).digest;
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error('Invalid toolchain digest');
  return digest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, role] = process.argv.slice(2);
  const output = value => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${value}\n`);
  const key = toolchainKey(process.cwd(), role);
  if (!key) {
    output('enabled=false');
  } else {
    const owner = process.env.GITHUB_REPOSITORY_OWNER?.toLowerCase();
    if (!/^[a-z0-9-]+$/u.test(owner ?? '')) throw new Error('Missing repository owner');
    const tag = `ghcr.io/${owner}/kubeclaw-${role}-toolchain:inputs-${key}`;
    if (command === 'lookup') {
      const digest = inspectDigest(tag);
      output(`enabled=true\ntag=${tag}\nhit=${Boolean(digest)}\nimage=${digest ? `${tag}@${digest}` : ''}`);
    } else if (command === 'pin') {
      const digest = process.env.BUILT_TOOLCHAIN_DIGEST || inspectDigest(tag);
      if (!/^sha256:[a-f0-9]{64}$/u.test(digest ?? '')) throw new Error('Missing toolchain digest');
      output(`image=${tag}@${digest}`);
    } else throw new Error('Unknown toolchain command');
  }
}
