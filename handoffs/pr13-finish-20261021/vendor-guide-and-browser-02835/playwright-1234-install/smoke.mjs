import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery/package.json');
const {chromium}=require('playwright');
const core=require.resolve('playwright-core/package.json');
const browsers=JSON.parse(fs.readFileSync(new URL('./browsers.json','file://'+core)));
const executable='/home/node/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.goto('data:text/html,<title>Owned browser preparation</title><p>Ready</p>');
 if(await page.title()!=='Owned browser preparation')throw new Error('Browser preparation title mismatch');
 const result={playwrightVersion:require('playwright/package.json').version,browserVersion:browser.version(),selected:browsers.browsers.filter(item=>item.name==='chromium-headless-shell'),executable,executableSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),pageTitle:await page.title(),externalEndpoints:0,documentationArtifactTested:false};
 fs.writeFileSync('/home/node/.openclaw/workspace/tmp/pr13-finish-20261021/playwright-1234-install/smoke-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
