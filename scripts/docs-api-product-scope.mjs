import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { discoverHelmApiOutputs, discoverScriptApiOutputs, discoverGoApiOutputs, discoverShellApiOutputs, discoverTransformedApiOutputs, discoverInfrastructureApiOutputs, discoverExternalChartApiOutputs } from './docs-api-output-discovery.mjs';
import { receiverContracts as clusterConfigurationContracts, clusterConfigurationReceiverContracts } from './docs-kubernetes-cluster-configuration-receiver-contracts.mjs';
import { receiverContracts as identitySecretContracts, identitySecretReceiverContracts } from './docs-kubernetes-identity-secret-receiver-contracts.mjs';
import { receiverContracts as prometheusContracts, prometheusSelectedReceiverContracts } from './docs-prometheus-selected-receiver-contracts.mjs';
import { receiverContracts as clusterSPIFFEIDContracts, clusterSPIFFEIDSelectedReceiverContracts } from './docs-clusterspiffeid-selected-receiver-contracts.mjs';
import { receiverContracts as webhookSelectedContracts, webhookSelectedReceiverContracts } from './docs-kubernetes-webhook-selected-receiver-contracts.mjs';
import { receiverContracts as nodeWorkloadContracts, nodeWorkloadsReceiverContracts } from './docs-kubernetes-node-workloads-receiver-contracts.mjs';
import { authoredUnknownFieldContracts } from './docs-buster-authored-unknown-field-contracts.mjs';
import { receiverContracts as namespaceIsolationContracts, namespaceIsolationReceiverContracts } from './docs-kubernetes-namespace-isolation-receiver-contracts.mjs';
import { receiverContracts as authDeleteContracts, authDeleteReceiverContracts } from './docs-kubernetes-auth-delete-receiver-contracts.mjs';
import { busterLeaseReceiverContracts } from './docs-buster-lease-receiver-contracts.mjs';
import { receiverContracts as workloadReceiverContracts, workloadReceiverContracts as selectedWorkloadReceiverContracts } from './docs-kubernetes-workload-receiver-contracts.mjs';
import { receiverContracts as networkingReceiverContracts } from './docs-kubernetes-network-receiver-contracts.mjs';
import { receiverContracts as admissionReceiverContracts } from './docs-kubernetes-admission-receiver-contracts.mjs';
import { receiverContracts as admissionStatusReceiverContracts } from './docs-kubernetes-admission-status-contracts.mjs';
import { receiverContracts as deploymentReceiverContracts } from './docs-kubernetes-apps-receiver-contracts.mjs';
import { receiverContracts as coreReceiverContracts } from './docs-kubernetes-core-receiver-contracts.mjs';
import { receiverContracts as argoReceiverContracts } from './docs-argo-receiver-contracts.mjs';
import { receiverContracts as ciliumReceiverContracts } from './docs-cilium-receiver-contracts.mjs';
import { receiverContracts as envelopeReceiverContracts } from './docs-kubernetes-envelope-receiver-contracts.mjs';
import { receiverContracts as metadataReceiverContracts, implicitKubernetesObjectMetaReferences } from './docs-kubernetes-metadata-receiver-contracts.mjs';

