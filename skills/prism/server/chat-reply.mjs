/** OpenClaw agent --json returns result.payloads; reject diagnostics as replies. */
export function chatReply(output){
 const receipt=JSON.parse(output);
 const payloads=receipt.result?.payloads ?? receipt.payloads;
 const text=Array.isArray(payloads)?payloads.filter(item=>typeof item?.text==='string').map(item=>item.text).join('\n\n'):'';
 if(!text.trim()||text.length>100000)throw new Error('OpenClaw returned no bounded chat reply; reconcile the existing turn instead of resending');
 return text;
}
