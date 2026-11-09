import { fileURLToPath } from 'node:url';
import { verifyDiagramArtifact } from './diagrams.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
console.log(JSON.stringify(await verifyDiagramArtifact(process.argv[2] ?? '.tmp/docs-publication', repositoryRoot), null, 2));