import { apiResourceFieldBoundaries, apiFieldSchemaAuthority, isProductOwnedApi } from './docs-api-schema-authorities.mjs';
import { yamlFieldPath, yamlFieldPathTokens } from './yaml-field-path.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const tokens = value => yamlFieldPathTokens(value.replaceAll('[<exact-key>]', '["*"]'));
const canonical = value => yamlFieldPath(tokens(value), { arrayWildcard: true });
// These are additional omission mechanisms, never an allowlist for actual
// fields. Every authored boundary above is selected independently. Each hook
// requires the exact receiver omission and its pinned receiving-function source.
export function relevantRuntimeOmission(kind, fieldPath, record) {
  const hooks = {
    'PersistentVolumeClaim/$.spec.storageClassName': {
      source: /(?:plugin\/pkg\/admission\/storage\/storageclass|pkg\/controller\/volume\/persistentvolume)\//u,
      meaning: /DefaultStorageClass|default (?:storage )?class/iu,
      reason: 'The present claim spec omits its class. Admission or the binding controller can select a cluster class; observe the stored claim and class before relying on storage placement.',
    },
    'PersistentVolumeClaim/$.spec.volumeMode': {
      source: /pkg\/apis\/core\/v1\/defaults\.go/u,
      meaning: /Filesystem/u,
      reason: 'The present claim spec omits volume mode. The typed default selects Filesystem; driver support and stored volume mode remain separate checks.',
    },
  };
  const hook = hooks[`${kind}/${fieldPath}`];
  if (!hook || !record) return null;
  assert(hook.meaning.test(record.omitted), `API_PRODUCT_OMISSION_MEANING_DRIFT: ${kind} ${fieldPath}`);
  const evidence = record.evidence.filter(item => hook.source.test(item.url));
  assert(evidence.length, `API_PRODUCT_OMISSION_SOURCE_MISSING: ${kind} ${fieldPath}`);
  return { reason: hook.reason, omission: record.omitted, evidence };
}
// These selectors identify typed receiving routes, not every schema field
// whose description happens to mention a default. Missing receiver prose still
// fails the coverage/publication join after source applicability is discovered.
const kubernetesDefaultRevision = '66452049f3d692768c39c797b21b793dce80314e';
const defaultEvidence = (file, lines, claim) => ({
  url: `https://github.com/kubernetes/kubernetes/blob/${kubernetesDefaultRevision}/${file}#L${lines}`,
  claim,
});
function runtimeDefaultApplicability(kind, fieldPath, parent, resource, record) {
  const claimTemplate=kind==='StatefulSet'&&fieldPath.startsWith('$.spec.volumeClaimTemplates[].spec.');
  const claimPath=claimTemplate?fieldPath.replace('$.spec.volumeClaimTemplates[].spec.','$.spec.'):fieldPath;
  const claimRecord=claimTemplate?coreReceiverContracts.find(row=>row.kind==='PersistentVolumeClaim'&&row.fieldPath===claimPath):record;
  const pvc = relevantRuntimeOmission(claimTemplate?'PersistentVolumeClaim':kind, claimPath, claimRecord);
  if (pvc) return pvc;
  const core = (lines, omission, materializes) => ({ reason: 'The typed Kubernetes defaulting function applies to this present object. Inspect the stored object and subsequent consumer separately.', omission,
    evidence: [defaultEvidence('pkg/apis/core/v1/defaults.go', lines, omission)], ...(materializes ? { materializes } : {}) });
  if (kind === 'Deployment') {
    const deploymentDefaults = {
      '$.spec.replicas': ['38-L43', 'A nil replicas pointer defaults to 1.'],
      '$.spec.revisionHistoryLimit': ['65-L68', 'A nil revisionHistoryLimit pointer defaults to 10.'],
      '$.spec.progressDeadlineSeconds': ['70-L74', 'A nil progressDeadlineSeconds pointer defaults to 600.'],
      '$.spec.strategy': ['44-L63', 'The zero strategy defaults to RollingUpdate; its limits default to 25%.', {}],
      '$.spec.strategy.type': ['44-L47', 'An empty strategy type defaults to RollingUpdate.'],
      '$.spec.strategy.rollingUpdate': ['48-L63', 'RollingUpdate materializes its absent limits as 25%.', {}],
      '$.spec.strategy.rollingUpdate.maxSurge': ['59-L63', 'A nil RollingUpdate maxSurge defaults to 25%.'],
      '$.spec.strategy.rollingUpdate.maxUnavailable': ['54-L58', 'A nil RollingUpdate maxUnavailable defaults to 25%.'],
    };
    const item = deploymentDefaults[fieldPath];
    if (item && (!fieldPath.startsWith('$.spec.strategy.rollingUpdate') || !resource.spec?.strategy?.type || resource.spec.strategy.type === 'RollingUpdate')) {
      const [lines, omission, materializes] = item;
      return { reason: 'The Deployment typed default applies before validation. Recreate does not materialize RollingUpdate.', omission,
        evidence: [defaultEvidence('pkg/apis/apps/v1/defaults.go', lines, omission)], ...(materializes ? { materializes } : {}) };
    }
  }
  const receivingDefault = (file, lines, omission, materializes) => ({reason:'The named workload defaulting function applies to the present spec before validation.',omission,evidence:[defaultEvidence(file,lines,omission)],...(materializes?{materializes}: {})});
  if(kind==='Job'||kind==='CronJob') {
    const prefix=kind==='Job'?'$.spec':'$.spec.jobTemplate.spec';
    if(fieldPath.startsWith(`${prefix}.`)) {
      const key=fieldPath.slice(prefix.length+1);
      const job={
        parallelism:['41-L43','An absent parallelism pointer defaults to 1.'],
        ...(parent.parallelism==null?{completions:['37-L40','When both completions and parallelism are absent, completions defaults to 1.']}:{}),
        backoffLimit:['44-L50',parent.backoffLimitPerIndex==null?'Absent backoffLimit defaults to 6.':'With backoffLimitPerIndex present, absent backoffLimit defaults to MaxInt32.'],
        completionMode:['55-L58','An absent completionMode defaults to NonIndexed.'],
        suspend:['59-L61','An absent suspend pointer defaults to false.'],
        manualSelector:['71-L73','An absent manualSelector pointer defaults to false.'],
        podReplacementPolicy:['62-L69','When JobPodReplacementPolicy is enabled, absence defaults to Failed with podFailurePolicy, otherwise TerminatingOrFailed.'],
      }[key];
      if(job) {
        if(kind==='CronJob')return {
          reason:'Relevant deferred child Job default: CronJob stores the nested JobSpec without running SetDefaults_Job. The controller copies it into a separate Job; Job create defaulting applies at that later boundary.',
          omission:'The stored CronJob template keeps this absent pointer nil. On subsequent child Job creation: '+job[1],
          evidence:[defaultEvidence('pkg/apis/batch/v1/zz_generated.defaults.go','42-L53','CronJob default traversal calls SetDefaults_CronJob and PodSpec defaults, without SetDefaults_Job.'),defaultEvidence('pkg/controller/cronjob/utils.go','244-L266','getJobFromTemplate2 copies the template spec into a separate child Job.'),defaultEvidence('pkg/controller/cronjob/cronjob_controllerv2.go','604-L609','The controller submits the constructed child Job with CreateJob.'),defaultEvidence('pkg/apis/batch/v1/defaults.go',job[0],job[1])],
        };
        return receivingDefault('pkg/apis/batch/v1/defaults.go',...job);
      }
    }
    if(kind==='CronJob') {
      const cron={
        '$.spec.concurrencyPolicy':['77-L79','An empty concurrencyPolicy defaults to Allow.'],
        '$.spec.suspend':['80-L82','An absent suspend pointer defaults to false.'],
        '$.spec.successfulJobsHistoryLimit':['83-L85','An absent successfulJobsHistoryLimit pointer defaults to 3.'],
        '$.spec.failedJobsHistoryLimit':['86-L88','An absent failedJobsHistoryLimit pointer defaults to 1.'],
      }[fieldPath];
      if(cron)return receivingDefault('pkg/apis/batch/v1/defaults.go',...cron);
    }
  }
  if(kind==='StatefulSet') {
    const stateful={
      '$.spec.podManagementPolicy':['101-L103','An empty podManagementPolicy defaults to OrderedReady.'],
      '$.spec.updateStrategy':['105-L124','An empty strategy type defaults to RollingUpdate and materializes rollingUpdate.',{}],
      '$.spec.updateStrategy.type':['105-L112','An empty strategy type defaults to RollingUpdate.'],
      '$.spec.updateStrategy.rollingUpdate':['105-L112','An absent rollingUpdate is materialized only while the strategy type is empty.',{}],
      '$.spec.updateStrategy.rollingUpdate.partition':['115-L118','Present RollingUpdate defaults its absent partition to 0.'],
      '$.spec.updateStrategy.rollingUpdate.maxUnavailable':['119-L123','When MaxUnavailableStatefulSet is enabled, present RollingUpdate defaults its absent maxUnavailable to 1.'],
      '$.spec.persistentVolumeClaimRetentionPolicy':['127-L135','An absent retention policy materializes a policy retaining claims on deletion and scale-down.',{}],
      '$.spec.persistentVolumeClaimRetentionPolicy.whenDeleted':['130-L132','An empty whenDeleted defaults to Retain.'],
      '$.spec.persistentVolumeClaimRetentionPolicy.whenScaled':['133-L135','An empty whenScaled defaults to Retain.'],
      '$.spec.replicas':['137-L140','An absent replicas pointer defaults to 1.'],
      '$.spec.revisionHistoryLimit':['141-L144','An absent revisionHistoryLimit pointer defaults to 10.'],
    }[fieldPath];
    const strategy=resource.spec?.updateStrategy;
    const relevant=!fieldPath.startsWith('$.spec.updateStrategy.rollingUpdate')||(!strategy?.type)||(fieldPath!=='$.spec.updateStrategy.rollingUpdate'&&strategy.type==='RollingUpdate'&&strategy.rollingUpdate);
    if(stateful&&relevant)return receivingDefault('pkg/apis/apps/v1/defaults.go',...stateful);
  }
  if(kind==='DaemonSet') {
    const strategy=resource.spec?.updateStrategy;
    const rolling=!strategy?.type||strategy.type==='RollingUpdate';
    const daemon={
      '$.spec.revisionHistoryLimit':['95-L98','An absent revisionHistoryLimit pointer defaults to 10.'],
      '$.spec.updateStrategy':['75-L93','An empty type defaults to RollingUpdate and materializes rollingUpdate.',{}],
      '$.spec.updateStrategy.type':['77-L79','An empty strategy type defaults to RollingUpdate.'],
      '$.spec.updateStrategy.rollingUpdate':['80-L84','RollingUpdate materializes an absent rollingUpdate object.',{}],
      '$.spec.updateStrategy.rollingUpdate.maxUnavailable':['85-L88','An absent RollingUpdate maxUnavailable pointer defaults to 1.'],
      '$.spec.updateStrategy.rollingUpdate.maxSurge':['89-L92','An absent RollingUpdate maxSurge pointer defaults to 0.'],
    }[fieldPath];
    if(daemon&&(!fieldPath.startsWith('$.spec.updateStrategy.rollingUpdate')||rolling))return receivingDefault('pkg/apis/apps/v1/defaults.go',...daemon);
  }
  if(kind==='CSIDriver') {
    const driver={
      '$.spec.attachRequired':['44-L47','An absent attachRequired pointer defaults to true.'],
      '$.spec.podInfoOnMount':['48-L51','An absent podInfoOnMount pointer defaults to false.'],
      '$.spec.storageCapacity':['52-L55','An absent storageCapacity pointer defaults to false.'],
      '$.spec.fsGroupPolicy':['56-L59','An absent fsGroupPolicy pointer defaults to ReadWriteOnceWithFSType.'],
      '$.spec.volumeLifecycleModes':['60-L62','A zero-length lifecycle mode list defaults to Persistent.',['Persistent']],
      '$.spec.requiresRepublish':['63-L66','An absent requiresRepublish pointer defaults to false.'],
      '$.spec.seLinuxMount':['67-L70','When SELinuxMountReadWriteOncePod is enabled, an absent seLinuxMount pointer defaults to false.'],
    }[fieldPath];
    if(driver)return receivingDefault('pkg/apis/storage/v1/defaults.go',...driver);
  }
  if (kind === 'Service') {
    const type = resource.spec?.type || 'ClusterIP';
    const serviceDefault = {
      '$.spec.type': ['123-L125', 'An empty Service type defaults to ClusterIP.'],
      '$.spec.sessionAffinity': ['107-L112', 'An empty sessionAffinity defaults to None; None clears sessionAffinityConfig.'],
      '$.spec.ports[].protocol': ['126-L130', 'Each present Service port with empty protocol defaults to TCP.'],
      '$.spec.ports[].targetPort': ['131-L133', 'An absent targetPort is integer zero and defaults to this Service port number; an explicit empty string also defaults to the port number.'],
    }[fieldPath];
    if (serviceDefault) return {...core(...serviceDefault), explicitZeroValues: fieldPath.endsWith('targetPort') ? ['', 0, null] : ['', null]};
    if (fieldPath === '$.spec.internalTrafficPolicy' && ['ClusterIP', 'NodePort', 'LoadBalancer'].includes(type))
      return {...core('141-L146', 'An absent internalTrafficPolicy pointer defaults to Cluster for ClusterIP, NodePort and LoadBalancer Services; this default does not apply to ExternalName.'), explicitZeroValues:[null]};
    if (fieldPath === '$.spec.allocateLoadBalancerNodePorts' && type === 'LoadBalancer')
      return {...core('148-L152', 'For a LoadBalancer Service, an absent allocateLoadBalancerNodePorts pointer defaults to true.'), explicitZeroValues:[null]};
    if (fieldPath === '$.spec.externalTrafficPolicy' && (['NodePort', 'LoadBalancer'].includes(type) || (type === 'ClusterIP' && resource.spec?.externalIPs?.length))) {
      const result = core('135-L139', 'For an externally accessible Service, an empty externalTrafficPolicy defaults to Cluster.');
      result.evidence.push(defaultEvidence('pkg/api/service/util.go', '71-L75', 'ExternallyAccessible includes LoadBalancer, NodePort and ClusterIP with nonempty externalIPs.'));
      return {...result, explicitZeroValues:['', null]};
    }
  }
  const podSpecPrefix = { Pod: '$.spec', Deployment: '$.spec.template.spec', DaemonSet: '$.spec.template.spec', StatefulSet: '$.spec.template.spec', Job: '$.spec.template.spec', CronJob: '$.spec.jobTemplate.spec.template.spec' }[kind];
  if (!podSpecPrefix) return null;
  if(kind==='Pod'&&fieldPath==='$.spec.enableServiceLinks') {
    const result=core('201-L204','On the Pod receiving route, an absent enableServiceLinks pointer defaults to DefaultEnableServiceLinks=true. Embedded workload templates do not run this Pod-only default.');
    result.evidence.push(defaultEvidence('staging/src/k8s.io/api/core/v1/types.go','4737-L4737','DefaultEnableServiceLinks is true.'));return result;
  }
  if(kind==='Pod'&&fieldPath==='$.spec.serviceAccountName') {
    const omission='When ServiceAccount admission is enabled for non-mirror Pod create, an empty or absent serviceAccountName selects the default service account. The plugin then looks up that account even when automountServiceAccountToken is false; lookup failure returns Forbidden. This admission mutation is not an embedded workload-template default.';
    return {reason:'Conditional ServiceAccount admission applies on the actual Pod create route.',omission,evidence:[defaultEvidence('plugin/pkg/admission/serviceaccount/admission.go','142-L175',omission),defaultEvidence('plugin/pkg/admission/serviceaccount/admission.go','45-L46','DefaultServiceAccountName is default.')]};
  }
  const member = fieldPath.slice(podSpecPrefix.length + 1);
  if (!fieldPath.startsWith(`${podSpecPrefix}.`)) return null;
  if (/^(containers|initContainers|ephemeralContainers)\[\]\./u.test(member)) {
    if (member.endsWith('.ports[].protocol')) {
      const routes = {
        Pod: ['core', ['375-L379', '301-L305', '449-L453']],
        Deployment: ['apps', ['541-L545', '467-L471', '615-L619']],
        DaemonSet: ['apps', ['214-L218', '140-L144', '288-L292']],
        StatefulSet: ['apps', ['1195-L1199', '1121-L1125', '1269-L1273']],
        Job: ['batch', ['555-L559', '481-L485', '629-L633']],
        CronJob: ['batch', ['219-L223', '145-L149', '293-L297']],
      };
      const [group, ranges] = routes[kind];
      const index = ['containers', 'initContainers', 'ephemeralContainers'].indexOf(member.split('[')[0]);
      return {...receivingDefault(`pkg/apis/${group}/v1/zz_generated.defaults.go`, ranges[index], 'Each present container port with empty protocol defaults to TCP on this receiving route.'), explicitZeroValues:['', null]};
    }
    if (member.endsWith('.imagePullPolicy'))
      return {...core('82-L93', 'An empty container imagePullPolicy defaults to Always when the parsed image tag is latest, otherwise IfNotPresent. The image reference of this container determines the default; an explicit policy is preserved.'), explicitZeroValues:['', null]};
    if (member.endsWith('.terminationMessagePath')) {
      const result = core('94-L96', 'An empty container terminationMessagePath defaults to /dev/termination-log.');
      result.evidence.push(defaultEvidence('staging/src/k8s.io/api/core/v1/types.go', '2896-L2897', 'TerminationMessagePathDefault is /dev/termination-log.'));
      return {...result, explicitZeroValues:['', null]};
    }
    if (member.endsWith('.terminationMessagePolicy')) {
      const result = core('97-L99', 'An empty container terminationMessagePolicy defaults to File. This setting does not prove that a terminated container wrote a message.');
      result.evidence.push(defaultEvidence('staging/src/k8s.io/api/core/v1/types.go', '2808-L2810', 'TerminationMessageReadFile has the value File.'));
      return {...result, explicitZeroValues:['', null]};
    }
  }
  const simple = {
    dnsPolicy: ['211-L218', 'An empty DNS policy defaults to ClusterFirst.'],
    restartPolicy: ['219-L221', 'An empty restart policy defaults to Always.'],
    securityContext: ['222-L224', 'An absent securityContext materializes an empty PodSecurityContext.', {}],
    terminationGracePeriodSeconds: ['225-L228', 'An absent termination grace period defaults to 30 seconds.'],
    schedulerName: ['229-L231', 'An empty scheduler name defaults to default-scheduler.'],
  }[member];
  if (simple) return core(...simple);
  if (/^volumes\[\]\.(secret|configMap)\.defaultMode$/u.test(member)) return core('247-L258', 'An absent Secret or ConfigMap volume mode defaults to 0644.');
  return null;
}
const matches = (schema, actual) => schema.length === actual.length && schema.every((token, index) =>
  token === '*' || token === actual[index] || token === '[]' && typeof actual[index] === 'number');
