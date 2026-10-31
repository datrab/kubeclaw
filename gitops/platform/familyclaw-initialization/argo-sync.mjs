export async function requestHouseholdSync(revision, kubectl, wait) {
  const get = () => JSON.parse(kubectl(['-n', 'argocd', 'get', 'application', 'familyclaw', '-o', 'json']));
  const patch = value => kubectl(['-n', 'argocd', 'patch', 'application', 'familyclaw', '--type=merge', '--patch', JSON.stringify(value)]);
  let application = get();
  if (application.operation) {
    if (application.operation.sync?.revision === revision) return {alreadyInProgress: true, revision};
    // This is Argo's normal termination protocol. Keep all workloads and PVCs;
    // wait for the controller to finish termination before requesting a new sync.
    patch({status: {operationState: {phase: 'Terminating'}}});
    for (let attempt = 0; attempt < 60; attempt++) {
      await wait(1000);
      application = get();
      if (!application.operation && application.status?.operationState?.phase !== 'Terminating') break;
    }
    if (application.operation || application.status?.operationState?.phase === 'Terminating') {
      throw new Error('Previous Argo operation did not terminate');
    }
  }
  patch({operation: {initiatedBy: {username: 'familyclaw-initialization'}, retry: {limit: 0},
    sync: {revision, prune: false, syncStrategy: {apply: {}}}}});
  return {argoSyncRequested: true, revision};
}
