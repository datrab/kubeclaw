import fs from 'fs';
import path from 'path';
import { gateActiveSessionPath } from '../core/paths.js';

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmpPath, filePath);
}

export function persistGateActiveSession(config, gateId, label, entry, extra = {}) {
  if (!config?._logDir || !gateId || !entry?.sessionKey) return;
  writeJsonAtomic(gateActiveSessionPath(config, gateId), {
    gate_id: gateId,
    label,
    session_key: entry.sessionKey,
    stream_log_path: entry.streamLogPath || null,
    gateway_label: entry.gatewayLabel || null,
    runtime: entry.runtime || null,
    model: entry.model || null,
    agent_id: entry.agentId || null,
    tracked_at: new Date().toISOString(),
    ...extra,
  });
}

export function clearGateActiveSession(config, gateId) {
  if (!config?._logDir || !gateId) return;
  try {
    fs.unlinkSync(gateActiveSessionPath(config, gateId));
  } catch {}
}
