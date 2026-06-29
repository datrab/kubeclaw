import fs from 'node:fs';

const EXPECTED_BASE_IMAGE = 'registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';
const EXPECTED_APP = 'real-pipeline-e2e-nginx';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected ${JSON.stringify(needle)}`);
  }
}

function assertMatch(haystack, pattern, label) {
  if (!pattern.test(haystack)) {
    throw new Error(`${label}: expected ${pattern}`);
  }
}

const html = read('src/index.html');
const dockerfile = read('Dockerfile');
const manifest = read('k8s/deployment.yaml');

assertContains(html, 'REAL_E2E_NGINX_OK', 'html marker');
assertMatch(html, /<p id="run-id">(REAL_E2E_RUN_ID_PLACEHOLDER|real-pipeline-e2e-[a-z0-9-]+)<\/p>/, 'html run id');
assertContains(dockerfile, `FROM ${EXPECTED_BASE_IMAGE}`, 'pinned nginx base image');
assertContains(dockerfile, 'listen 8080;', 'nginx listener port');

assertContains(manifest, `name: ${EXPECTED_APP}`, 'deployment/service name');
assertContains(manifest, `app.kubernetes.io/name: ${EXPECTED_APP}`, 'app selector label');
assertContains(manifest, `image: ${EXPECTED_APP}:verification`, 'verification image tag');
assertMatch(manifest, /- name: http\s+containerPort: 8080/, 'named http container port');
assertMatch(manifest, /- name: http\s+port: 80\s+targetPort: http/, 'service target port');

console.log(JSON.stringify({
  ok: true,
  checked: [
    'html marker',
    'run id',
    'pinned base image',
    'nginx listener',
    'deployment/service identity',
    'verification image',
    'named http port',
    'service targetPort',
  ],
}));
