import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import yaml from 'js-yaml';

// Never serialize source objects: registry auth, HTTP headers and URL userinfo
// can all contain credentials. Endpoint paths and query strings are omitted too.
function origin(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return {invalid: true};
    return {scheme: url.protocol.slice(0, -1), host: url.hostname, port: url.port || null};
  } catch { return {invalid: true}; }
}

export function inspectNodeRegistry(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Registry configuration must be a mapping');
  const mirrors = Object.entries(config.mirrors || {}).map(([host, entry]) => ({
    // Registry keys are normally host:port; sanitize malformed URL keys too.
    registry: origin(`https://${host}`),
    endpoints: Array.isArray(entry?.endpoint) ? entry.endpoint.map(origin) : [],
    rewriteConfigured: Boolean(entry?.rewrite && Object.keys(entry.rewrite).length),
  }));
  const settings = Object.entries(config.configs || {}).map(([host, entry]) => ({
    registry: origin(`https://${host}`),
    authConfigured: Boolean(entry?.auth && Object.keys(entry.auth).length),
    customCA: Boolean(entry?.tls?.ca_file),
    clientCertificate: Boolean(entry?.tls?.cert_file),
    clientKey: Boolean(entry?.tls?.key_file),
    insecureSkipVerify: entry?.tls?.insecure_skip_verify === true,
  }));
  return {scope: 'k3s-registry-source-configuration-only', mirrors, settings,
    limitations: ['Effective containerd configuration, default endpoint fallback, reachability and actual CRI pulls remain unverified.',
      'A custom --private-registry location must be inspected separately. No credential values or file paths are returned.']};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = '/etc/rancher/k3s/registries.yaml';
  try {
    if (!fs.existsSync(file)) console.log(JSON.stringify({scope: 'k3s-registry-source-configuration-only', defaultFilePresent: false}));
    else console.log(JSON.stringify(inspectNodeRegistry(yaml.load(fs.readFileSync(file, 'utf8')) || {}), null, 2));
  } catch {
    // YAML parser diagnostics can quote credentials from the source file.
    console.error('Registry inventory failed; source configuration could not be read or parsed. Raw diagnostics suppressed.');
    process.exitCode = 1;
  }
}
