import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){
 const result=next(url,context);
 if(!url.endsWith('/skills/prism/server/studio-config.ts')) return result;
 let source=String(result.source);
 const edits={
  override:["environment[key] !== undefined","false"],
  port:['port: settings.port','port: 8080'],
  timeout:['controlTimeoutMs: settings.controlTimeoutMs','controlTimeoutMs: 250'],
  upstream:['new URL(settings.controlUrl)',"new URL('http://prism-control:8080')"],
 };
 const [from,to]=edits[process.env.STUDIO_MUTANT];
 if(!source.includes(from)) throw new Error('mutation target missing');
 source=source.replace(from,to);return {...result,source};
}});
