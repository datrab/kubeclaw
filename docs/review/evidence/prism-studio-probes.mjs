import assert from 'node:assert/strict';
import fs from 'node:fs';
import { puckChangeToOperation } from '../../../skills/prism/studio/puck-adapter.ts';
import { applyOperation } from '../../../skills/prism/domain/index.ts';
import { previewDocument } from '../../../skills/prism/studio/preview.ts';
import { validatePrism } from '@kubeclaw/prism-contracts-v1';
const fixture=JSON.parse(fs.readFileSync(new URL('../../../contracts/prism/v1/fixtures/minimal-web.json',import.meta.url),'utf8'));
const doc=structuredClone(fixture);
doc.views.home.root.children=[{id:'row-layout',type:'stack',props:{direction:'horizontal',gap:16},children:[{id:'body-text',type:'text',props:{content:'Unchanged'}}]}];
validatePrism('designDocument',doc);
// This is exactly the lossy Stack/Text projection emitted by app.tsx mapNode;
// no replacement adapter, domain, storage, or renderer implementation.
const projected={root:{props:{}},content:[{type:'Stack',props:{id:'row-layout',gap:16,content:[{type:'Text',props:{id:'body-text',text:'Unchanged'}}]}}]};
const operation=puckChangeToOperation(doc,projected);
assert.equal(operation.type,'node.props.set');assert.equal(operation.props.direction,'vertical');
const changed=applyOperation(doc,operation);assert.equal(changed.views.home.root.children[0].props.direction,'vertical');
console.log(JSON.stringify({probe:'unchanged-puck-projection',before:'horizontal',after:changed.views.home.root.children[0].props.direction,operation}));
const assets=structuredClone(fixture);
assets.assets={'hero-asset':{kind:'image',artifact:'artifact:sha256:'+'a'.repeat(64),mediaType:'image/png',role:'hero',alt:'Hero'}};
assets.views.home.root.children=[{id:'hero-image',type:'image',props:{asset:'hero-asset'}}];
try {validatePrism('designDocument',assets);}catch(e){console.log(JSON.stringify({probe:'asset-fixture-schema-error',message:e.message}));throw e;}
const html=previewDocument(assets);assert.match(html,/Preview unavailable/);assert.doesNotMatch(html,/<img/);
console.log(JSON.stringify({probe:'canonical-asset-preview',validated:true,previewUnavailable:true}));
