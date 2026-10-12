import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DEMO_CREDENTIAL_PROVENANCE_INVALID');
  return value as JsonObject;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\0\r\n]/u.test(value)) throw new Error('DEMO_CREDENTIAL_PROVENANCE_INVALID');
  return value;
}
function decoded(value: unknown): string {
  const encoded = text(value); const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('DEMO_CREDENTIAL_ENCODING_INVALID');
  return text(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
}

function matches(actual:JsonObject,expected:JsonObject):void {
  if(Object.entries(expected).some(([key,value])=>actual[key]!==value))throw new Error('DEMO_CREDENTIAL_PROVENANCE_MISMATCH');
}

export function assertGeneratedCredentialLease(lease:JsonObject,expected:{leaseName:string;namespace:string;secretName:string;immutableImage:string;manifestDigest:string}):void {
  const metadata=object(lease.metadata),spec=object(lease.spec),status=object(lease.status),source=object(status.generatedCredentials);
  matches(metadata,{name:expected.leaseName});
  matches(status,{namespaceName:expected.namespace,credentialsAvailable:true});
  matches(spec,{verifiedImage:expected.immutableImage,manifestDigest:expected.manifestDigest});
  matches(object(spec.testCredentials),{mode:'generate',secretName:expected.secretName});
  matches(source,{schemaVersion:'generated-demo-credential-source.v1',leaseUID:text(metadata.uid),namespace:expected.namespace,secretName:expected.secretName});
  text(source.secretUID);text(source.secretResourceVersion);text(source.credentialDigest);
}

/** Consume fresh Kubernetes responses; a Secret name or user label is not provenance. */
export function generatedDemoCredentials(lease: JsonObject, secret: JsonObject, expected: {
  leaseName: string; namespace: string; secretName: string; immutableImage: string; manifestDigest: string;
}) {
  const metadata = object(lease.metadata), spec = object(lease.spec), status = object(lease.status);
  const source = object(status.generatedCredentials), requested = object(spec.testCredentials);
  const secretMeta = object(secret.metadata), annotations = object(secretMeta.annotations), labels = object(secretMeta.labels);
  const boundSource={schemaVersion:'generated-demo-credential-source.v1',leaseUID:text(metadata.uid),
    secretUID:text(secretMeta.uid),secretResourceVersion:text(secretMeta.resourceVersion),namespace:expected.namespace,
    secretName:expected.secretName,credentialDigest:text(source.credentialDigest)};
  matches(metadata,{name:expected.leaseName});
  matches(status,{namespaceName:expected.namespace,credentialsAvailable:true});
  matches(spec,{verifiedImage:expected.immutableImage,manifestDigest:expected.manifestDigest});
  matches(requested,{mode:'generate',secretName:expected.secretName});
  matches(source,boundSource);
  matches(secretMeta,{namespace:expected.namespace,name:expected.secretName});
  matches(secret,{immutable:true});
  matches(annotations,{'kubeclaw.forgestack.ai/generated-demo-credentials':'v1','kubeclaw.forgestack.ai/credential-lease-uid':metadata.uid});
  matches(labels,{'kubeclaw/buster-lease-uid':metadata.uid,'kubeclaw/managed-by':'buster-namespace-controller'});
  const data = object(secret.data);
  if (canonicalJson(Object.keys(data).sort()) !== canonicalJson(['password','username'])) throw new Error('DEMO_CREDENTIAL_KEYS_INVALID');
  const values = {username:decoded(data.username),password:decoded(data.password)};
  if (sha256Text(canonicalJson(values)) !== source.credentialDigest) throw new Error('DEMO_CREDENTIAL_DIGEST_MISMATCH');
  return {schemaVersion:'generated-demo-credentials.v1',...expected,source:boundSource,values};
}
