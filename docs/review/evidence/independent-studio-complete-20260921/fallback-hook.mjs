import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
 const result=next(url,context);
 if(!url.endsWith('/foundation/config/swarm.ts')) return result;
 const from='function prismSettingsFromConfig(value: unknown): PrismSettings {';
 const source=String(result.source);
 if(!source.includes(from)) throw new Error('FALLBACK_MUTATION_TARGET_MISSING');
 return {...result,source:source.replace(from,from+"\n if ((value as any)?.operator?.prism?.studio && (value as any).operator.prism.studio.port === undefined) (value as any).operator.prism.studio.port = 8080;")};
}});
