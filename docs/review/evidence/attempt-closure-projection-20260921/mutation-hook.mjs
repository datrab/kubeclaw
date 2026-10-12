import {registerHooks} from 'node:module';
const changes={
  quota:['state.closures.length - this.#closureProjections.size >= this.#limits.maximumClosures','state.closures.length >= this.#limits.maximumClosures'],
  generation:['if (finalizedGeneration)','if (false)'],
  saving:["if(releasedBytes<=0)throw new Error('OBSERVABILITY_CLOSURE_RETIREMENT_NOT_SMALLER');",''],
};
const mutation=changes[process.env.OBS_CLOSURE_MUTANT];
if(!mutation)throw new Error('mutation required');
registerHooks({load(url,context,nextLoad){
  const result=nextLoad(url,context);
  if(!url.endsWith('/foundation/observability/durable-attempts.ts'))return result;
  const source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString();
  if(source.split(mutation[0]).length!==2)throw new Error('mutation site not unique');
  return {...result,source:source.replace(mutation[0],mutation[1])};
}});
