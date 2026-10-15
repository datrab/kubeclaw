import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { portableJson } from '@kubeclaw/plugin-sdk/values';
import { assertBusterStartupAssociation, busterStartupAssociationBytes, busterStartupAssociation, readBusterStartupHandoff,
  type BusterStartupHandoff } from '@kubeclaw/plugin-foundation/config/buster-startup';
import { decodePreparationMessage, encodePreparationMessage } from './preparation-channel.ts';

// Fixed-size versioned startup wire; not a configurable operation/admission default.
export const startupAssociationBytes = busterStartupAssociationBytes;
type Messages = AsyncIterator<Buffer>;
function identity(handoff: BusterStartupHandoff): string { return handoff.parentBootId.replaceAll('-', ''); }
async function receive(messages: Messages, kind: 'startup' | 'startup-ack', handoff: BusterStartupHandoff): Promise<void> {
  const frame = await messages.next();
  if (frame.done) throw new Error('BUSTER_STARTUP_CHANNEL_LOST');
  const message = decodePreparationMessage(frame.value);
  if (message.kind !== kind || message.admissionId !== identity(handoff) || message.content.byteLength !== startupAssociationBytes) {
    throw new Error('BUSTER_STARTUP_CHANNEL_ASSOCIATION_REQUIRED');
  }
  assertBusterStartupAssociation(JSON.parse(message.content.toString('utf8')), handoff);
}
/** Use the same single-reader iterator for the subsequent preparation protocol. */
export async function receiveBusterStartupAssociation(channel: NativeWorkerControlChannel, messages: Messages,
  expected: BusterStartupHandoff, authorize: () => void | Promise<void> = () => {}): Promise<void> {
  const handoff = readBusterStartupHandoff(expected);
  try {
    await receive(messages, 'startup', handoff);
    // The parent rechecks retained file/lifetime and post-cleanup kernel state
    // after the blocking receive, before the ACK that permits child effects.
    await authorize();
    await channel.send(encodePreparationMessage('startup-ack', identity(handoff), Buffer.from(portableJson(busterStartupAssociation(handoff)))));
  } catch (error) { channel.destroy(); throw error; }
}
export async function sendBusterStartupAssociation(channel: NativeWorkerControlChannel, messages: Messages,
  retained: BusterStartupHandoff): Promise<void> {
  const handoff = readBusterStartupHandoff(retained);
  try {
    await channel.send(encodePreparationMessage('startup', identity(handoff), Buffer.from(portableJson(busterStartupAssociation(handoff)))));
    await receive(messages, 'startup-ack', handoff);
  } catch (error) { channel.destroy(); throw error; }
}
