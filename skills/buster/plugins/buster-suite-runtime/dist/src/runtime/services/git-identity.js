import { gitExec } from '../git-primitives.js';
import { readBusterEnvironment } from '../buster-environment.js';
import { logGit } from './git-workflow-contracts.js';
function titleCaseAgent(value) {
    const normalized = value.trim().replace(/[-_]+/g, ' ');
    if (!normalized)
        return 'Buster';
    return normalized.split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}
function gitConfigValue(repoRoot, key) {
    try {
        return gitExec(repoRoot, ['config', '--get', key]) ?? null;
    }
    catch (_error) {
        return null; /* INTENTIONAL_NONCRITICAL(optional_probe_failed): absent Git identity is configured below. */
    }
}
export function ensureGitIdentity(repoRoot, logger) {
    const existingName = gitConfigValue(repoRoot, 'user.name');
    const existingEmail = gitConfigValue(repoRoot, 'user.email');
    if (existingName && existingEmail)
        return;
    const configuredAgent = readBusterEnvironment('AGENT_NAME');
    const agent = configuredAgent && configuredAgent.trim() ? configuredAgent.trim() : 'buster';
    if (!existingName) {
        gitExec(repoRoot, ['config', 'user.name', `${titleCaseAgent(agent)} Agent`]);
        logGit(logger, 'info', `Configured local git user.name for ${agent}`);
    }
    if (!existingEmail) {
        gitExec(repoRoot, ['config', 'user.email', `${agent.toLowerCase()}@kubeclaw.swarm`]);
        logGit(logger, 'info', `Configured local git user.email for ${agent}`);
    }
}
export function hasScopedStagedChanges(repoRoot, addPaths) {
    try {
        gitExec(repoRoot, ['diff', '--cached', '--quiet', '--', ...addPaths]);
        return false;
    }
    catch (_error) {
        return true;
    }
}
