import { createHash } from "node:crypto";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";

const visualProps=new Set(["direction","gap","align","justify","wrap","columns","rowGap","ratio","placement","width","height","padding","background","foreground","radius","border","shadow","style","tone","variant","fit","position","size"]);
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const node=(value:PrismNode):unknown=>({
  type:value.type,
  props:Object.fromEntries(Object.entries(value.props??{}).filter(([key])=>visualProps.has(key)).sort(([a],[b])=>a.localeCompare(b))),
  children:(value.children??[]).map(node),
});
export const directionSignature=(document:PrismDocument):string=>{
  const {colors,typography,space,radius,shadow,motion}=document.theme;
  const value={theme:{colors,typography,space,radius,shadow,motion},views:Object.fromEntries(Object.entries(document.views).map(([id,view])=>[id,{surface:view.surface,root:node(view.root)}])),components:Object.fromEntries(Object.entries(document.components).map(([id,component])=>[id,node((component as {root:PrismNode}).root)]))};
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
};
const featureMap=(document:PrismDocument):Map<string,string>=>{
  const result=new Map<string,string>();
  const visit=(value:unknown,path:string)=>{
    if(Array.isArray(value)){value.forEach((item,index)=>visit(item,`${path}[${index}]`));return;}
    if(value&&typeof value==="object"){for(const [key,item] of Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)))visit(item,path?`${path}.${key}`:key);return;}
    result.set(path,JSON.stringify(value));
  };
  const {colors,typography,space,radius,shadow,motion}=document.theme;
  visit({theme:{colors,typography,space,radius,shadow,motion},views:Object.fromEntries(Object.entries(document.views).map(([id,view])=>[id,{surface:view.surface,root:node(view.root)}])),components:Object.fromEntries(Object.entries(document.components).map(([id,component])=>[id,node((component as {root:PrismNode}).root)]))},"");
  return result;
};
export const materialDirectionDistance=(left:PrismDocument,right:PrismDocument):number=>{
  const a=featureMap(left),b=featureMap(right),keys=new Set([...a.keys(),...b.keys()]);let score=0;
  for(const key of keys)if(a.get(key)!==b.get(key))score+=key.endsWith(".type")?3:key.includes(".root.")?2:1;
  return score;
};

export function assertMaterialDirectionDiversity(documents:PrismDocument[]):void{
  for(let left=0;left<documents.length;left++)for(let right=left+1;right<documents.length;right++)
    if(materialDirectionDistance(documents[left]!,documents[right]!)<3)
      throw new Error("direction diversity gate failed: proposals are not materially distinct");
}
