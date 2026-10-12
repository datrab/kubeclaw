export const nativePoolRoot: '/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service';
export interface NativeNodeResources { cpuMillicores: number; memoryBytes: number; tasks: number }
export interface NativeNodePolicy {
  schemaVersion: 1;
  nodeName: string;
  systemReserve: NativeNodeResources;
  kubernetesReserve: NativeNodeResources;
  pools: Record<'buster' | 'prism', NativeNodeResources & { namespace: string; maximumActiveScopes: number }>;
}
export interface NativePoolPolicy {
  schemaVersion: 1;
  role: 'buster' | 'prism';
  nodeName: string;
  policyDigest: string;
  cgroupRoot: string;
  ownershipRoot: string;
  nodeIdentityFile: string;
  runtimeIdentityFile: string;
  maximumActiveScopes: number;
  limits: { memoryBytes: number; tasks: number; cpuQuotaMicroseconds: number; cpuPeriodMicroseconds: number };
}
export function validateNativeNodePolicy(policy: unknown): NativeNodePolicy;
export function loadNativeNodePolicy(file: string): NativeNodePolicy;
export function nativePoolPolicy(policy: unknown, role: 'buster' | 'prism'): NativePoolPolicy;
export function nativeNodeReservation(policy: unknown): {
  systemReserved: { cpu: string; memory: string; pid: string };
  kubeReserved: { cpu: string; memory: string; pid: string };
};
