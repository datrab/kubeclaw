import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);
 if(url.endsWith('/skills/worker/core/worker/native-cleanup-reconciliation.ts')){
  const source=String(result.source);
  const from='failed.operation.values.effectsDigest !== successfulCleanup.operation.values.effectsDigest';
  if(!source.includes(from))throw new Error('MUTANT_TARGET_MISSING');
  return {...result,source:source.replace(from,'false')};
 }
 return result;
}});
