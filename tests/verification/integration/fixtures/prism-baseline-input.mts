import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { validatePrism } from '../../../../contracts/prism/v1/src/index.ts';
import { ContentAddressedArtifactStore } from '../../../../skills/prism/storage/artifacts.ts';

export const hash = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export async function baselineInput(store: ContentAddressedArtifactStore) {
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const png = new PNG({ width: 1, height: 1 }); png.data.fill(255);
  const pngBytes = PNG.sync.write(png);
  const asset = await store.put(pngBytes);
  const document = JSON.parse(fs.readFileSync(new URL('../../../../contracts/prism/v1/fixtures/minimal-web.json', import.meta.url), 'utf8'));
  document.meta.projectId = 'project';
  for (const id of ['aa', 'az']) document.assets[id] = { kind: 'image', artifact: asset.artifactId, mediaType: 'image/png', role: 'illustration' };
  validatePrism('designDocument', document);
  const manifestAssets: Record<string, {path: string; mediaType: string; digest: string}> = {};
  const binaryFiles: Record<string, string> = {'previews/home.png': pngBytes.toString('base64')};
  for (const id of ['aa', 'az']) {
    const bytes = Buffer.from(await store.get(document.assets[id].artifact));
    const path = `assets/${id}.png`; binaryFiles[path] = bytes.toString('base64');
    manifestAssets[id] = { path, mediaType: 'image/png', digest: hash(bytes) };
  }
  const textFiles: Record<string, string> = {
    'design-document.json': JSON.stringify(document), 'design-specification.md': '# Approved contract fixture',
    'acceptance-criteria.json': JSON.stringify({schema: 'prism.acceptance-criteria.v1', criteria: [{id: 'home-visible', category: 'visual', requirement: 'Home is visible.', targets: [{view: 'home', state: 'default'}], priority: 'required', verification: ['visual']}]}),
    'previews/home.aria.txt': 'Home',
    'previews/index.json': JSON.stringify({schema: 'prism.preview-index.v1', previews: [{id: 'home', view: 'home', state: 'default', viewport: 'wide', path: 'previews/home.png', width: 1, height: 1, digest: hash(pngBytes), fidelity: 'intent', ariaPath: 'previews/home.aria.txt', ariaDigest: hash('Home'), renderer: {name: 'contract-fixture-not-browser'}}]}),
  };
  const manifest = {bundleId: 'project-baseline', projectId: 'project', revision: document.meta.revision,
    designDocument: {path: 'design-document.json', schema: 'prism.design-document.v1', revision: document.meta.revision},
    designSpecification: {path: 'design-specification.md'}, acceptanceCriteria: {path: 'acceptance-criteria.json'},
    assets: manifestAssets, previews: {path: 'previews/index.json'}, createdAt: '2026-09-06T00:00:00.000Z'};
  return {manifest, textFiles, binaryFiles, document};
}

// Original Control serializer body from a43aa256/b3d2f7ba, lines821-861,
// plus its original sha256/stableRecord helpers. Exact immutable bytes checked.
// This is historical byte compatibility, NOT a full DB/approval/render endpoint.
export async function originalV1(input: Awaited<ReturnType<typeof baselineInput>>, artifacts: ContentAddressedArtifactStore) {
  const source = fs.readFileSync(new URL('../../../../contracts/prism/v1/tests/fixtures/control-v1-assembly.txt', import.meta.url), 'utf8');
  if (hash(source) !== 'sha256:c1890ec51f6825726d26f0b6614574254f69923ba28f746700f15c294fa1cd85') throw new Error('HISTORICAL_BASELINE_PRODUCER_CHANGED');
  const code = `export async function assemble(context) { const {createHash,validatePrism,textFiles,binaryFiles,currentDocument,approval,manifestAssets,artifacts}=context; ${source}\nreturn {bundle,bundleDigest,manifest,checksums}; }`;
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(code)).toString('base64')}`);
  return legacy.assemble({createHash, validatePrism, artifacts, textFiles: structuredClone(input.textFiles), binaryFiles: structuredClone(input.binaryFiles),
    currentDocument: {document: input.document}, approval: {rows: [{approved_at: input.manifest.createdAt}]}, manifestAssets: input.manifest.assets});
}
