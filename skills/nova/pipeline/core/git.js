// core/git.js — Core git helpers safe for core-layer consumers

import { execFileSync } from 'child_process';

export function getRepoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}
