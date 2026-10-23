// Installed image helper is deliberately outside the exactly receipted /app.
// Verify before lifetime/state/BuildKit effects; no source path is returned/exported.
import {verifyPipelineBootReceipt} from '/app/skills/packages/plugin-foundation/config/pipeline-boot.mjs';
import {rejectLegacyAuthors} from '/app/skills/packages/plugin-foundation/config/swarm.ts';
import {projectBusterSettings} from '/app/skills/packages/plugin-foundation/config/pipeline-composition.ts';
import {projectLegacyBusterPreparationSource} from '/app/skills/packages/buster-engine/test-gates/preparation-runtime-source.ts';
rejectLegacyAuthors(process.env);
projectBusterSettings(verifyPipelineBootReceipt('/run/pipeline-delivery','buster-preparation'),'buster-preparation');
projectLegacyBusterPreparationSource(process.env);
