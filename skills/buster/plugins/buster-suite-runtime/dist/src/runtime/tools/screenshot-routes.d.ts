export interface BaselineRoute {
    name: string;
    nav: string;
    path: string;
}
export interface BaselineRouteResult extends BaselineRoute {
    ok: boolean;
    width?: number;
    height?: number;
    error?: string;
}
export interface BaselineGenerationResult {
    ok: boolean;
    routes: BaselineRouteResult[];
    error?: string;
    pathsJsonPath?: string;
    generated?: number;
    failed?: number;
}
export declare function parseBaselineRoutes(htmlPath: string): BaselineRoute[];
