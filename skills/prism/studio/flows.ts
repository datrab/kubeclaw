import { validatePrism, type PrismDocument } from '@kubeclaw/prism-contracts-v1';

type Location = { view: string; state: string };
type Transition = { from: Location; to: Location; trigger: { action: string; node?: string } };
export type StudioFlow = { id: string; title: string; start: Location; transitions: Transition[] };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function location(value: unknown): Location {
  if (!record(value) || typeof value.view !== 'string' || typeof value.state !== 'string') {
    throw new Error('Invalid Prism flow location');
  }
  return { view: value.view, state: value.state };
}
function transition(value: unknown): Transition {
  if (!record(value) || !record(value.trigger) || typeof value.trigger.action !== 'string'
    || (value.trigger.node !== undefined && typeof value.trigger.node !== 'string')) {
    throw new Error('Invalid Prism flow transition');
  }
  return { from: location(value.from), to: location(value.to), trigger: {
    action: value.trigger.action, ...(value.trigger.node === undefined ? {} : { node: value.trigger.node }),
  } };
}

/** Validate the actual contract before narrowing its deliberately unknown flow values. */
export function studioFlows(document: PrismDocument): StudioFlow[] {
  validatePrism('designDocument', document);
  return Object.entries(document.flows).map(([id, value]) => {
    if (!record(value) || typeof value.title !== 'string' || !Array.isArray(value.transitions)) {
      throw new Error('Invalid Prism flow');
    }
    const transitions: readonly unknown[] = value.transitions;
    return { id, title: value.title, start: location(value.start), transitions: transitions.map(transition) };
  });
}

export function previewSelection(message: unknown): string | undefined {
  return record(message) && message.schema === 'prism.selection.v1' && typeof message.nodeId === 'string'
    ? message.nodeId : undefined;
}
export function previewActionTarget(flows: readonly StudioFlow[], from: Location, message: unknown): Location | undefined {
  if (!record(message) || message.schema !== 'prism.action.v1' || typeof message.action !== 'string'
    || (message.nodeId !== undefined && typeof message.nodeId !== 'string')) return undefined;
  return flows.flatMap(flow => flow.transitions).find(item => item.from.view === from.view
    && item.from.state === from.state && item.trigger.action === message.action
    && (!item.trigger.node || item.trigger.node === message.nodeId))?.to;
}
