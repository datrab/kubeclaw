// No caller-supplied URLs, paths, headers or PromQL. Only bounded GET queries.
export const METRIC_QUERIES = Object.freeze({
  filesystems: '{__name__=~"node_filesystem_(size_bytes|avail_bytes|free_bytes|files|files_free|readonly)"}',
  memory: '{__name__=~"node_memory_(MemTotal_bytes|MemAvailable_bytes|SwapTotal_bytes|SwapFree_bytes)"}',
  cpu: '1 - rate(node_cpu_seconds_total{mode="idle"}[5m])',
  volumes: '{__name__=~"kubelet_volume_stats_(capacity_bytes|available_bytes|used_bytes|inodes|inodes_free)"}',
  requests: '{__name__=~"kube_pod_container_resource_requests|kube_node_status_allocatable|kube_pod_status_phase"}',
  network: 'label_replace(rate(node_network_receive_bytes_total[5m]), "direction", "receive", "", "") or label_replace(rate(node_network_transmit_bytes_total[5m]), "direction", "transmit", "", "")',
  disk_io: 'label_replace(rate(node_disk_read_bytes_total[5m]), "operation", "read", "", "") or label_replace(rate(node_disk_written_bytes_total[5m]), "operation", "write", "", "")',
});

export function createMonitoring({ origin = process.env.OPS_PROMETHEUS_ORIGIN, timeoutMs = 10_000, maxBytes = 2 * 1024 * 1024 } = {}) {
  let base;
  if (origin) {
    base = new URL(origin);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw new Error('OPS_PROMETHEUS_ORIGIN must be an HTTP(S) origin without credentials or a path');
    }
  }
  async function read(path, params = {}) {
    if (!base) throw new Error('OPS_MONITORING_NOT_CONFIGURED');
    const url = new URL(path, base);
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Prometheus HTTP ${response.status}`); }
    const reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('OPS_MONITORING_RESPONSE_TOO_LARGE');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.status !== 'success' || !result.data) throw new Error('OPS_MONITORING_QUERY_FAILED');
    return { data: result.data, warnings: result.warnings ?? [], observedAt: new Date().toISOString() };
  }
  return {
    async metrics({ metric, startTime, endTime, stepSeconds = 60 }) {
      if (!Object.hasOwn(METRIC_QUERIES, metric)) throw new Error('OPS_METRIC_FORBIDDEN');
      const params = { query: METRIC_QUERIES[metric], timeout: '5s' };
      if (startTime !== undefined || endTime !== undefined) {
        const start = Date.parse(startTime), end = Date.parse(endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400_000 ||
            !Number.isInteger(stepSeconds) || stepSeconds < 60 || stepSeconds > 3600 || (end - start) / (stepSeconds * 1000) > 1000) {
          throw new Error('OPS_MONITORING_INVALID_RANGE');
        }
        return { metric, ...await read('/api/v1/query_range', { ...params, start: String(start / 1000), end: String(end / 1000), step: String(stepSeconds) }) };
      }
      return { metric, ...await read('/api/v1/query', params) };
    },
    alerts: () => read('/api/v1/alerts'),
  };
}
