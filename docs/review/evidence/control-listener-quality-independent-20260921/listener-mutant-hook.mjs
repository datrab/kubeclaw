import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad) {
  const loaded=nextLoad(url,context);
  if(url.endsWith('/skills/prism/server/control-config.ts')) {
    const source=String(loaded.source);
    const changed=source.replace('port: control.port',`port: ${process.env.MUTANT_CONTROL_PORT}`);
    if(changed===source)throw new Error('mutant replacement missing');
    return {...loaded,source:changed};
  }
  return loaded;
}});
