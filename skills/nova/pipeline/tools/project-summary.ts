import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { main } from './project-summary-runner.ts';

const filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  main()
    .then(() => process.exit(0))
    .catch((error: any) => { console.error(`Error: ${sanitizeMarkdownText(error.message)}`); process.exit(1); });
}

export { buildProjectSummaryArtifactFields, buildProjectSummaryDiscordFields, generateSummary, main, postToDiscord } from './project-summary-runner.ts';
export { normalizeAgentInvocationKind } from './project-summary-agents.ts';
export { resolveProjectPaths } from './project-summary-core.ts';
export default main;
