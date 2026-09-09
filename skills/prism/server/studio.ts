import { createServer } from 'node:http';
import { loadStudioConfig } from './studio-config.ts';
import { handleStudioRequest, studioRequestFailed } from './studio-request.ts';

const options = loadStudioConfig();
createServer((request, response) => {
  void handleStudioRequest(request, response, options).catch(error => studioRequestFailed(error, response));
}).listen(options.port, '0.0.0.0');
