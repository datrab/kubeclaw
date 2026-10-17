import { createServer } from 'node:http';
import { loadStudioConfig } from './studio-config.ts';
import { handleStudioRequest, studioRequestFailed } from './studio-request.ts';
import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';

const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-studio');
const options = loadStudioConfig(capture);
createServer((request, response) => {
  void handleStudioRequest(request, response, options).catch(error => studioRequestFailed(error, response));
}).listen(options.port, '0.0.0.0');
