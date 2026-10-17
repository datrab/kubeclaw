const digest=/^sha256:[a-f0-9]{64}$/u;
function closed(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
export function validateBusterImageDelivery(value,revision){
 if(!closed(value,['schemaVersion','revision','namespace','releaseName','expected'])||value.schemaVersion!=='buster-image-delivery.v1'||value.revision!==revision||!/^[a-f0-9]{40}$/u.test(revision??''))throw new Error('BUSTER_IMAGE_DELIVERY_IDENTITY_INVALID');
 for(const name of [value.namespace,value.releaseName])if(typeof name!=='string'||!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(name))throw new Error('BUSTER_IMAGE_DELIVERY_IDENTITY_INVALID');
 const expected=value.expected;
 if(!closed(expected,['schemaVersion','role','serviceInstanceId','callerId','generationDigest','selectionDigest','packageReceiptDigest','imageReceiptDigest'])||expected.schemaVersion!=='pipeline-expected-delivery.v1'||expected.role!=='buster'||expected.callerId!=='buster-preparation'||expected.serviceInstanceId!==`${value.namespace}/${value.releaseName}/buster-v2-runtime`||['generationDigest','selectionDigest','packageReceiptDigest','imageReceiptDigest'].some(key=>!digest.test(expected[key]??'')))throw new Error('BUSTER_IMAGE_DELIVERY_RECEIPT_INVALID');
 return structuredClone(value);
}
