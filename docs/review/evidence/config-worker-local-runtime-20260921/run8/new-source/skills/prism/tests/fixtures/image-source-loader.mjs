import {registerHooks} from 'node:module';

// Local source execution of the unchanged image proof; not a container build.
const repository = new URL('../../../../', import.meta.url);
registerHooks({resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('/app/prism/')
    ? new URL(specifier.slice('/app/prism/'.length), repository).href : specifier, context);
}});
