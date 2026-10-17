import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Test-only resolver for the actual published role; never fabricates boot captures.
const root = process.env.PIPELINE_IMAGE_TEST_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Published image-test root required');
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('/app/prism/')
    ? pathToFileURL(path.join(root, specifier.slice('/app/prism/'.length))).href : specifier, context);
} });
