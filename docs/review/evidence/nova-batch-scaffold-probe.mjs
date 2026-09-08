import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {buildScaffold} from '../../../skills/nova/project_setup/tools/progress-scaffold-discovery.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'scaffold-review-'));
try{
 const swarmDir=path.join(root,'Projects/demo/src/.swarm');fs.mkdirSync(path.join(swarmDir,'modules/app'),{recursive:true});
 fs.writeFileSync(path.join(swarmDir,'modules/app/FORGE.md'),'# App');fs.writeFileSync(path.join(swarmDir,'modules/app/BUSTER.md'),'Test app');
 const context={repoRoot:root,project:'demo',swarmDir,scaffoldFile:path.join(swarmDir,'progress.scaffold.json'),progressFile:path.join(swarmDir,'progress.json'),pipelineFile:path.join(swarmDir,'pipeline.json')};
 const first=buildScaffold(context);first.pipeline.modules.app.tests['http-health'].config.url='https://reviewed.example.invalid';
 fs.writeFileSync(context.scaffoldFile,JSON.stringify(first));
 const next=buildScaffold(context);assert.notEqual(next.pipeline.modules.app.tests['http-health'].config.url,first.pipeline.modules.app.tests['http-health'].config.url);
 console.log(JSON.stringify({editedUrl:first.pipeline.modules.app.tests['http-health'].config.url,regeneratedUrl:next.pipeline.modules.app.tests['http-health'].config.url}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