export const productScopeLimits = [
  'The selected configurations depend on the served API versions, enabled admission and controller configuration of the target cluster. Read the stored resource and its controller observations to determine the effective result.',
];

export function discoverProductApiContexts(root) {
  const contexts = [];
  const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'tests', 'test', 'fixtures']);
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name)) continue;
      const source = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(source);
      else if (entry.isFile() && /\.ya?ml$/u.test(source)
        && (!source.startsWith('charts/') || /(?:^|\/)(?:ci-)?values\.ya?ml$/u.test(source))) {
        const bytes = fs.readFileSync(path.join(root, source), 'utf8');
        YAML.parseAllDocuments(bytes).forEach((document, index) => {
          assert.equal(document.errors.length, 0, `API_PRODUCT_YAML_INVALID: ${source}#${index}: ${document.errors.map(error => error.message).join('; ')}`);
          const value = document.toJS();
          if (value?.apiVersion && value?.kind) contexts.push({ apiVersion: value.apiVersion, kind: value.kind,
            path: source, document: index, sourceDigest: digest(bytes) });
        });
      }
    }
  }
  for (const directory of ['charts', 'examples', 'gitops', 'my-values', 'releases/values']) visit(directory);
  contexts.push(...discoverHelmApiOutputs(root).map(output=>output.context),...discoverScriptApiOutputs(root).map(output=>output.context),...discoverGoApiOutputs(root).map(output=>output.context),...discoverShellApiOutputs(root).map(output=>output.context),...discoverTransformedApiOutputs(root).map(output=>output.context),...discoverInfrastructureApiOutputs(root).map(output=>output.context),...discoverExternalChartApiOutputs(root).map(output=>output.context));
  return contexts;
}

