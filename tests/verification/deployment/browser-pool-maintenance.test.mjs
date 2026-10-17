import test from 'node:test';
import assert from 'node:assert/strict';
import {requireRunningPoolService} from '../../../scripts/prepare-native-worker-pools.mjs';

const active={uid:0,subState:'running',controlGroup:'/kubeclaw.slice/kubeclaw-native-pools.service',mainPid:123,
  mainCgroup:'0::/kubeclaw.slice/kubeclaw-native-pools.service/setup',hostNamespaceMatches:true};
test('browser maintenance accepts a live pool service without requiring caller membership',()=>{
 assert.doesNotThrow(()=>requireRunningPoolService(active));
});
test('browser maintenance rejects exited services, different cgroups and non-host execution',()=>{
 for(const invalid of [{uid:1000},{subState:'exited'},{mainPid:0},{mainPid:NaN},{controlGroup:'/other'},
   {mainCgroup:'0::/user.slice/session.scope'},{hostNamespaceMatches:false}]) {
   assert.throws(()=>requireRunningPoolService({...active,...invalid}),/NATIVE_BROWSER_RUNNING_POOL_REQUIRED/);
 }
});
