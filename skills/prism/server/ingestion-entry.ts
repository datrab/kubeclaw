import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
import { loadIngestionConfig } from './ingestion-config.ts';
import { startIngestionServer } from './ingestion.ts';

const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-ingestion');
await startIngestionServer(loadIngestionConfig(capture));