export function assertProductApiContexts(resources, root) {
  const normalize = rows => rows.map(({ apiVersion, kind, path, document, sourceDigest, producer, profile, dependencyDigest, outputDigest, inputDigest, inputs, line, expressions, inferredIdentity, requestMethod, requestOperation, requestInvocation, requestConstructor, archivePath, archiveSha256, generatedFields }) =>
    JSON.stringify([apiVersion, kind, path, document, sourceDigest, producer, profile, dependencyDigest, outputDigest, inputDigest, inputs, line, expressions, inferredIdentity, requestMethod, requestOperation, requestInvocation, requestConstructor, archivePath, archiveSha256, generatedFields])).sort();
  const actual = resources.flatMap(resource => resource.sourceContexts.map(context =>
    ({ ...context, apiVersion: resource.apiVersion, kind: resource.kind })));
  assert.deepEqual(normalize(actual), normalize(discoverProductApiContexts(root)), 'API_PRODUCT_DISCOVERY_DRIFT: resource or source document omitted, added or changed');
}

// Re-read source documents, not a stored totals/selected-path assertion. Each
// context digest binds changes, removals and renames to the maintenance gate.
export function apiProductSelection(apiVersion, kind, contexts, receivers, root = process.cwd()) {
  const authority = apiResourceFieldBoundaries(apiVersion, kind);
  const records = new Map(receivers.filter(record => record.kind === kind).map(record => [canonical(record.fieldPath), record]));
  const selected = new Map();
  const authoredUnknownFields=[];
  const metadataPaths = new Set();
  const add = (boundary, evidence) => {
    if (!selected.has(boundary.fieldPath)) selected.set(boundary.fieldPath, []);
    selected.get(boundary.fieldPath).push(evidence);
  };
  for (const context of contexts) {
    const bytes = fs.readFileSync(path.resolve(root, context.path), 'utf8');
    assert.equal(digest(bytes), context.sourceDigest, `API_PRODUCT_SOURCE_DRIFT: ${context.path}`);
    let value;
    if (context.producer) {
      const outputs=context.producer==='helm'?discoverHelmApiOutputs(root):context.producer==='go-shape'?discoverGoApiOutputs(root):context.producer==='shell-shape'?discoverShellApiOutputs(root):context.producer==='script-render'?discoverTransformedApiOutputs(root):context.producer==='infrastructure-helm'?discoverInfrastructureApiOutputs(root):context.producer==='external-helm'?discoverExternalChartApiOutputs(root):discoverScriptApiOutputs(root);
      const output=outputs.find(item=>item.context.path===context.path && item.context.document===context.document && item.context.profile===context.profile);
      assert(output, `API_PRODUCT_OUTPUT_MISSING: ${context.path} ${context.profile}#${context.document}`);
      assert.deepEqual({...context,owner:undefined,apiVersion,kind},{...output.context,owner:undefined}, `API_PRODUCT_OUTPUT_DRIFT: ${context.path} ${context.profile}`);
      value=output.value;
    } else {
      const document = YAML.parseAllDocuments(bytes)[context.document];
      assert(document && !document.errors.length, `API_PRODUCT_DOCUMENT_MISSING: ${context.path}#${context.document}`);
      value = document.toJS();
    }
    assert(value?.apiVersion === apiVersion && value?.kind === kind, `API_PRODUCT_RESOURCE_DRIFT: ${context.path}#${context.document}`);
    const instances = [];
    function visit(node, actual = []) {
      if(context.inferredIdentity&&actual.length===1&&['apiVersion','kind'].includes(actual[0]))return;
      const actualPath = yamlFieldPath(actual);
      if (actual[0] === 'metadata') metadataPaths.add(canonical(actualPath));
      const boundary = authority.find(row => matches(tokens(row.fieldPath), actual));
      if (!boundary && actual.length) {
        if (actual[0] === 'metadata') apiFieldSchemaAuthority(apiVersion, kind, actualPath);
        else {
          const ancestors = authority.filter(row => {
            const parts = tokens(row.fieldPath);
            return parts.length < actual.length && matches(parts, actual.slice(0, parts.length));
          }).sort((a, b) => tokens(b.fieldPath).length - tokens(a.fieldPath).length);
          const parent = ancestors[0];
          const parts = parent && tokens(parent.fieldPath);
          const opaque = parent && !authority.some(row => {
            const child = tokens(row.fieldPath);
            return child.length > parts.length && matches(parts, child.slice(0, parts.length));
          });
          if(!opaque) {
            const records=authoredUnknownFieldContracts(apiVersion,kind,[{fieldPath:actualPath,contract:{type:typeof node}}],{apiVersion,kind,...context});
            assert(records.length===1,`API_PRODUCT_FIELD_OUTSIDE_AUTHORITY: ${apiVersion}/${kind} ${actualPath}`);
            const receiverContract=records[0];
            assert.equal(node,receiverContract.authoredValue,`API_PRODUCT_AUTHORED_UNKNOWN_VALUE_DRIFT: ${context.path} ${actualPath}`);
            authoredUnknownFields.push({fieldPath:actualPath,authorityRole:receiverContract.authorityRole,schemaAuthority:null,authoredValue:node,receiverContract});
            return;
          }
        }
      }
      if (boundary && actual.length) {
        add(boundary, { reason: 'authored-resource-field', path: context.path, document: context.document, fieldPath: actualPath, sourceDigest: context.sourceDigest });
        if(kind==='CSIDriver'&&actualPath==='$.spec.volumeLifecycleModes'&&Array.isArray(node)&&node.length===0) {
          const receiverDefault=runtimeDefaultApplicability(kind,actualPath,{},value,records.get(boundary.fieldPath));
          const child=authority.find(row=>matches(tokens(row.fieldPath),[...actual,0]));
          assert(receiverDefault?.materializes?.[0]==='Persistent'&&child,`API_PRODUCT_EMPTY_ARRAY_DEFAULT_UNQUALIFIED: ${actualPath}`);
          add(child,{reason:'receiver-materialized-default-child',path:context.path,document:context.document,fieldPath:yamlFieldPath([...actual,0]),parentPath:actualPath,sourceDigest:context.sourceDigest,omission:receiverDefault.omission,evidence:receiverDefault.evidence});
        }
      }
      if (node && typeof node === 'object' && !Array.isArray(node) && !Object.hasOwn(node,'__docsDynamicExpression')) instances.push({ node, actual });
      if (node && typeof node === 'object' && Object.hasOwn(node,'__docsDynamicExpression')) {
        if(isProductOwnedApi(apiVersion,kind)&&boundary) {
          // The entire owned public schema is selected below. Existing-state
          // values may be copied symbolically, but explicitly authored updates
          // are still checked against the schema and cannot hide behind a copy.
          for(const [key,child] of Object.entries(node))if(!key.startsWith('__docs'))visit(child,[...actual,key]);
          return;
        }
        if(node.__docsSupportedSchemaPassthrough) {
          assert(boundary,`API_PRODUCT_PASSTHROUGH_AUTHORITY_MISSING: ${context.path} ${actualPath}`);
          for(const child of authority.filter(row=>tokens(row.fieldPath).length>actual.length&&matches(tokens(boundary.fieldPath),tokens(row.fieldPath).slice(0,actual.length))))add(child,{reason:'supported-public-object-serialized-without-member-filter',path:context.path,document:context.document,fieldPath:child.fieldPath,sourceDigest:context.sourceDigest,...node.__docsSupportedSchemaPassthrough});
          return;
        }
        assert(!['object','array'].includes(boundary?.contract.type) || boundary?.contract.additionalProperties || !authority.some(row=>tokens(row.fieldPath).length>actual.length&&matches(tokens(row.fieldPath).slice(0,actual.length),actual)), `API_PRODUCT_OUTPUT_DYNAMIC_UNRESOLVED: ${context.path}:${context.line} ${actualPath}: ${node.__docsDynamicExpression}`);
        return;
      }
      if (Array.isArray(node)) node.forEach((item, index) => visit(item, [...actual, index]));
      else if (node && typeof node === 'object') Object.entries(node).forEach(([key, item]) => visit(item, [...actual, key]));
    }
    visit(value);
    // Presence is local to the actual object, before array indices become a
    // coverage identity. One item cannot suppress another item's default.
    for (let index = 0; index < instances.length; index += 1) {
      const { node, actual, materializedBy } = instances[index];
      const parent = authority.find(row => matches(tokens(row.fieldPath), actual));
      if (!parent) continue;
      for (const boundary of authority) {
        const parts = tokens(boundary.fieldPath);
        const key = parts.at(-1);
        if (parts.length !== actual.length + 1 || !matches(parts.slice(0, -1), actual)
          || key === '*' || key === '[]') continue;
        const record = records.get(boundary.fieldPath);
        const required = (parent.contract.required ?? []).includes(key);
        const defaulted = Object.hasOwn(boundary.contract, 'default');
        const receiverDefault = (context.requestMethod?null:runtimeDefaultApplicability(kind, boundary.fieldPath, node, value, record));
        const present = Object.hasOwn(node, key);
        if (present && !receiverDefault?.explicitZeroValues?.includes(node[key])) continue;
        if (!required && !defaulted && !receiverDefault) continue;
        const fieldPath = yamlFieldPath([...actual, key]);
        const evidence = {
          reason: present ? 'receiver-default-for-explicit-zero-value' : required ? 'required-under-present-parent' : defaulted ? 'schema-default-under-present-parent' : 'receiver-default-under-present-parent',
          path: context.path, document: context.document, fieldPath,
          parentPath: yamlFieldPath(actual), sourceDigest: context.sourceDigest,
          ...(materializedBy ? { materializedBy } : {}),
          ...(receiverDefault ? { mechanism: receiverDefault.reason, omission: receiverDefault.omission, evidence: receiverDefault.evidence } : {}),
        };
        add(boundary, evidence);
        const materialized = receiverDefault?.materializes ?? (defaulted && boundary.contract.default);
        if (materialized && typeof materialized === 'object') {
          const recordChildren=(child,path)=>{
            if(Array.isArray(child)){child.forEach((item,index)=>recordChildren(item,[...path,index]));return;}
            if(path.length>actual.length+1){const materializedBoundary=authority.find(row=>matches(tokens(row.fieldPath),path));assert(materializedBoundary,`API_PRODUCT_DEFAULT_CHILD_OUTSIDE_AUTHORITY: ${kind} ${yamlFieldPath(path)}`);add(materializedBoundary,{...evidence,reason:'receiver-materialized-default-child',fieldPath:yamlFieldPath(path),parentPath:fieldPath});}
            if(child&&typeof child==='object')instances.push({node:child,actual:path,materializedBy:fieldPath});
          };
          recordChildren(materialized,[...actual,key]);
        }
      }
    }
  }
  if (isProductOwnedApi(apiVersion,kind)) for(const boundary of authority) if(!selected.has(boundary.fieldPath)) add(boundary,{reason:'recursive-product-owned-public-schema',authority:boundary.authority,authoritySha256:boundary.authoritySha256});
  return { version: 1, fieldPaths: [...selected.keys()].sort(), applicability: Object.fromEntries([...selected].sort(([a], [b]) => a.localeCompare(b))), metadataPaths: [...metadataPaths].sort(), limits: productScopeLimits,...(authoredUnknownFields.length?{authoredUnknownFields}: {}) };
}

