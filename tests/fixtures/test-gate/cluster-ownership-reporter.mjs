// Preserve the genuine node:test error tree, including non-enumerable causes.
function errorTree(error) {
  if (!error || typeof error !== 'object') return error;
  return { name: error.name, message: error.message, code: error.code, failureType: error.failureType,
    cause: errorTree(error.cause), errors: error.errors?.map(errorTree) };
}
export default async function* reporter(source) {
  for await (const event of source) {
    if (event.type === 'test:fail' || event.type === 'test:pass') yield JSON.stringify({
      type: event.type, name: event.data.name, error: errorTree(event.data.details?.error),
    }) + '\n';
  }
}
