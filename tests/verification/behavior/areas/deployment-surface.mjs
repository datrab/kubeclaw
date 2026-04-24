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
  assert(parsed.checks.includes('Rendered Service preserves gateway and preview NodePorts'));
  assert(parsed.checks.includes('Rendered Deployment preserves packaged-skills merge before custom overlay'));
  assert(parsed.checks.includes('Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json'));
  assert(parsed.checks.includes('Rendered init flow copies swarm.config.json and .semgrep.yml into the writable runtime config surface'));
  assert(parsed.checks.includes('Rendered swarm-config ConfigMap matches the chart-provided swarm.config.json and .semgrep.yml artifacts'));
  assert(parsed.checks.includes('Templates still pin SWARM_CONFIG and default swarm config artifacts in source'));
  assert(parsed.checks.includes('Build-images workflow still builds and publishes the general runtime image from docker/Dockerfile.general'));
  assert(parsed.checks.includes('Deploy script remains executable as the canonical operator deployment surface'));
  assert(parsed.checks.includes('Deploy script exposes a canonical local image-build command for deployment verification'));
  assert(parsed.checks.includes('Deploy script exposes a canonical live deployment verification command'));
  assert(parsed.checks.includes('Live deployment verification builds both runtime images and pushes them to registry-local'));
  assert(parsed.checks.includes('Live deployment verification redeploys Nova and Buster against registry-local before smoke runs'));
  assert(parsed.checks.includes('Deploy script exposes canonical pod-level smoke commands for the deployed agents'));
  assert(parsed.checks.includes('Deploy smoke waits for rollout and pod readiness before checking the live pod surface'));
  assert(parsed.checks.includes('Deploy smoke verifies in-pod gateway status, packaged skills, and writable swarm config'));
  assert.equal(typeof parsed.kubeconform?.summary, 'string');
  assert(parsed.kubeconform.summary.includes('Valid:'));
});
}
