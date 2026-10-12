/** Existing platform credential/transport inputs only; no operator policy defaults. */
export function kubernetesCredentialEnvironment(): NodeJS.ProcessEnv {
    return { HOME: process.env.HOME, KUBECONFIG: process.env.KUBECONFIG,
        KUBERNETES_SERVICE_HOST: process.env.KUBERNETES_SERVICE_HOST,
        KUBERNETES_SERVICE_PORT: process.env.KUBERNETES_SERVICE_PORT };
}
