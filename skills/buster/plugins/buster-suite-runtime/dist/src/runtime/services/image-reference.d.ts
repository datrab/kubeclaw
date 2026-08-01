export type ImageReferenceValidationResult = {
    ok: true;
    value: string;
} | {
    ok: false;
    reason: string;
};
export declare function validateImageReference(imageRef: unknown): ImageReferenceValidationResult;
