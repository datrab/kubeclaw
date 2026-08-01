interface ImageComparison {
    diffCount: number;
    diffPercent: number;
    width: number;
    height: number;
    baselineWidth: number;
    baselineHeight: number;
}
export declare function compareImages(baselinePath: string, actualPath: string, diffPath: string, threshold: number): Promise<ImageComparison>;
export {};
