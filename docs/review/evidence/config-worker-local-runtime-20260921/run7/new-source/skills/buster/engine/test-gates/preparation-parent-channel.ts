import { assertBusterInput, type BusterStagedAdmission } from './preparation-input.ts';
import type { PreparedPlanJob } from './preparation-header.ts';
import type { NativeWorkerControlChannel } from '@kubeclaw/worker-core';
import { decodePreparationMessage, encodePreparationMessage, PreparationIngress,
  type PreparationMessage } from './preparation-channel.ts';
import type { PreparedAdmission } from './preparation-client.ts';

interface Admission {
  readonly ingress: PreparationIngress;
  readonly cancellation: AbortController;
  readonly work: Promise<void>;
  ended: boolean;
  decision: ReturnType<typeof Promise.withResolvers<boolean>> | null;
}

/** Fixed preparation protocol. Root never accepts a path, command or identity from the service. */
export async function servePreparationRequests(channel: NativeWorkerControlChannel, options: {
  readonly maximumActivePreparations: number;
  readonly maximumRequestBytes: number;
  readonly prepare: (ingress: PreparationIngress, signal: AbortSignal,
    admit: (job: PreparedPlanJob) => Promise<boolean>) => Promise<BusterStagedAdmission | null>;
  readonly extract: (staged: BusterStagedAdmission, signal: AbortSignal) => Promise<PreparedAdmission>;
}): Promise<void> {
  const admissions = new Map<string, Admission>();
  const pending = new Set<Promise<void>>();
  const failure = async (requestId: string, error: unknown) => {
    const message = error instanceof Error ? error.message.slice(0, 256).toWellFormed() : 'BUSTER_PREPARATION_FAILED';
    await channel.send(encodePreparationMessage('failure', requestId, Buffer.from(message)));
  };
  const begin = async (requestId: string, staged?: BusterStagedAdmission) => {
    if (admissions.has(requestId)) throw new Error('BUSTER_PREPARATION_REQUEST_REPEATED');
    if (admissions.size >= options.maximumActivePreparations) {
      await failure(requestId, new Error('BUSTER_PREPARATION_ADMISSION_FULL'));
      return;
    }
    const ingress = new PreparationIngress(options.maximumRequestBytes);
    const cancellation = new AbortController();
    const work = Promise.resolve().then(async () => {
      try {
        const prepared = staged ? await options.extract(staged, cancellation.signal)
          : await options.prepare(ingress, cancellation.signal, async job => {
            return requestAdmissionDecision(channel, admissions, requestId, job);
          });
        await channel.send(encodePreparationMessage('result', requestId, Buffer.from(JSON.stringify(prepared))));
      } catch (error) {
        await failure(requestId, error);
      } finally {
        ingress.fail(new Error('BUSTER_PREPARATION_FINISHED'));
        admissions.delete(requestId);
      }
    });
    admissions.set(requestId, { ingress, cancellation, work, ended: Boolean(staged), decision: null });
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => channel.destroy());
    if (!staged) await channel.send(encodePreparationMessage('ready', requestId));
  };
  try {
    for await (const raw of channel.messages()) {
      const message = decodePreparationMessage(raw);
      if (message.kind === 'begin') await begin(message.admissionId);
      else if (message.kind === 'extract') {
        const staged = JSON.parse(message.content.toString('utf8')) as BusterStagedAdmission;
        assertBusterInput(staged.input, staged.job);
        await begin(message.admissionId, staged);
      } else await receiveBody(channel, admissions, message);
    }
  } finally {
    for (const admission of admissions.values()) {
      cancelAdmission(admission, new Error('BUSTER_PREPARATION_SERVICE_LOST'));
    }
    await Promise.allSettled(pending);
    channel.destroy();
  }
}

async function receiveBody(channel: NativeWorkerControlChannel, admissions: Map<string, Admission>,
  message: PreparationMessage): Promise<void> {
  const admission = admissions.get(message.admissionId);
  // A rejected request may have a cancellation already in transit.
  if (message.kind === 'cancel') {
    cancelAdmission(admission, new Error('BUSTER_PREPARATION_CANCELLED'));
    return;
  }
  if (message.kind === 'proceed' || message.kind === 'decline') {
    if (!admission?.ended || !admission.decision) throw new Error('BUSTER_PREPARATION_DECISION_STATE_INVALID');
    admission.decision.resolve(message.kind === 'proceed');
    admission.decision = null;
    return;
  }
  if (!admission || admission.ended) throw new Error('BUSTER_PREPARATION_REQUEST_UNKNOWN');
  if (message.kind === 'end') {
    admission.ended = true;
    admission.ingress.end();
  } else if (message.kind === 'bytes') {
    // A native failure rejects the pending chunk. Its work already sends failure.
    try { await admission.ingress.write(message.content); }
    catch (error) {
      admission.cancellation.abort(error);
      admission.ingress.fail(error);
      return;
    }
    await channel.send(encodePreparationMessage('ack', message.admissionId));
  } else throw new Error('BUSTER_PREPARATION_PHASE_INVALID');
}

async function requestAdmissionDecision(channel: NativeWorkerControlChannel, admissions: Map<string, Admission>,
  requestId: string, job: PreparedPlanJob): Promise<boolean> {
  const admission = admissions.get(requestId);
  if (!admission || admission.decision) throw new Error('BUSTER_PREPARATION_DECISION_STATE_INVALID');
  const decision = Promise.withResolvers<boolean>();
  void decision.promise.catch(() => {});
  admission.decision = decision;
  await channel.send(encodePreparationMessage('validated', requestId, Buffer.from(JSON.stringify(job))));
  return decision.promise;
}

function cancelAdmission(admission: Admission | undefined, error: Error): void {
  admission?.cancellation.abort(error);
  admission?.ingress.fail(error);
  admission?.decision?.reject(error);
}
