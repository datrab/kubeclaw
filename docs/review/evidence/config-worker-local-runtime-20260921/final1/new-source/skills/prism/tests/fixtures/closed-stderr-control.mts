import {closeSync} from 'node:fs';

// Real failed diagnostic sink; the original entrypoint, HTTP handler and logger
// remain unchanged. Initialize Node's stream before closing its descriptor.
closeSync(process.stderr.fd);
await import('../../server/control.ts');
