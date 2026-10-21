import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import MarkdownIt from 'markdown-it';
import { parse, parseFragment } from 'parse5';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svgTags = new Set('svg style g defs marker path rect polygon polyline line circle ellipse text tspan title desc filter fedropshadow fegaussianblur feoffset femerge femergenode clippath lineargradient stop pattern symbol use'.split(' '));

export function validateDiagramSvg(svg) {
  assert(!/<!doctype|<!entity|<\?xml-stylesheet/iu.test(svg), 'Diagram contains an active XML declaration');
  const document = parseFragment(svg), roots = document.childNodes.filter(node => node.tagName);
  assert.equal(roots.length, 1); assert.equal(roots[0].tagName, 'svg');
  const ids = new Set(), references = [];
  function css(value, requireTargets = false) {
    assert(!/@import|\\|expression\s*\(|javascript\s*:|data\s*:/iu.test(value), 'Unsafe diagram CSS');
    for (const match of value.matchAll(/url\s*\(([^)]*)\)/giu)) {
      const target = match[1].trim().replace(/^['"]|['"]$/gu, '');
      assert(/^#[a-zA-Z0-9_.:-]+$/u.test(target), 'Diagram CSS loads an external resource'); if (requireTargets) references.push(target.slice(1));
    }
  }
  function walk(node) {
    if (node.tagName) {
      assert(svgTags.has(node.tagName.toLowerCase()), `Unsupported diagram SVG element: ${node.tagName}`);
      for (const attribute of node.attrs ?? []) {
        const name = attribute.name.toLowerCase(); assert(!name.startsWith('on'), 'Diagram has an event handler');
        if (name === 'id') { assert(!ids.has(attribute.value), 'Duplicate diagram SVG id'); ids.add(attribute.value); }
        if (name === 'href' || name === 'src') { assert(attribute.value.startsWith('#'), 'Diagram has an external reference'); references.push(attribute.value.slice(1)); }
        if (name === 'style' || /url\s*\(/iu.test(attribute.value)) css(attribute.value, true);
      }
      // Mermaid includes inactive theme selectors with optional local gradients.
      // They cannot fetch resources; actual presentation attributes must resolve.
      if (node.tagName === 'style') css((node.childNodes ?? []).map(child => child.value ?? '').join(''));
    }
    for (const child of node.childNodes ?? []) walk(child);
  }
  walk(roots[0]);
  for (const reference of references) assert(ids.has(reference), `Missing diagram SVG target: ${reference}`);
  const viewBox = roots[0].attrs.find(attribute => attribute.name === 'viewBox')?.value.split(/[\s,]+/u).map(Number);
  assert(viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0 && viewBox[2] < 100000 && viewBox[3] < 100000, 'Invalid diagram dimensions');
  return { width: Math.ceil(viewBox[2]), height: Math.ceil(viewBox[3]) };
}

export function collectDocumentationDiagrams(pages, registry) {
  assert.equal(registry.schemaVersion, 'kubeclaw-documentation-diagrams.v1');
  const selected = new Map(), ids = new Set(), found = [];
  for (const entry of registry.diagrams) {
    const key = `${entry.page}:${entry.index}`;
    assert(!selected.has(key) && !ids.has(entry.id), 'Duplicate diagram registration');
    assert(/^diagram-[a-f0-9]{16}$/u.test(entry.id) && entry.readerQuestion?.endsWith('?') && entry.owner?.trim(), 'Incomplete diagram owner or reader question');
    selected.set(key, entry); ids.add(entry.id);
  }
  const md = new MarkdownIt({ html: true });
  for (const page of pages) {
    const owner = /^Owner: (.+)$/mu.exec(page.searchSourceText ?? page.text)?.[1]; let index = 0;
    for (const token of md.parse(page.text, {})) {
      if (token.type !== 'fence' || token.info.trim() !== 'mermaid') continue;
      const entry = selected.get(`${page.relative}:${index++}`); assert(entry, `Unregistered diagram: ${page.relative}`);
      assert.equal(entry.owner, owner, `Diagram owner differs from page: ${entry.id}`);
      assert.equal(hash(token.content), entry.sourceSha256, `Diagram changed without owner review: ${entry.id}`);
      assert(token.content.length <= 128 * 1024, 'Diagram source exceeds render bound');
      const tail = page.text.split('\n').slice(token.map[1]).join('\n').trimStart();
      assert(/^(?:\*\*Text alternative to the diagram\*\*|Text version:)/iu.test(tail), `Diagram has no adjacent text alternative: ${entry.id}`);
      found.push({ ...entry, code: token.content, map: token.map });
    }
  }
  assert.equal(found.length, registry.diagrams.length, 'Registered diagram disappeared from selected pages');
  return found;
}

// The browser receives only the pinned local Mermaid distribution and positively
// selected diagram descriptions. No external page or network resource is used.
export async function renderDocumentationDiagrams(definitions) {
  // The isolated reader install owns this fixed distribution directory. Do not
  // select an ambient package or acquire executable modules through require.
  const dist = fileURLToPath(new URL('./node_modules/mermaid/dist', import.meta.url)), servedModules = new Map();
  assert(fs.existsSync(dist) && fs.realpathSync(dist) === dist && fs.statSync(dist).isDirectory(), 'Install the isolated reader Mermaid distribution before rendering');
  assert(fs.existsSync(path.join(dist, 'mermaid.esm.min.mjs')), 'The reader Mermaid browser entry is missing');
  const server = http.createServer((request, response) => {
    try {
      if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">import mermaid from "/mermaid.esm.min.mjs";window.mermaid=mermaid;</script></body></html>'); return; }
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
      const file = path.resolve(dist, relative);
      assert(file.startsWith(dist + path.sep) && /\.(?:mjs|js)$/u.test(file) && fs.realpathSync(file) === file && fs.statSync(file).isFile());
      const bytes = fs.readFileSync(file), digest = hash(bytes);
      const previous = servedModules.get(relative); assert(!previous || previous.sha256 === digest, 'Mermaid module changed during rendering');
      servedModules.set(relative, { path: relative, sha256: digest });
      response.setHeader('Content-Type', 'application/javascript'); response.end(bytes);
    } catch { response.statusCode = 404; response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser; const rendered = [], denied = [];
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const definition of definitions) {
      const context = await browser.newContext();
      try {
        await context.route('**/*', route => { if (route.request().url().startsWith(origin + '/')) return route.continue(); denied.push(route.request().url()); return route.abort(); });
        const page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => window.mermaid);
        const svg = await page.evaluate(async ({ code, id }) => {
          window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, deterministicIds: true, deterministicIDSeed: id, maxEdges: 500, look: 'classic', theme: 'base', fontFamily: 'Arial, sans-serif', themeVariables: { fontFamily: 'Arial, sans-serif', primaryColor: '#ffffff', primaryTextColor: '#1c2024', primaryBorderColor: '#60646c', lineColor: '#60646c', secondaryColor: '#f0f0f3', tertiaryColor: '#ffffff' }, flowchart: { htmlLabels: false }, arrowMarkerAbsolute: false });
          return (await window.mermaid.render(id, code)).svg;
        }, { code: definition.code, id: definition.id });
        rendered.push({ ...definition, svg, svgSha256: hash(svg), ...validateDiagramSvg(svg) });
      } finally { await context.close(); }
    }
    assert.equal(denied.length, 0, `Diagram requested an external resource: ${denied.join(', ')}`);
    for (const module of servedModules.values()) assert.equal(hash(fs.readFileSync(path.join(dist, module.path))), module.sha256, 'Mermaid distribution changed during rendering');
    return { diagrams: rendered, toolchain: { mermaid: JSON.parse(fs.readFileSync(path.join(dist, '../package.json'), 'utf8')).version, chromium: browser.version(), modules: [...servedModules.values()].sort((a, b) => a.path.localeCompare(b.path)), packageLockSha256: hash(fs.readFileSync(new URL('./package-lock.json', import.meta.url))), config: 'strict/htmlLabels=false/deterministicIds/neutral theme/Arial sans-serif' } };
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

export async function prepareDiagramPages(pages, registry) {
  const definitions = collectDocumentationDiagrams(pages, registry), rendered = await renderDocumentationDiagrams(definitions), assets = [];
  const result = pages.map(page => {
    const lines = page.text.split('\n');
    for (const diagram of rendered.diagrams.filter(entry => entry.page === page.relative).reverse()) {
      const asset = `diagrams/${diagram.id}.svg`, relative = path.posix.relative(path.posix.dirname(page.relative), asset), alternative = `${diagram.id}-text`;
      assets.push({ path: asset, text: diagram.svg });
      const figure = `<figure class="documentation-diagram"><div class="diagram-scroll" tabindex="0" role="region" aria-label="${escape(diagram.readerQuestion)}"><img src="${escape(relative)}" width="${diagram.width}" height="${diagram.height}" alt="${escape(diagram.readerQuestion)}"></div><figcaption>${escape(diagram.readerQuestion)} <a href="#${alternative}">Read the text explanation</a>. Owner: ${escape(diagram.owner)}.</figcaption></figure>`;
      const source = `<details>\n<summary>Diagram source</summary>\n\n\`\`\`mermaid\n${diagram.code}\`\`\`\n\n</details>`;
      lines.splice(diagram.map[0], diagram.map[1] - diagram.map[0], figure, '', source, '', `<span id="${alternative}"></span>`);
    }
    return { ...page, text: lines.join('\n') };
  });
  return { pages: result, assets, manifest: { schemaVersion: 'kubeclaw-rendered-diagrams.v1', toolchain: rendered.toolchain, pages: pages.map(page => ({ path: page.relative, sourceMarkdownSha256: hash(page.searchSourceText ?? page.text) })), diagrams: rendered.diagrams.map(({ code, svg, map, ...entry }) => entry) } };
}

export async function verifyDiagramArtifact(outputRoot, repositoryRoot) {
  const root = fs.realpathSync(path.resolve(outputRoot)), reader = JSON.parse(fs.readFileSync(path.join(root, 'reader-manifest.json'), 'utf8'));
  assert.equal(reader.schemaVersion, 'kubeclaw-reader-artifact.v1');
  const outputs = new Map(reader.outputs.map(item => [item.path, item]));
  function read(relative) {
    const entry = outputs.get(relative); assert(entry, `Unmanifested diagram input: ${relative}`);
    const file = path.join(root, relative); assert.equal(fs.realpathSync(file), file);
    const bytes = fs.readFileSync(file); assert.equal(hash(bytes), entry.sha256); assert.equal(bytes.length, entry.bytes); return bytes;
  }
  const manifest = JSON.parse(read('diagram-manifest.json')); assert.equal(manifest.schemaVersion, 'kubeclaw-rendered-diagrams.v1');
  const canonical = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs/config/documentation-publication-manifest.json'), 'utf8')).pages.map(entry => { assert(entry.sourcePath.startsWith('docs/site/')); return entry.sourcePath.slice('docs/site/'.length); });
  assert.equal(new Set(manifest.pages.map(page => page.path)).size, manifest.pages.length);
  assert.deepEqual(new Set(manifest.pages.map(page => page.path)), new Set(canonical));
  const pages = [], observed = [];
  for (const page of manifest.pages) {
    assert(page.path === path.posix.normalize(page.path) && !page.path.startsWith('../') && !path.isAbsolute(page.path) && !page.path.includes('\\') && page.path.endsWith('.md'));
    const file = path.join(root, page.path); assert.equal(fs.realpathSync(file), file); const bytes = fs.readFileSync(file); assert.equal(hash(bytes), page.sourceMarkdownSha256);
    pages.push({ relative: page.path, text: bytes.toString('utf8') });
    const ids = new Set(), figures = [];
    function walk(node) {
      const attributes = Object.fromEntries((node.attrs ?? []).map(item => [item.name, item.value]));
      if (attributes.id) ids.add(attributes.id);
      if (node.tagName === 'figure' && attributes.class?.split(/\s+/u).includes('documentation-diagram')) figures.push(node);
      for (const child of node.childNodes ?? []) walk(child);
    }
    walk(parse(read(page.path.replace(/\.md$/u, '.html')).toString('utf8')));
    for (const figure of figures) {
      const nodes = []; function collect(node) { nodes.push(node); for (const child of node.childNodes ?? []) collect(child); } collect(figure);
      const image = nodes.find(node => node.tagName === 'img'); assert(image, 'Diagram lost its rendered image');
      const attributes = Object.fromEntries(image.attrs.map(item => [item.name, item.value]));
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(page.path), attributes.src));
      const entry = manifest.diagrams.find(diagram => target === `diagrams/${diagram.id}.svg` && diagram.page === page.path); assert(entry, 'Diagram image is not in its owning page receipt');
      assert.equal(attributes.alt, entry.readerQuestion); assert.equal(Number(attributes.width), entry.width); assert.equal(Number(attributes.height), entry.height);
      const region = nodes.find(node => node.tagName === 'div' && node.attrs.some(attribute => attribute.name === 'class' && attribute.value === 'diagram-scroll'));
      assert(region?.attrs.some(attribute => attribute.name === 'tabindex' && attribute.value === '0'), 'Diagram scrolling is not keyboard focusable');
      assert(region.attrs.some(attribute => attribute.name === 'aria-label' && attribute.value === entry.readerQuestion));
      assert(ids.has(`${entry.id}-text`), 'Diagram lost its text alternative destination');
      assert(nodes.some(node => node.tagName === 'a' && node.attrs.some(attribute => attribute.name === 'href' && attribute.value === `#${entry.id}-text`)), 'Diagram caption lost its text alternative link');
      const svg = read(target).toString('utf8'); assert.equal(hash(svg), entry.svgSha256); assert.deepEqual(validateDiagramSvg(svg), { width: entry.width, height: entry.height });
      observed.push(entry.id);
    }
  }
  assert.deepEqual(observed.sort(), manifest.diagrams.map(diagram => diagram.id).sort(), 'Rendered diagram set differs from its source registry');
  const registry = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'docs/config/documentation-diagrams.json'), 'utf8'));
  const fresh = await prepareDiagramPages(pages, registry);
  assert.deepEqual(fresh.manifest, manifest, 'Diagram differs from a fresh deterministic render of its source');
  return { pages: pages.length, diagrams: observed.length, freshRenderHashesMatched: observed.length, localOnly: true, limit: 'Source/owner/question/visible alternative routing, static SVG and deterministic render checks only; not per-edge semantic or human screenreader acceptance.' };
}
