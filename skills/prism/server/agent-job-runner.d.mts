export function controlRequest(controlUrl:string,path:string,body:unknown,signal:AbortSignal):Promise<unknown>;
export class AgentJobRunner {
 constructor(controlUrl:string,gatewayReady?:()=>Promise<boolean>);
 tick():Promise<void>;
 runOne():Promise<void>;
 stop():Promise<void>;
}
