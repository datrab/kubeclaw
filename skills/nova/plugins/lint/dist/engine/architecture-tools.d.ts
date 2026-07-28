declare function stronglyConnectedComponents(modules: any[]): string[][];
declare function dependencyCruiserFindings(ctx: any, modules: any): any[];
declare function knipFindings(data: any): any[];
declare function jscpdFindings(data: any, repoRoot?: any): any;
declare function registerArchitectureTools(registerTool: any): void;
export { dependencyCruiserFindings, jscpdFindings, knipFindings, registerArchitectureTools, stronglyConnectedComponents };
