import {registerHooks} from 'node:module';
const cases={
 quota:['attempt-completeness.ts','state.closures.length - store.closureProjections.size','state.closures.length'],
 generation:['attempt-results.ts','if (finalizedGeneration)','if (false)'],
 saving:['attempt-retirement.ts','if (releasedBytes <= 0)\n    throw new Error("OBSERVABILITY_CLOSURE_RETIREMENT_NOT_SMALLER");',''],
};
const selected=cases[process.env.OBS_STORE_MUTANT];if(!selected)throw new Error('mutation required');
registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);if(!url.endsWith('/observability/'+selected[0]))return loaded;
 const source=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString();
 if(source.split(selected[1]).length!==2)throw new Error('mutation site not unique');return {...loaded,source:source.replace(selected[1],selected[2])};
}});
