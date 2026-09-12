import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, processAlive } from './repository-review-supervisor-state.mjs';

function appendJsonLine(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function optionalResource(file, parse, observationErrors) {
  try {
    return parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    observationErrors.push({ file, error: error.code ?? error.name });
    return undefined;
  }
}

function readNumber(file, observationErrors) {
  return optionalResource(file, text => {
    const value = text.trim();
    return value === 'max' ? value : Number(value);
  }, observationErrors);
}

function readKeyValues(file, observationErrors) {
  return optionalResource(file, text => Object.fromEntries(text.trim().split('\n').filter(Boolean)
    .map((line) => line.trim().split(/\s+/u)).map(([key, value]) => [key, Number(value)])), observationErrors);
}

function processRssBytes(pid, observationErrors) {
  return optionalResource(`/proc/${pid}/status`, text => {
    const match = text.match(/^VmRSS:\s+(\d+)\s+kB$/mu);
    return match ? Number(match[1]) * 1024 : undefined;
  }, observationErrors);
}

async function gatewayHealth(gatewayUrl) {
  try {
    const response = await fetch(new URL('/healthz', gatewayUrl), { signal: AbortSignal.timeout(2_000) });
    return { healthy: response.ok, status: response.status };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.name : 'unknown' };
  }
}

async function resourceSample(pipelinePid, gatewayUrl) {
  const observationErrors = [];
  return {
    schemaVersion: 'repository-review-resource-sample.v1',
    observedAt: new Date().toISOString(), pipelinePid,
    pipelineAlive: processAlive(pipelinePid), pipelineRssBytes: processRssBytes(pipelinePid, observationErrors),
    memoryCurrentBytes: readNumber('/sys/fs/cgroup/memory.current', observationErrors),
    memoryPeakBytes: readNumber('/sys/fs/cgroup/memory.peak', observationErrors),
    memoryEvents: readKeyValues('/sys/fs/cgroup/memory.events', observationErrors),
    cpu: readKeyValues('/sys/fs/cgroup/cpu.stat', observationErrors),
    observationErrors,
    gateway: await gatewayHealth(gatewayUrl),
  };
}

export async function writeHeartbeat(params) {
  const sample = await resourceSample(params.pipelinePid, params.gatewayUrl);
  appendJsonLine(params.resourceLog, sample);
  atomicJson(params.heartbeat, { schemaVersion: 'repository-review-supervisor-heartbeat.v1',
    updatedAt: sample.observedAt, supervisorPid: process.pid, pipelinePid: params.pipelinePid,
    processAlive: sample.pipelineAlive && !params.stopping, attempt: params.attempt,
    mode: params.mode, gateway: sample.gateway });
  return sample;
}

