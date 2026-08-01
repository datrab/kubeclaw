const SWARM_RUNTIME_ROOT_SEGMENT = '.swarm';
const SWARM_RUNTIME_PATH_SEGMENT = `/${SWARM_RUNTIME_ROOT_SEGMENT}/`;

type RuntimeStateMatcher = (swarmPath: string) => boolean;

const SWARM_RUNTIME_STATE_MATCHERS: readonly RuntimeStateMatcher[] = [
  (swarmPath) => swarmPath.startsWith('logs/'),
  (swarmPath) => swarmPath === 'progress.json',
  (swarmPath) => /^modules\/[^/]+\/(?:forge|buster|review|gate)-completion(?:\.[^/]+)?\.json$/.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/[^/]+\.json\.identity\.json$/.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/(?:forge|buster|review|gate)-prompt(?:-metadata)?\.json$/.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/(?:forge|buster|review)-transcript-attempt-\d+\.jsonl$/.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/(?:forge|buster|review)-output(?:\.[^/]+)?$/.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/tests\/attempt-\d+\//.test(swarmPath),
  (swarmPath) => /^modules\/[^/]+\/(?:runtime|state|status|summary).*\.(json|jsonl|md)$/.test(swarmPath),
  (swarmPath) => /^[^/]+-gate-status\.json$/.test(swarmPath),
  (swarmPath) => /^.*summary.*\.(json|md)$/.test(swarmPath),
  (swarmPath) => /^.*project-summary.*$/.test(swarmPath),
];

function normalizeRepoPathForRuntimeCheck(relPathName: string): string {
  const normalized = String(relPathName ?? '')
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '');
  return `/${normalized}`;
}

export function isRuntimeStatePath(relPathName: string): boolean {
  const p = normalizeRepoPathForRuntimeCheck(relPathName);
  const swarmIndex = p.indexOf(SWARM_RUNTIME_PATH_SEGMENT);
  if (swarmIndex === -1) return false;

  const swarmPath = p.slice(swarmIndex + SWARM_RUNTIME_PATH_SEGMENT.length);
  return SWARM_RUNTIME_STATE_MATCHERS.some((matchesRuntimeState) => matchesRuntimeState(swarmPath));
}
