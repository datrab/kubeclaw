export async function execute(input, context) {
  if (input.fail === true) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: 'failed',
      reason: {
        code: 'tutorial.requested_failure',
        message: `The tutorial requested failure for ${input.name}.`,
      },
      artifacts: [],
    };
  }
  return {
    schemaVersion: 'stage-result.v2',
    outcome: 'passed',
    artifacts: [],
    facts: {
      'tutorial.greeting': `${context.contract.config.prefix}, ${input.name}!`,
    },
  };
}
