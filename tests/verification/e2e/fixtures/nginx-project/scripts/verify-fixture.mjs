import fs from 'node:fs';

const EXPECTED_BASE_IMAGE = 'registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8';
const EXPECTED_APP = 'real-pipeline-e2e-nginx';
const moduleArgIndex = process.argv.indexOf('--module');
const requestedModule = moduleArgIndex >= 0 ? process.argv[moduleArgIndex + 1] : 'all';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected ${JSON.stringify(needle)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: unexpected ${JSON.stringify(needle)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertMatch(haystack, pattern, label) {
  if (!pattern.test(haystack)) {
    throw new Error(`${label}: expected ${pattern}`);
  }
}

function attrsForTag(htmlText, tagName, attrName, attrValue) {
  const tagPattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  for (const match of htmlText.matchAll(tagPattern)) {
    const attrs = match[1] || '';
    if (new RegExp(`\\b${attrName}="${attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(attrs)) return attrs;
  }
  throw new Error(`${tagName}[${attrName}=${attrValue}] not found`);
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function yamlDocByKind(yamlText, kind) {
  const docs = yamlText.split(/^---\s*$/m);
  const doc = docs.find((entry) => new RegExp(`^kind:\\s*${kind}\\s*$`, 'm').test(entry));
  if (!doc) throw new Error(`manifest ${kind}: not found`);
  return doc;
}

function yamlScalar(doc, keyPath) {
  const [key] = keyPath.split('.').slice(-1);
  const match = doc.match(new RegExp(`^\\s*${key}:\\s*([^\\n]+)\\s*$`, 'm'));
  return match ? match[1].trim() : null;
}

function assertHtmlComposition() {
  const branchASection = attrsForTag(html, 'section', 'id', 'branch-a');
  assertEqual(attrValue(branchASection, 'data-module'), '02-nginx', 'branch-a module owner');
  assertEqual(attrValue(branchASection, 'data-source'), '/content/branch-a.html', 'branch-a source route');

  const branchBSection = attrsForTag(html, 'section', 'id', 'branch-b');
  assertEqual(attrValue(branchBSection, 'data-module'), '03-nginx', 'branch-b module owner');
  assertEqual(attrValue(branchBSection, 'data-source'), '/assets/branch-b.css', 'branch-b source route');

  const integrationSection = attrsForTag(html, 'section', 'id', 'integration');
  assertEqual(attrValue(integrationSection, 'data-module'), '04-nginx', 'integration module owner');
  assertEqual(attrValue(integrationSection, 'data-composes'), '/content/branch-a.html,/assets/branch-b.css', 'integration composition inputs');

  const stylesheet = attrsForTag(html, 'link', 'rel', 'stylesheet');
  assertEqual(attrValue(stylesheet, 'href'), '/assets/branch-b.css', 'stylesheet route');
}

function assertReusableManifest() {
  const deployment = yamlDocByKind(manifest, 'Deployment');
  const service = yamlDocByKind(manifest, 'Service');
  assertEqual(yamlScalar(deployment, 'metadata.name'), EXPECTED_APP, 'deployment name');
  assertEqual(yamlScalar(deployment, 'image'), `${EXPECTED_APP}:verification`, 'reusable placeholder image');
  assertMatch(deployment, /selector:\s+matchLabels:\s+app\.kubernetes\.io\/name: real-pipeline-e2e-nginx/s, 'deployment selector labels');
  assertMatch(deployment, /ports:\s+- name: http\s+containerPort: 8080/s, 'deployment named http port');
  assertMatch(deployment, /readinessProbe:\s+httpGet:\s+path: \/\s+port: http/s, 'deployment readiness probe');
  assertMatch(deployment, /livenessProbe:\s+httpGet:\s+path: \/\s+port: http/s, 'deployment liveness probe');
  assertMatch(deployment, /resources:\s+requests:\s+cpu: 10m\s+memory: 32Mi\s+limits:\s+cpu: 100m\s+memory: 128Mi/s, 'deployment resource shape');
  assertEqual(yamlScalar(service, 'metadata.name'), EXPECTED_APP, 'service name');
  assertMatch(service, /ports:\s+- name: http\s+port: 80\s+targetPort: http/s, 'service target port');
  assertNotContains(manifest, 'BusterNamespaceLease', 'module manifest preview lease ownership');
  assertNotContains(manifest, 'kind: Ingress', 'module manifest ingress ownership');
  assertNotContains(manifest, 'pods/portforward', 'module manifest port-forward ownership');
}

const html = read('src/index.html');
const branchA = read('src/content/branch-a.html');
const branchB = read('src/assets/branch-b.css');
const integrationMap = JSON.parse(read('src/integration/module-map.json'));
const dockerfile = read('Dockerfile');
const nginxConfig = read('nginx/default.conf');
const manifest = read('k8s/deployment.yaml');

const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
}

const moduleChecks = {
  '01-nginx': () => {
    check('nginx listener', () => assertContains(nginxConfig, 'listen 8080;', 'nginx listener port'));
    check('nginx server shape', () => {
      assertContains(nginxConfig, 'server {', 'nginx server block start');
      assertContains(nginxConfig, 'server_name _;', 'nginx default server name');
      assertContains(nginxConfig, 'root /usr/share/nginx/html;', 'nginx document root');
      assertContains(nginxConfig, 'location / {', 'nginx root location');
      assertContains(nginxConfig, 'try_files $uri $uri/ /index.html;', 'nginx static fallback');
      assertContains(nginxConfig, 'location = /runtime-foundation-check', 'nginx foundation check route');
    });
  },
  '02-nginx': () => {
    check('content branch surface', () => assertContains(branchA, 'REAL_E2E_BRANCH_A_CONTENT', 'content branch surface'));
    check('content branch owner', () => assertContains(branchA, 'data-owner="02-nginx"', 'content branch owner'));
    check('content branch html route shape', () => assertMatch(branchA, /<section\b[^>]*data-owner="02-nginx"[^>]*>[\s\S]*REAL_E2E_BRANCH_A_CONTENT[\s\S]*<\/section>/, 'content branch html route shape'));
    check('content branch does not own runtime', () => assertEqual(branchA.includes('Dockerfile'), false, 'content branch runtime boundary'));
    check('content branch does not own preview', () => assertNotContains(branchA, 'BusterNamespaceLease', 'content branch preview boundary'));
  },
  '03-nginx': () => {
    check('asset branch surface', () => assertContains(branchB, '#real-e2e-content-branch', 'asset branch surface'));
    check('asset branch style rule', () => assertContains(branchB, 'color: #113355;', 'asset branch style rule'));
    check('asset branch source map marker', () => assertContains(branchB, 'REAL_E2E_BRANCH_B_ASSET', 'asset branch source marker'));
    check('asset branch does not own runtime', () => assertEqual(branchB.includes('Dockerfile'), false, 'asset branch runtime boundary'));
    check('asset branch does not own preview', () => assertNotContains(branchB, 'BusterNamespaceLease', 'asset branch preview boundary'));
  },
  '04-nginx': () => {
    check('pinned base image', () => assertContains(dockerfile, `FROM ${EXPECTED_BASE_IMAGE}`, 'pinned nginx base image'));
    check('foundation config packaged', () => assertContains(dockerfile, 'COPY nginx/default.conf /etc/nginx/conf.d/default.conf', 'foundation config package copy'));
    check('source copied into runtime image', () => assertContains(dockerfile, 'COPY src/ /usr/share/nginx/html/', 'runtime source copy'));
    check('html marker', () => assertContains(html, 'REAL_E2E_NGINX_OK', 'html marker'));
    check('html run id placeholder', () => assertContains(html, '<p id="run-id">REAL_E2E_RUN_ID_PLACEHOLDER</p>', 'html run id placeholder'));
    check('html composition structure', assertHtmlComposition);
    check('content branch marker', () => assertContains(html, 'data-module="02-nginx"', 'content branch marker'));
    check('content branch live link', () => assertContains(html, '<a href="/content/branch-a.html">REAL_E2E_BRANCH_A_CONTENT</a>', 'content branch live link'));
    check('asset branch marker', () => assertContains(html, 'data-module="03-nginx"', 'asset branch marker'));
    check('integration branch marker', () => assertContains(html, 'data-module="04-nginx"', 'integration branch marker'));
    check('asset branch stylesheet composition', () => assertContains(html, '<link rel="stylesheet" href="/assets/branch-b.css">', 'asset branch stylesheet composition'));
    check('content branch composition source', () => assertContains(html, 'data-source="/content/branch-a.html"', 'content branch composition source'));
    check('integration branch composition inputs', () => assertContains(html, 'data-composes="/content/branch-a.html,/assets/branch-b.css"', 'integration branch composition inputs'));
    check('integration schema', () => assertEqual(integrationMap.schema_version, 'real_e2e_integration_map.v2', 'integration schema'));
    check('integration module id', () => assertEqual(integrationMap.integration_module, '04-nginx', 'integration module id'));
    check('integration branch inputs', () => assertDeepEqual(integrationMap.consumes, ['02-nginx', '03-nginx'], 'integration branch inputs'));
    check('integration content surface', () => assertDeepEqual(integrationMap.consumed_surfaces[0], {
      module: '02-nginx',
      path: 'src/content/branch-a.html',
      served_as: '/content/branch-a.html',
    }, 'integration content surface'));
    check('integration asset surface', () => assertDeepEqual(integrationMap.consumed_surfaces[1], {
      module: '03-nginx',
      path: 'src/assets/branch-b.css',
      served_as: '/assets/branch-b.css',
    }, 'integration asset surface'));
    check('integration deployable surface', () => assertEqual(integrationMap.deployable_surface, 'nginx-static-workload', 'integration deployable surface'));
    check('reusable manifest structure', assertReusableManifest);
  },
};

if (requestedModule === 'all') {
  for (const runChecks of Object.values(moduleChecks)) runChecks();
} else if (moduleChecks[requestedModule]) {
  moduleChecks[requestedModule]();
} else {
  throw new Error(`unknown module verifier: ${requestedModule}`);
}

console.log(JSON.stringify({
  ok: true,
  module: requestedModule,
  checked: checks,
}));
