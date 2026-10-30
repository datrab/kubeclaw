import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeProxiedSpiffePeer } from '@kubeclaw/worker-core';
import { agentJob } from '../control/agent-jobs.ts';
import { reconcileAgentJob, type AgentRetryDecision } from '../control/agent-reconciliation.ts';
import type { Database } from '../storage/index.ts';

/** Dedicated Nova host boundary; an agent cannot authorize its own retry. */
export async function handleAgentReconciliation(request: IncomingMessage, response: ServerResponse, url: URL,
  options: {db:Database;spiffeEnabled:boolean;trustedNovaId:string;readBody:(request:IncomingMessage)=>Promise<unknown>;readArtifact:(id:string)=>Promise<Uint8Array>}) {
  const match = /^\/v1\/pipeline\/agent-jobs\/([0-9a-f-]+)(\/reconcile)?$/u.exec(url.pathname);
  if (!match) return false;
  if (!options.spiffeEnabled || !options.trustedNovaId) throw new Error('Prism reconciliation requires Nova SPIFFE trust');
  authorizeProxiedSpiffePeer(request.headers,request.socket.remoteAddress,new Set([options.trustedNovaId]));
  let result: unknown;
  if (request.method === 'GET' && !match[2]) result = {job:await agentJob(options.db,match[1]!)};
  else if (request.method === 'POST' && match[2]) {
    const decision = await readDecision(request,options);
    result = await reconcileAgentJob(options.db,match[1]!,options.trustedNovaId,decision);
  } else throw new Error('unsupported reconciliation method');
  response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  response.end(JSON.stringify(result));return true;
}

async function readDecision(request:IncomingMessage, options:{readBody:(request:IncomingMessage)=>Promise<unknown>;readArtifact:(id:string)=>Promise<Uint8Array>}):Promise<AgentRetryDecision> {
  const decision = await options.readBody(request) as AgentRetryDecision;
  if (!Array.isArray(decision?.evidence) || decision.evidence.length < 1 || decision.evidence.length > 16) throw new Error('PRISM_RECONCILIATION_INVALID');
  for (const id of decision.evidence) {
    if (typeof id !== 'string' || !/^artifact:sha256:[0-9a-f]{64}$/u.test(id)) throw new Error('PRISM_RECONCILIATION_INVALID');
    await options.readArtifact(id);
  }
  return decision;
}
