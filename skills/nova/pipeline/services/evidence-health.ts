import path from 'node:path';
import {
  artifactPaths,
  writeCanonicalJson,
} from '../portable-artifacts.ts';
import { evidenceConfig, readJsonLines } from './evidence-utils.ts';

const BASE_HEALTH = Object.freeze({
  last_successful_emission: null,
  lag: null,
  checkpoint: null,
  invalid_count: 0,
  quarantined_count: 0,
  dead_letter_count: 0,
  missing_payload_count: 0,
  restart_count: 0,
  reconciliation: null,
  degradation_intervals: [],
  capabilities: [],
});

function lastProducerEvent(events: any[], producer: string) {
  return events.filter((event) =>
    String(event.producer ?? '').includes(producer)
    || String(event.source ?? '').includes(producer)
  ).at(-1);
}

function observerCapability(ingester: any) {
  return ingester
    ? []
    : [{
      capability: 'observer_events',
      status: 'capability_unavailable',
      reason_code: 'OBSERVER_NOT_ENABLED_FOR_RUN',
      details: null,
    }];
}

function commandAuthorityStatus(config: any) {
  if (config?._commandRuntimeHealth?.status) {
    return config._commandRuntimeHealth.status;
  }
  return config?.control?.enabled ? 'unknown' : 'not_applicable';
}

function novaHealth(artifactCheck: any) {
  return {
    ...BASE_HEALTH,
    producer_id: 'nova',
    status: artifactCheck.ok ? 'healthy' : 'degraded',
    last_successful_emission: new Date().toISOString(),
    missing_payload_count: artifactCheck.errors.length,
  };
}

function observerHealth(ingester: any) {
  return {
    ...BASE_HEALTH,
    producer_id: 'openclaw-agent-observer',
    status: ingester ? 'healthy' : 'not_applicable',
    capabilities: observerCapability(ingester),
  };
}

function ingesterHealth(ingester: any) {
  return {
    ...BASE_HEALTH,
    producer_id: 'agent-observability-ingester',
    status: ingester
      ? (ingester.failed ? 'degraded' : 'healthy')
      : 'not_applicable',
    last_successful_emission: ingester?.emitted
      ? new Date().toISOString()
      : null,
    checkpoint: ingester ? String(ingester.acked) : null,
    dead_letter_count: ingester?.deadLettered ?? 0,
    missing_payload_count: ingester?.failed ?? 0,
  };
}

function eventProducerHealth(
  producerId: string,
  event: any
) {
  return {
    ...BASE_HEALTH,
    producer_id: producerId,
    status: event ? 'healthy' : 'not_applicable',
    last_successful_emission: event?.emitted_at ?? null,
  };
}

function commandHealth(config: any) {
  return {
    ...BASE_HEALTH,
    producer_id: 'pipeline-command-authority',
    status: commandAuthorityStatus(config),
    last_successful_emission:
      config?._commandRuntimeHealth?.checked_at ?? null,
  };
}

export function defaultProducerHealth(config: any, artifactCheck: any) {
  const ingester = config?._agentObservabilityRuntime?.stats?.() ?? null;
  const events = readJsonLines(
    path.join(artifactPaths(evidenceConfig(config)).root, 'pipeline.jsonl')
  );
  const buster = lastProducerEvent(events, 'buster');
  const namespace = lastProducerEvent(events, 'namespace-controller');
  return [
    novaHealth(artifactCheck),
    observerHealth(ingester),
    ingesterHealth(ingester),
    eventProducerHealth('buster', buster),
    eventProducerHealth('buster-namespace-controller', namespace),
    commandHealth(config),
  ];
}

function completeness(producers: any[]) {
  if (producers.some((producer) =>
    ['unhealthy', 'degraded'].includes(producer.status)
  )) {
    return 'degraded';
  }
  if (producers.some((producer) => producer.status === 'unknown')) {
    return 'partial';
  }
  return 'complete';
}

export function writeProducerHealth(config: any, producers: any[]) {
  const paths = artifactPaths(evidenceConfig(config));
  const normalized = producers.map((producer) => ({
    degradation_intervals: [],
    capabilities: [],
    ...producer,
  }));
  const health = {
    schema_version: 'producer_health_snapshot.v1',
    run_id: config._runId ?? config.run_id,
    generated_at: new Date().toISOString(),
    producers: normalized,
    completeness: completeness(normalized),
  };
  writeCanonicalJson(paths.health, health);
  if (typeof config?._emitCanonicalEvidence === 'function') {
    for (const producer of normalized) {
      void Promise.resolve(config._emitCanonicalEvidence(
        'producer.health',
        producer,
        {
          sourceEventId:
            `producer-health/${producer.producer_id}/${health.generated_at}`,
        }
      ));
    }
  }
  return health;
}
