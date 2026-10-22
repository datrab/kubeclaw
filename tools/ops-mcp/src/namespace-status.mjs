// Call only after applying the client's namespace policy. An empty workload
// list is not evidence of namespace absence; only the namespace GET can be.
export async function getNamespaceStatus(kubeRequest, namespace) {
  try {
    const data = await kubeRequest(`/api/v1/namespaces/${encodeURIComponent(namespace)}`);
    return {
      namespace, status: 'present', exists: true, source: 'kubernetes',
      phase: data.status?.phase ?? null,
      creationTimestamp: data.metadata?.creationTimestamp ?? null,
      deletionTimestamp: data.metadata?.deletionTimestamp ?? null,
      finalizers: data.spec?.finalizers ?? [],
    };
  } catch (error) {
    if (error.status === 404) return { namespace, status: 'not_found', exists: false, source: 'kubernetes' };
    if (error.status === 403) return { namespace, status: 'forbidden', exists: null, source: 'kubernetes' };
    // Authentication, TLS, timeouts and server errors establish no existence result.
    throw error;
  }
}
