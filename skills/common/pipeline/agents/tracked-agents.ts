type AnyRecord = Record<string, any>;

const _trackedAgents = new Map();

function requireTrackedAgentLabel(label: any, operation: string) {
  if (typeof label !== 'string' || label.trim() === '') {
    throw new Error(`${operation} requires explicit tracked agent label`);
  }
  return label.trim();
}

export function trackAgent(config: AnyRecord, label: any, sessionKey: any, agentId: any, gatewayLabel: any, streamLogPath: any = null, extra: AnyRecord = {}) {
  const key = requireTrackedAgentLabel(label, 'trackAgent');
  const entry = {
    sessionKey,
    agentId,
    gatewayLabel,
    streamLogPath,
    project: config?.project || extra?.project || null,
    ...extra,
  };
  _trackedAgents.set(key, entry);
  return entry;
}

export function untrackAgent(label: any) {
  return _trackedAgents.delete(requireTrackedAgentLabel(label, 'untrackAgent'));
}

export function getTrackedAgent(label: any) {
  return _trackedAgents.get(requireTrackedAgentLabel(label, 'getTrackedAgent')) || null;
}

export function getTrackedAgentCount() {
  return _trackedAgents.size;
}

export function listTrackedAgents() {
  return [..._trackedAgents.entries()];
}
