import { renderNode } from '../../../skills/prism/renderer/index.ts';
const context={components:{card:{root:{id:'copy',type:'text',props:{content:'base'}},variants:{active:{copy:{content:'variant'}}}}}};
console.log('Variant content plus independent override:',renderNode({id:'instance',type:'component',props:{component:'card',variant:'active',overrides:{copy:{hidden:true}}}}, {},context));
console.log('Pagination declared actions:',renderNode({id:'pages',type:'pagination',props:{page:1,pageCount:2,previousAction:'back',nextAction:'forward'}}));
