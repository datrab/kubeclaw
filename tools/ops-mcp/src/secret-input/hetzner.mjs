/** Read-only namespace-consumer probe. No arbitrary host, request, response or
 * provider error can be selected/returned by the agent. No Storage Box created. */
export async function probeHetznerStorage(receiver,reference,fetchPort=fetch){
 try{return await receiver.use(reference,async secret=>{
  const response=await fetchPort('https://api.hetzner.com/v1/storage_boxes?per_page=1',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+secret.toString('utf8'),accept:'application/json'}});
  if(response.status!==200){await response.body?.cancel();throw Error();}
  const chunks=[];let size=0;for await(const chunk of response.body??[]){size+=chunk.length;if(size>65536){throw Error();}chunks.push(Buffer.from(chunk));}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(body.storage_boxes))throw Error();
  return {verified:true,kind:'hetzner-storage'};
 });}catch{return {verified:false,kind:'hetzner-storage'};}
}
