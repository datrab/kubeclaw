import fs from 'node:fs';

const artifactId = 'checkpoint:batch-1';
const namespace = 'test.checkpoint';

function artifactResponse(value) {
  const artifact = value?.artifact;
  if (!artifact || typeof artifact !== 'object') throw new Error('checkpoint artifact was not returned');
  return artifact;
}

export async function execute(_input, context) {
  const attempt = context.contract.lease.attempt;
  if (attempt.attemptNumber === 1) {
    const response = await context.invoke('artifacts.write', {
      operation: 'put_json',
      resource: { type: 'artifact.object', canonicalId: artifactId },
      payload: { namespace, mediaType: 'application/json', checkpoint: true,
        value: { batch: 1, result: 'completed' } },
    });
    artifactResponse(response);
    fs.writeFileSync(context.contract.config.markerPath, 'checkpointed\n', 'utf8');
    await new Promise(() => { setInterval(() => {}, 1_000); });
  }
  const artifact = context.artifact(artifactId);
  if (!artifact) throw new Error('durable checkpoint was not supplied to the recovered attempt');
  const response = await context.invoke('artifacts.read', {
    operation: 'get_json',
    resource: { type: 'artifact.object', canonicalId: artifactId },
    payload: { namespace, digest: artifact.digest },
  });
  if (response.value?.batch !== 1 || response.value?.result !== 'completed') {
    throw new Error('durable checkpoint content is invalid');
  }
  return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
}
