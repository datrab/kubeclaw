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
  assert(parsed.checks.includes('Rendered Buster Service keeps the gateway internal'));
  assert(parsed.checks.includes('Rendered Buster Deployment preserves sandbox image and privileged Podman-in-Pod surface'));
  assert(parsed.checks.includes('Rendered Buster Deployment separates buster-pipeline.ts from the OpenClaw gateway container'));
  assert(parsed.checks.includes('Rendered Buster containers share OpenClaw runtime config, workspace, and merged skills'));
  assert(parsed.checks.includes('Rendered Buster gateway and pipeline containers both retain sandbox execution privileges and mounts'));
  assert(parsed.checks.includes('Rendered Buster Deployment exposes the colocated OpenClaw gateway URL to Buster startup'));
  assert(parsed.checks.includes('Rendered Buster Deployment honors the explicit gateway.url override'));
  assert(parsed.checks.includes('Rendered Buster Deployment keeps Redis, gateway-token, and Anthropic secret wiring'));
  assert(parsed.checks.includes('Rendered Buster Podman registries preserve registry-local live-verification pull path'));
  assert(parsed.checks.includes('Rendered Buster Deployment removes the legacy stream-processor sidecar'));
  assert(parsed.checks.includes('Chart and production values remove processor configuration'));
  assert(parsed.checks.includes('Rendered Deployment preserves packaged-skills merge before custom overlay'));
  assert(parsed.checks.includes('Rendered Deployment blocks customSkills from overriding core runtime paths'));
  assert(parsed.checks.includes('Rendered Deployment pins SWARM_CONFIG to /home/node/.openclaw/swarm.config.json'));
  assert(parsed.checks.includes('Rendered init flow keeps persistent config secret-free and renders secrets only into runtime config'));
  assert(parsed.checks.includes('Rendered probes use dependency-aware health checks instead of TCP-only port checks'));
  assert(parsed.checks.includes('Rendered agent Deployments define shutdown grace, preStop drain markers, and drain-aware readiness'));
  assert(parsed.checks.includes('Rendered swarm-config ConfigMap matches the chart-provided swarm.config.json and .semgrep.yml artifacts'));
  assert(parsed.checks.includes('Templates still pin SWARM_CONFIG and default swarm config artifacts in source'));
  assert(parsed.checks.includes('Custom skills ConfigMap comments match the /app/skills runtime path and mark customSkills extension-only'));
  assert(parsed.checks.includes('Build-images workflow still builds and publishes the general runtime image from docker/Dockerfile.general'));
  assert(parsed.checks.includes('Deploy script remains executable as the canonical operator deployment surface'));
  assert(parsed.checks.includes('Deploy script exposes a canonical local image-build command for deployment verification'));
  assert(parsed.checks.includes('Deploy script exposes a canonical live deployment verification command'));
  assert(parsed.checks.includes('Live deployment verification builds both runtime images and pushes them to registry-local'));
  assert(parsed.checks.includes('Live deployment verification preflights every deployed runtime image pull path'));
  assert(parsed.checks.includes('Live deployment verification redeploys Nova and Buster against registry-local before smoke runs'));
  assert(parsed.checks.includes('Deploy script exposes canonical pod-level smoke commands for the deployed agents'));
  assert(parsed.checks.includes('Deploy smoke waits for rollout and pod readiness before checking the live pod surface'));
  assert(parsed.checks.includes('Deploy smoke verifies in-pod gateway status, packaged skills, and runtime swarm config'));
  assert(parsed.checks.includes('Deploy script classifies optional setup/status/teardown failures instead of using broad silent fallbacks'));
  assert(parsed.checks.includes('Setup scripts classify optional failures, fence legacy broad git setup behind explicit opt-in, and document tracked deploy values'));
  assert.equal(typeof parsed.kubeconform?.summary, 'string');
  assert(parsed.kubeconform.summary.includes('Valid:'));
});
}
