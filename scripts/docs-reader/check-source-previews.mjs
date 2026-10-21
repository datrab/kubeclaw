import { fileURLToPath } from 'node:url';
import { verifySourcePreviewArtifact } from './source-previews.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
console.log(JSON.stringify(await verifySourcePreviewArtifact(process.argv[2] ?? '.tmp/docs-publication', repositoryRoot), null, 2));
