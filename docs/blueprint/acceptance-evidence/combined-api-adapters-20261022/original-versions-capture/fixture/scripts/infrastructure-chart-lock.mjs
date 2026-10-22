export function parseInfrastructureOciChart(value) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/(bitnamicharts\/[a-z][a-z0-9-]*)@(sha256:[a-f0-9]{64})$/);
  if (url.protocol !== 'oci:' || url.hostname !== 'registry-1.docker.io' || url.port || url.username || url.password
    || url.search || url.hash || !match) throw new Error('INFRASTRUCTURE_OCI_CHART_URL_INVALID');
  return { repository: match[1], digest: match[2] };
}

export function validateInfrastructureChartLock(lock) {
  if (!lock || !/^[a-z][a-z0-9-]*$/.test(lock.name) || !/^\d+\.\d+\.\d+$/.test(lock.version)
    || !/^[a-f0-9]{64}$/.test(lock.sha256)) throw new Error('INFRASTRUCTURE_CHART_LOCK_INVALID');
  if (lock.appVersion !== undefined && !/^\d+\.\d+\.\d+$/.test(lock.appVersion)) throw new Error('INFRASTRUCTURE_CHART_APP_VERSION_INVALID');
  const url = new URL(lock.url);
  if (url.protocol === 'oci:') {
    const { repository } = parseInfrastructureOciChart(lock.url);
    if (repository.split('/').at(-1) !== lock.name) throw new Error('INFRASTRUCTURE_CHART_URL_INVALID');
  } else if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('INFRASTRUCTURE_CHART_URL_INVALID');
  }
  return Object.freeze(lock);
}
