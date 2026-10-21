import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { githubHeadingText, githubSlug } from '../lib/docs-markdown-anchors.mjs';

const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const groups = [['', 'Start here'], ['understand', 'Understand'], ['use', 'Operate'], ['extend', 'Extend'], ['reference', 'Reference'], ['status', 'Current status'], ['decisions', 'Decisions']];

// The same function runs in build tests and in the delivered browser script.
// Editorial synonyms describe reader intent; only actual selected routes can
// receive a result. They cannot admit an internal or missing page to the index.
export function searchReaderPages(index, query) {
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{Letter}\p{Number}.$_-]+/gu, ' ').trim();
  const aliases = {
    'use/recovery.html': ['backup restore disaster recovery durable state'],
    'use/install.html': ['install platform deployment prerequisites setup cluster'],
    'use/diagnose.html': ['troubleshoot diagnose problem logs incident'],
    'extend/first-plugin.html': ['first plugin create extension tutorial author'],
    'extend/developer-handbook.html': ['change core platform developer development handbook'],
    'reference/configuration-precedence.html': ['configuration precedence overrides defaults environment settings'],
    'reference/roles-and-package-ownership.html': ['runtime roles bundles package ownership permissions grants'],
    'use/workflows/README.html': ['first pipeline project compile workflow example'],
    'use/plugins.html': ['activate deactivate remove operate plugins'],
    'use/prism-studio.html': ['prism studio operate user interface'],
  };
  const words = [...new Set(normalize(query).split(/\s+/u).filter(Boolean))];
  if (!words.length) return [];
  return index.flatMap(page => {
    const title = normalize(page.title), headings = normalize((page.headings ?? []).join(' ')), text = normalize(page.text);
    const alias = normalize((aliases[page.route] ?? []).join(' '));
    const all = `${title} ${headings} ${text} ${alias}`;
    if (!words.every(word => all.includes(word))) return [];
    const score = words.reduce((sum, word) => sum
      + (title.includes(word) ? 80 : 0) + (headings.includes(word) ? 24 : 0)
      + (alias.includes(word) ? 40 : 0) + Math.min(20, text.split(word).length - 1), 0)
      + (words.every(word => alias.includes(word)) ? 200 : 0);
    return [{ page, score }];
  }).sort((a, b) => b.score - a.score || a.page.route.localeCompare(b.page.route, 'en-US')).map(item => item.page);
}

