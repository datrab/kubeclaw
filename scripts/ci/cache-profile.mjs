import fs from 'node:fs';
const [role, profile = 'gha-min'] = process.argv.slice(2);
if (!/^[a-z][a-z-]+$/u.test(role ?? '') || !['gha-min', 'gha-max', 'registry-max'].includes(profile)) throw new Error('Invalid cache profile');
const owner = process.env.GITHUB_REPOSITORY_OWNER?.toLowerCase();
if (!/^[a-z0-9-]+$/u.test(owner ?? '')) throw new Error('Missing repository owner');
const registry = `type=registry,ref=ghcr.io/${owner}/kubeclaw-build-cache:${role}-amd64`;
const from = profile === 'registry-max' ? registry : `type=gha,scope=${role}`;
const to = profile === 'registry-max' ? `${registry},mode=max,ignore-error=true` : `type=gha,scope=${role},mode=${profile.slice(4)},ignore-error=true`;
fs.appendFileSync(process.env.GITHUB_OUTPUT, `from=${from}\nto=${to}\nprofile=${profile}\n`);
