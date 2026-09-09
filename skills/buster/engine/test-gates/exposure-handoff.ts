import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {EXPOSURE_OWNER_ANNOTATION,EXPOSURE_REQUEST_ANNOTATION,EXPOSURE_PREDECESSORS_ANNOTATION,exposurePredecessors} from './exposure-generation.ts';

export const READINESS_HANDOFF_ANNOTATION='kubeclaw.forgestack.ai/readiness-handoff';
type JsonObject=Record<string,unknown>;
export function assertHandoffSourceRequest(lease:JsonObject,identity:{owner:string;request:string}) {
 const annotations=((lease.metadata as JsonObject).annotations??{}) as JsonObject;
 if(annotations[READINESS_HANDOFF_ANNOTATION]===undefined)return;
 let recorded;try{recorded=JSON.parse(String(annotations[READINESS_HANDOFF_ANNOTATION]));}catch{throw new Error('EXPOSURE_HANDOFF_RECORD_INVALID');}
 if(!recorded||typeof recorded!=='object'||typeof recorded.owner!=='string'||typeof recorded.sourceOwner!=='string')throw new Error('EXPOSURE_HANDOFF_RECORD_INVALID');
 if(annotations[EXPOSURE_OWNER_ANNOTATION]===recorded.owner && recorded.sourceOwner===identity.owner && recorded.sourceRequest!==identity.request)throw new Error('EXPOSURE_HANDOFF_SOURCE_REQUEST_CHANGED');
}
export function pendingExposureHandoff(lease:JsonObject,identity:{owner:string;request:string}) {
 const metadata=lease.metadata as JsonObject,spec=lease.spec as JsonObject,status=lease.status as JsonObject;
 if(typeof metadata.uid!=='string'||!metadata.uid)throw new Error('EXPOSURE_HANDOFF_LEASE_UID_REQUIRED');
 if(spec.cleanupPolicy!=='retain')throw new Error('EXPOSURE_HANDOFF_NAMESPACE_RETENTION_REQUIRED');
 if(typeof spec.verifiedImage!=='string'||!/@sha256:[a-f0-9]{64}$/u.test(spec.verifiedImage)
  ||typeof spec.manifestDigest!=='string'||!/^sha256:[a-f0-9]{64}$/u.test(spec.manifestDigest))throw new Error('EXPOSURE_HANDOFF_DEPLOYMENT_BINDING_REQUIRED');
 const owner=sha256Text(canonicalJson({leaseUID:metadata.uid,sourceOwner:identity.owner,sourceRequest:identity.request,phase:'awaiting-readiness'}));
 return {schemaVersion:'demo-exposure-handoff.v1',phase:'awaiting-readiness',leaseUID:metadata.uid,
  sourceOwner:identity.owner,sourceRequest:identity.request,owner,expiresAt:status.expiresAt,
  immutableImage:spec.verifiedImage,manifestDigest:spec.manifestDigest};
}
export function existingExposureHandoff(lease:JsonObject,identity:{owner:string;request:string}) {
 const metadata=lease.metadata as JsonObject,annotations=(metadata.annotations??{}) as JsonObject;
 const expected=pendingExposureHandoff(lease,identity);
 if(annotations[EXPOSURE_OWNER_ANNOTATION]!==expected.owner)return undefined;
 let recorded;try{recorded=JSON.parse(String(annotations[READINESS_HANDOFF_ANNOTATION]));}catch{throw new Error('EXPOSURE_HANDOFF_RECORD_INVALID');}
 if(canonicalJson(recorded)!==canonicalJson(expected)||annotations[EXPOSURE_REQUEST_ANNOTATION]!==identity.request)throw new Error('EXPOSURE_HANDOFF_RECORD_CHANGED');
 return expected;
}
export function exposureHandoffPatch(lease:JsonObject,identity:{owner:string;request:string}) {
 const metadata=lease.metadata as JsonObject,annotations=(metadata.annotations??{}) as JsonObject;
 if(annotations[EXPOSURE_OWNER_ANNOTATION]!==identity.owner)throw new Error('EXPOSURE_HANDOFF_OWNER_CHANGED');
 const handoff=pendingExposureHandoff(lease,identity);
 return {handoff,patch:{metadata:{resourceVersion:metadata.resourceVersion,annotations:{
  [EXPOSURE_OWNER_ANNOTATION]:handoff.owner,[EXPOSURE_REQUEST_ANNOTATION]:identity.request,
  [EXPOSURE_PREDECESSORS_ANNOTATION]:exposurePredecessors(lease),[READINESS_HANDOFF_ANNOTATION]:JSON.stringify(handoff),
 }}}};
}