export const versionedApiReceiverRegistries = new Map([
  ['v1', [...workloadReceiverContracts.filter(record=>record.kind==='Pod'), ...coreReceiverContracts, ...identitySecretContracts, ...namespaceIsolationContracts.filter(record=>record.authoritySelector.apiVersion==='v1'), ...authDeleteContracts.filter(record=>record.kind==='DeleteOptions'), ...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='v1')]],
  ['apiextensions.k8s.io/v1', [...clusterConfigurationContracts.filter(record=>record.kind==='CustomResourceDefinition'), ...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='apiextensions.k8s.io/v1')]],
  ['rbac.authorization.k8s.io/v1', [...clusterConfigurationContracts.filter(record=>['ClusterRole','ClusterRoleBinding'].includes(record.kind)), ...namespaceIsolationContracts.filter(record=>record.authoritySelector.apiVersion==='rbac.authorization.k8s.io/v1'), ...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='rbac.authorization.k8s.io/v1')]],
  ['authentication.k8s.io/v1', authDeleteContracts.filter(record=>record.kind==='TokenReview')],
  ['batch/v1', [...workloadReceiverContracts.filter(record=>['Job','CronJob'].includes(record.kind)),...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='batch/v1')]],
  ['policy/v1', [...workloadReceiverContracts.filter(record=>record.kind==='PodDisruptionBudget'),...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='policy/v1')]],
  ['apps/v1', [...deploymentReceiverContracts, ...nodeWorkloadContracts.filter(record=>record.kind==='DaemonSet'), ...workloadReceiverContracts.filter(record=>record.kind==='StatefulSet'), ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'apps/v1')]],
  ['storage.k8s.io/v1',[...nodeWorkloadContracts.filter(record=>record.kind==='CSIDriver'),...envelopeReceiverContracts.filter(record=>record.authoritySelector.apiVersion==='storage.k8s.io/v1')]],
  ['argoproj.io/v1alpha1', argoReceiverContracts],
  ['cilium.io/v2', ciliumReceiverContracts],
  ['monitoring.coreos.com/v1', prometheusContracts],
  ['spire.spiffe.io/v1alpha1', clusterSPIFFEIDContracts],
  ['networking.k8s.io/v1', [...clusterConfigurationContracts.filter(record=>record.kind==='IngressClass'), ...networkingReceiverContracts, ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'networking.k8s.io/v1')]],
  ['admissionregistration.k8s.io/v1', [...admissionReceiverContracts, ...webhookSelectedContracts, ...admissionStatusReceiverContracts, ...envelopeReceiverContracts.filter(record => record.authoritySelector.apiVersion === 'admissionregistration.k8s.io/v1')]],
]);
for (const [apiVersion, records] of versionedApiReceiverRegistries) {
  versionedApiReceiverRegistries.set(apiVersion, [...records,
    ...metadataReceiverContracts.filter(record => record.authoritySelector.apiVersion === apiVersion)]);
}


