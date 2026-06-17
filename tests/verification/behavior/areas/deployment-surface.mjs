export async function registerDeploymentSurfaceArea({
  record,
  sourceRoot,
  overlayRoot,
  contractPath,
  installFakeRedis,
  xaddEvents,
  flushAsync,
  startGatewayServer,
  fs,
  os,
  path,
  assert,
  execFileSync,
  readOverlayText,
  materializeRuntimeTree,
  importRuntimeModule,
  ensureDir,
  writeExecutable,
  runtimeRoot,
  sandboxRuntimeRoot,
  pipelineEntryMod,
  pipelineIndexMod,
  pipelineRunnerMod,
  orchestrationMod,
  pipelineRedisMod,
  runtimeMod,
  gatewayMod,
  discordMod,
  lifecycleMod,
  lifecycleStateMod,
  monitorMod,
  redisLogMod,
  pathsMod,
  busterPipelineMod,
}) {
await record('helm render for nova values preserves service exposure, skills merge behavior, and writable config provenance', async () => {
  const checkScript = path.join(sourceRoot, 'tests/verification/deployment/check-deployment-truth.mjs');
  const output = execFileSync('node', [checkScript, '--source-root', sourceRoot], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert(Array.isArray(parsed.checks));
  assert(parsed.checks.length >= 10);
  assert(parsed.checks.includes('Rendered Nova Service keeps the gateway internal while exposing only Prism preview through NodePort'));
  assert(parsed.checks.includes('Helm render includes Buster Service and Deployment'));
  assert(parsed.checks.includes('Rendered Deployment blocks customSkills from overriding core runtime paths'));
  assert(parsed.checks.includes('Rendered init flow keeps OpenClaw config SecretRef-backed, writable, and doctor-compatible'));
  assert(parsed.checks.includes('Deploy smoke verifies in-pod gateway status, packaged skills, and runtime swarm config'));
  assert.equal(typeof parsed.kubeconform?.summary, 'string');
  assert(parsed.kubeconform.summary.includes('Valid:'));
});
}
