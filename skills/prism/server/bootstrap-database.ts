import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { prismDatabaseBootstrapConfig } from '../config/database-bootstrap.ts';
import { runPrismDatabaseBootstrap } from './database-bootstrap-runtime.ts';

const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-control');
await runPrismDatabaseBootstrap(prismDatabaseBootstrapConfig(capture));