export function productApiReceiverRecords(apiVersion, kind, selectedPaths = null) {
  const records=versionedApiReceiverRegistries.get(apiVersion)??[];
  if(selectedPaths&&['MutatingWebhookConfiguration','ValidatingWebhookConfiguration'].includes(kind)&&apiVersion==='admissionregistration.k8s.io/v1')return [...records.filter(record=>record.kind!==kind||/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)),...webhookSelectedReceiverContracts(apiVersion,kind,selectedPaths.filter(row=>!/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(typeof row==='string'?row:row.fieldPath)))];
  if(selectedPaths&&['ServiceAccount','Secret'].includes(kind)&&apiVersion==='v1')return [...records.filter(record=>record.kind!==kind||/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)),...identitySecretReceiverContracts(apiVersion,kind,selectedPaths)];
  if(selectedPaths&&apiVersion==='monitoring.coreos.com/v1')return [...records.filter(record=>record.kind!==kind),...prometheusSelectedReceiverContracts(apiVersion,kind,selectedPaths)];
  if(selectedPaths&&kind==='ClusterSPIFFEID'&&apiVersion==='spire.spiffe.io/v1alpha1')return [...records.filter(record=>record.kind!==kind),...clusterSPIFFEIDSelectedReceiverContracts(apiVersion,kind,selectedPaths.map(row=>typeof row==='string'?{fieldPath:row}:row))];
  if(kind==='BusterNamespaceLease'&&isProductOwnedApi(apiVersion,kind))return [...records,...busterLeaseReceiverContracts(apiVersion,apiResourceFieldBoundaries(apiVersion,kind))];
  if (selectedPaths && ({Pod:'v1',Job:'batch/v1',CronJob:'batch/v1',StatefulSet:'apps/v1',PodDisruptionBudget:'policy/v1'})[kind]===apiVersion) return [...records.filter(record=>record.kind!==kind||/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)), ...selectedWorkloadReceiverContracts(apiVersion,kind,selectedPaths)];
  if(selectedPaths&&['DaemonSet','CSIDriver'].includes(kind))return [...records.filter(record=>record.kind!==kind||/^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)),...nodeWorkloadsReceiverContracts(apiVersion,kind,selectedPaths)];
  if (selectedPaths && ['ClusterRole','ClusterRoleBinding','IngressClass','CustomResourceDefinition'].includes(kind)) return [...records.filter(record=>record.kind!==kind || /^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)), ...clusterConfigurationReceiverContracts(apiVersion,kind,selectedPaths)];
  if (selectedPaths && ['ResourceQuota','LimitRange','Role','RoleBinding'].includes(kind)) {
    return [...records.filter(record=>record.kind!==kind || /^\$\.(metadata(?:\.|\[|$)|apiVersion$|kind$)/.test(record.fieldPath)), ...namespaceIsolationReceiverContracts(apiVersion,kind,selectedPaths)];
  }
  if (selectedPaths && ['TokenReview','DeleteOptions'].includes(kind)) return [...records.filter(record=>record.kind!==kind), ...authDeleteReceiverContracts(apiVersion,kind,selectedPaths)];
  return records;
}

export function productMetadataReferences(resources) {
  return implicitKubernetesObjectMetaReferences.flatMap(reference => {
    const resource = resources.find(item => item.apiVersion === reference.apiVersion && item.kind === reference.kind);
    if (!resource) return [];
    if (!resource.productSelection) return [reference];
    const actual = resource.productSelection.metadataPaths.map(tokens);
    const contracts = reference.contracts.filter(record => actual.some(parts => matches(tokens(record.fieldPath), parts)));
    return contracts.length ? [{ ...reference, contracts }] : [];
  });
}