// Convert parsed destinations only. Code examples and source-pinned URLs stay bytes.
export function readerHref(href, page, routes, assets, sourceLink) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(href)) return href;
  const match = /^([^?#]*)(.*)$/u.exec(href);
  if (!match[1]) return href;
  const target = path.posix.normalize(match[1].startsWith('/') ? decodeURIComponent(match[1]).slice(1) : path.posix.join(path.posix.dirname(page), decodeURIComponent(match[1])));
  const route = routes.get(target) ?? routes.get(target.replace(/\/$/u, ''));
  if (route) return path.posix.relative(path.posix.dirname(page), route.slice(1)) + match[2];
  if ([...routes.values()].some(value => value.slice(1) === target)) return href;
  if (assets.has(target)) return href;
  if (target.startsWith('../') && sourceLink) return sourceLink(target) + match[2];
  throw new Error(`Reader destination is not a published page or asset: ${page}: ${href}`);
}

export function renderReaderMarkdown(text, page, routes, assets, sourceLink) {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  // Keep scope/evidence available without making every mobile reader scroll
  // through the same metadata before reaching the actual task.
  text = text.replace(/^(# [^\n]+\n\n)((?:(?:Status|Audience|Owner|Evidence|Evidence revision|Applies to|Last verified):[^\n]+\n)+)\n/u,
    (_all, heading, metadata) => `${heading}<details>\n<summary>Page scope and sources</summary>\n\n${metadata.trimEnd().replaceAll('\n', '  \n')}\n\n</details>\n\n`);
  const tokens = md.parse(text, {});
  const headings = [];
  const counts = new Map();
  function visit(list) {
    for (let index = 0; index < list.length; index++) {
      const token = list[index];
      if (token.type === 'heading_open') {
        const raw = list[index + 1].content;
        const label = githubHeadingText(raw);
        const base = githubSlug(label);
        const count = counts.get(base) ?? 0;
        counts.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        token.attrSet('id', id);
        headings.push({ id, label, level: Number(token.tag.slice(1)) });
      }
      if (token.type === 'link_open' || token.type === 'image') {
        const attribute = token.type === 'image' ? 'src' : 'href';
        token.attrSet(attribute, readerHref(token.attrGet(attribute), page, routes, assets, sourceLink));
      }
      if (token.children) visit(token.children);
    }
  }
  visit(tokens);
  const html = sanitizeHtml(md.renderer.render(tokens, md.options, {}), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'details', 'summary', 'img'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, '*': ['id'], code: ['class'], table: ['tabindex'], pre: ['tabindex'], details: ['open'], img: ['src', 'alt', 'title', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      table: (tagName, attributes) => ({ tagName, attribs: { ...attributes, tabindex: '0' } }),
      pre: (tagName, attributes) => ({ tagName, attribs: { ...attributes, tabindex: '0' } }),
      a: (tagName, attributes) => {
        // Several source pages provide an explicit anchor for the following
        // identically named heading. The rendered heading owns that unique ID.
        const { id, ...rest } = attributes;
        return { tagName, attribs: { ...rest,
          ...(id && !headings.some(h => h.id === id) ? { id } : {}),
          ...(attributes.href ? { href: readerHref(attributes.href, page, routes, assets, sourceLink) } : {}) } };
      },
    },
  });
  return { html, headings, title: headings.find(h => h.level === 1)?.label ?? page };
}

function shell({ title, body, nav, toc = '', prefix, revision }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · KubeClaw Documentation</title><link rel="stylesheet" href="${prefix}reader.css">
<script src="${prefix}reader.js" defer></script></head><body>
<a class="skip" href="#main">Skip to content</a>
<header><a class="brand" href="${prefix}README.html">KubeClaw <span>Documentation</span></a><a href="${prefix}search.html">Search documentation</a></header>
<div class="layout"><details class="navigation" open><summary>Documentation navigation</summary><nav aria-label="Documentation">${nav}</nav></details>
<main id="main" tabindex="-1"><article>${body}</article><footer>Documentation source <code>${escape(revision.slice(0, 12))}</code> · <a href="${prefix}README.html">Documentation home</a></footer></main>
${toc ? `<aside aria-label="On this page"><strong>On this page</strong>${toc}</aside>` : ''}</div></body></html>\n`;
}

// Inputs come only from the publication selector; this never walks the repository.
export function buildReader({ outputRoot, pages, assets, revision, sourceLink }) {
  const routes = new Map(pages.map(p => [p.relative, `/${p.relative.slice(0, -3)}.html`]));
  const directories = new Set();
  for (const asset of assets) {
    for (let dir = path.posix.dirname(asset); dir !== '.'; dir = path.posix.dirname(dir)) directories.add(dir);
  }
  for (const dir of directories) routes.set(dir, routes.get(`${dir}/README.md`) ?? `/${dir}/index.html`);
  const allowedAssets = new Set(assets);
  const rendered = pages.map(p => ({ ...p, ...renderReaderMarkdown(p.text, p.relative, routes, allowedAssets, sourceLink) }));
  const outputs = [];
  const write = (relative, text) => {
    const target = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    outputs.push({ path: relative, sha256: hash(text), bytes: Buffer.byteLength(text) });
  };
  function navigation(relative, prefix) {
    return groups.map(([group, label]) => {
      const items = rendered.filter(p => (p.relative.includes('/') ? p.relative.split('/')[0] : '') === group);
      return `<section><h2>${label}</h2><ul>${items.map(p => `<li><a ${p.relative === relative ? 'aria-current="page" ' : ''}href="${prefix}${routes.get(p.relative).slice(1)}">${escape(p.title)}</a></li>`).join('')}</ul></section>`;
    }).join('');
  }
  for (const page of rendered) {
    const route = routes.get(page.relative).slice(1);
    const prefix = '../'.repeat(route.split('/').length - 1);
    const toc = `<ul>${page.headings.filter(h => h.level === 2).map(h => `<li><a href="#${escape(h.id)}">${escape(h.label)}</a></li>`).join('')}</ul>`;
    write(route, shell({ title: page.title, body: page.html, nav: navigation(page.relative, prefix), toc, prefix, revision }));
  }
  for (const dir of directories) {
    if (routes.has(`${dir}/README.md`)) continue;
    const prefix = '../'.repeat(dir.split('/').length);
    const links = assets.filter(asset => asset.startsWith(`${dir}/`)).map(asset => `<li><a href="${escape(asset.slice(dir.length + 1))}">${escape(asset.slice(dir.length + 1))}</a></li>`).join('');
    write(`${dir}/index.html`, shell({ title: dir, prefix, revision, nav: navigation('', prefix), body: `<h1>${escape(dir)}</h1><p>Published reader example files. Download or inspect the original file bytes.</p><ul>${links}</ul>` }));
  }
  write('search.html', shell({ title: 'Search documentation', prefix: '', revision, nav: navigation('', ''), body: `<h1>Search documentation</h1><p>Search every published page, including configuration names and code examples. All search data stays in this documentation artifact.</p><form id="search-form" role="search"><label for="query">Words or exact identifier</label><div class="search-controls"><input id="query" name="q" type="search" autocomplete="off"><button>Search</button></div></form><p id="search-status" role="status"></p><ol id="search-results"></ol><noscript><p>Search requires JavaScript. Use the documentation navigation or your browser's Find command to read without JavaScript.</p></noscript>` }));
  // Script loading also supports a locally opened artifact without a fetch server.
  const index = rendered.map(p => ({ title: p.title, headings: p.headings.map(h => h.label), route: routes.get(p.relative).slice(1), text: sanitizeHtml(p.html, { allowedTags: [], allowedAttributes: {} }).replace(/&(?:amp|lt|gt|quot);/gu, s => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' })[s]).replace(/\s+/gu, ' ') }));
  write('search-index.js', `window.kubeclawSearchIndex=${JSON.stringify(index).replace(/</gu, '\\u003c')};\n`);
  write('reader.css', readerCss);
  write('reader.js', readerScript);
  write('index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=README.html"><title>KubeClaw Documentation</title></head><body><a href="README.html">Open KubeClaw Documentation</a></body></html>\n`);
  const manifest = { schemaVersion: 'kubeclaw-reader-artifact.v1', revision, pageCount: rendered.length, outputs: outputs.sort((a, b) => a.path.localeCompare(b.path)) };
  write('reader-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const readerCss = `:root{color-scheme:light;--ink:#1c2024;--muted:#60646c;--line:#d9d9e0;--accent:#005cbe}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:#fff;font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible,input:focus-visible,button:focus-visible,table:focus-visible,pre:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.skip{position:fixed;top:-100px;left:16px;background:#fff;padding:8px 16px;z-index:5}.skip:focus{top:8px}header{min-height:72px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 32px}header a{font-size:14px}.brand{color:var(--ink);text-decoration:none;font-size:20px;font-weight:700}.brand span{font-size:14px;font-weight:400;color:var(--muted);margin-left:12px}.layout{display:grid;grid-template-columns:256px minmax(0,1fr) 200px;max-width:1600px;margin:auto}.navigation{padding:24px 20px;border-right:1px solid var(--line);min-width:0}.navigation summary{font-size:14px;font-weight:600;cursor:pointer}.navigation nav{margin-top:24px}.navigation section{margin:0 0 24px}.navigation h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px;color:var(--muted)}.navigation ul,aside ul{list-style:none;margin:0;padding:0}.navigation li{margin:2px 0}.navigation a{display:block;padding:6px 8px;font-size:13px;line-height:1.4;color:var(--muted);text-decoration:none;border-radius:4px;overflow-wrap:anywhere}.navigation a:hover{background:#f0f0f3;color:var(--ink)}.navigation a[aria-current]{background:#f0f0f3;color:var(--accent);font-weight:600}main{min-width:0;padding:48px 40px;max-width:100%}article{max-width:76ch;margin:auto;overflow-wrap:anywhere}h1{font-size:32px;line-height:1.2;letter-spacing:-.025em;margin:0 0 28px}h2{font-size:24px;line-height:1.3;letter-spacing:-.015em;margin:40px 0 16px}h3{font-size:19px;line-height:1.4;margin:32px 0 12px}h1,h2,h3,h4,[id]{scroll-margin-top:24px}p,ul,ol{margin:0 0 20px}li>p{margin-bottom:8px}code,pre{font:14px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}code{background:#f0f0f3;border-radius:3px;padding:2px 4px}pre{background:#f6f7f9;border:1px solid var(--line);border-radius:6px;padding:20px;overflow:auto;white-space:pre;max-width:100%}pre code{background:none;padding:0}table{display:block;overflow:auto;max-width:100%;border-collapse:collapse;font-size:14px;margin:24px 0}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid var(--line);min-width:120px}th{background:#f6f7f9;font-weight:600}blockquote{margin:24px 0;padding:8px 20px;border-left:3px solid var(--line);color:var(--muted)}details:not(.navigation){margin:20px 0;padding:12px;border:1px solid var(--line)}summary{cursor:pointer}img{max-width:100%;height:auto}aside{padding:48px 20px;font-size:12px;line-height:1.5}aside strong{font-size:12px}aside li{margin:12px 0}aside a{color:var(--muted);text-decoration:none}footer{font-size:12px;color:var(--muted);border-top:1px solid var(--line);margin-top:48px;padding-top:20px}label{display:block;font-weight:600;margin-bottom:8px}.search-controls{display:flex;gap:8px}input{min-width:0;flex:1;padding:12px;border:1px solid #80838d;border-radius:4px;font:inherit}button{padding:12px 20px;border:0;border-radius:4px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}#search-results{padding-left:24px}#search-results li{margin-bottom:24px}#search-results p{font-size:14px;color:var(--muted)}@media(min-width:1000px){.navigation{max-height:calc(100vh - 8px);overflow:auto;position:sticky;top:0;align-self:start}aside{max-height:100vh;overflow:auto;position:sticky;top:0;align-self:start}}@media(max-width:1100px){.layout{grid-template-columns:240px minmax(0,1fr)}aside{display:none}main{padding:36px 28px}}@media(max-width:700px){header{padding:16px;gap:12px;flex-wrap:wrap}.brand span{display:block;margin:0}.layout{display:block}.navigation{border-right:0;border-bottom:1px solid var(--line);padding:16px}.navigation nav{max-height:40vh;overflow:auto}main{padding:32px 16px}h1{font-size:28px}h2{font-size:22px}pre{padding:12px}.search-controls{flex-wrap:wrap}input{width:100%}}@media print{header,.navigation,aside,footer,.skip{display:none}.layout{display:block}main{padding:0}pre,table{white-space:pre-wrap;overflow:visible}a{color:inherit}}\n`;

const readerScript = `'use strict';
const searchReaderPages=${searchReaderPages.toString()};
if (matchMedia('(max-width:700px)').matches) document.querySelector('.navigation').open=false;
const form=document.getElementById('search-form');
if(form){
 const input=document.getElementById('query'),status=document.getElementById('search-status'),results=document.getElementById('search-results');
 let loading;
 const load=()=>loading??=(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='search-index.js';script.onload=()=>resolve(window.kubeclawSearchIndex);script.onerror=()=>reject(new Error('index unavailable'));document.head.append(script);}));
 let sequence=0;
 async function search(){const current=++sequence;const query=input.value.trim();results.replaceChildren();if(!query){status.textContent='Enter words or an exact identifier.';return;}status.textContent='Loading documentation index…';
 try{const index=await load();if(current!==sequence)return;const words=query.toLocaleLowerCase('en-US').split(/\\s+/u);const matches=searchReaderPages(index,query);status.textContent=matches.length?matches.length+' pages found. Showing up to 50.':'No results. Try fewer words or a configuration name.';
 for(const page of matches.slice(0,50)){const li=document.createElement('li'),link=document.createElement('a'),snippet=document.createElement('p');link.href=page.route;link.textContent=page.title;const at=Math.max(0,page.text.toLocaleLowerCase('en-US').indexOf(words[0])-80);snippet.textContent=(at?'…':'')+page.text.slice(at,at+240)+'…';li.append(link,snippet);results.append(li);}
 }catch{if(current===sequence)status.textContent='Search index could not be loaded. Use the documentation navigation or retry after reloading.';}}
 form.addEventListener('submit',event=>{event.preventDefault();const url=new URL(location.href);url.searchParams.set('q',input.value.trim());history.replaceState(null,'',url);search();});input.value=new URLSearchParams(location.search).get('q')??'';if(input.value)search();
}\n`;
