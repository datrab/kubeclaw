export function activate(context) {
    const mapping = context.config.environment;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))
        throw new Error('environment mapping is required');
    const names = Object.freeze({ ...mapping });
    return {
        async ready() { },
        async invoke({ request, signal }) {
            if (request.capability !== 'secrets.read' || request.operation !== 'resolve') {
                throw new Error('SECRET_OPERATION_UNSUPPORTED');
            }
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            const environmentName = names[request.resource.canonicalId];
            if (!environmentName)
                throw new Error(`SECRET_DENIED:${request.resource.canonicalId}`);
            const value = process.env[environmentName];
            if (value === undefined || value.length === 0)
                throw new Error(`SECRET_UNAVAILABLE:${request.resource.canonicalId}`);
            return { value };
        },
        async shutdown() { },
    };
}
