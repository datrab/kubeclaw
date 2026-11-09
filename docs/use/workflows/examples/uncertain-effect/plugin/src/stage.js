// Explicitly trusted local teaching stage, not a shipped product registration.
export async function execute(_input, context) {
  await context.invoke('runtime.dispatch', {
    operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: 'mutation-service' },
    payload: { operation: 'append', value: 'one bounded local mutation' },
  });
  throw new Error('UNCERTAIN_FIXTURE_RESPONSE_MUST_BE_WITHHELD');
}
