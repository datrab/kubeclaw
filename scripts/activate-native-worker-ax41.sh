#!/usr/bin/env bash
# Initial activation for the inspected AX41 installation. Restarts K3s.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
repository="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repository"
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
confdir=/var/lib/rancher/k3s/agent/etc/kubelet.conf.d
containerdir=/var/lib/rancher/k3s/agent/etc/containerd
reservation="$confdir/90-kubeclaw-native.conf"
template="$containerdir/config-v3.toml.tmpl"
dependency=/etc/systemd/system/k3s.service.d/90-kubeclaw-native.conf
[[ "$(systemctl show kubeclaw-native-pools.service -p SubState --value)" == running ]]
command -v kubectl >/dev/null
for file in "$reservation" "$template" "$containerdir/config.toml.tmpl" "$dependency"; do
  [[ ! -e "$file" && ! -L "$file" ]] || { echo "STOP: existing file needs review: $file" >&2; exit 1; }
done
[[ $(find "$confdir" -maxdepth 1 -name '*.conf' | wc -l) == 1 && -f "$confdir/00-k3s-defaults.conf" ]]

backup="$(mktemp -d /root/kubeclaw-native-activation.XXXXXX)"
echo "Activation backup: $backup"
k3s kubectl get node ax41-production -o json > "$backup/node.json"
k3s kubectl -n kubeclaw get deployment agent-buster agent-nova -o json > "$backup/old-agents.json"
k3s kubectl get --raw /api/v1/nodes/ax41-production/proxy/configz > "$backup/configz.json"
node scripts/render-native-worker-node.mjs my-values/infra/native-worker-pools-ax41.yaml "$backup/generated"
for policy in native-node-policy.json native-nri.json buster-pool.json prism-pool.json; do
  cmp "$backup/generated/$policy" "/etc/kubeclaw/$policy"
done
/opt/nri/plugins/10-kubeclaw-native --check-policy /etc/kubeclaw/native-nri.json

# Refuse uninspected configuration authorities; never print process credentials.
node --input-type=module - "$backup" <<'JS'
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {nativeNodeQuantity} from './scripts/native-worker-node-capacity.mjs';
const backup=process.argv[2];
const pid=execFileSync('systemctl',['show','k3s','-p','MainPID','--value'],{encoding:'utf8'}).trim();
const args=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0');
const env=fs.readFileSync(`/proc/${pid}/environ`,'utf8').split('\0');
if(args.some(a=>/^(--config(?:=|$)|-c$|--data-dir(?:=|$)|--kubelet-arg(?:=|$))/.test(a))
 || env.some(a=>/^K3S_(CONFIG_FILE|DATA_DIR|KUBELET_ARG)=.+/.test(a))
 || fs.existsSync('/etc/rancher/k3s/config.yaml')
 || (fs.existsSync('/etc/rancher/k3s/config.yaml.d') && fs.readdirSync('/etc/rancher/k3s/config.yaml.d').some(n=>n.endsWith('.yaml')))) throw Error('Uninspected K3s config authority; stop before mutation');
const current=JSON.parse(fs.readFileSync(`${backup}/configz.json`)).kubeletconfig;
const node=JSON.parse(fs.readFileSync(`${backup}/node.json`));
const agents=JSON.parse(fs.readFileSync(`${backup}/old-agents.json`));
if(agents.items.some(d=>d.spec.replicas!==0)) throw Error('Old Buster/Nova must remain scaled to zero');
const nri=JSON.parse(fs.readFileSync(`${backup}/generated/native-nri.json`));
if(node.status.nodeInfo.containerRuntimeVersion!==`containerd://${nri.containerdVersion}`) throw Error('Runtime differs from selected policy');
if(current.cgroupDriver!=='systemd'||current.cgroupsPerQOS!==true||current.cgroupRoot) throw Error('Unsupported kubelet cgroup configuration');
const next=JSON.parse(fs.readFileSync(`${backup}/generated/kubelet-reservations.json`));
for(const name of ['systemReserved','kubeReserved']){
 const merged={...current[name]};
 for(const [key,value] of Object.entries(next[name])){
   const scale=key==='cpu'?1000000000n:1n;
   if(!merged[key]||nativeNodeQuantity(merged[key],scale)<nativeNodeQuantity(value,scale)) merged[key]=value;
 }
 next[name]=merged;
}
next.enforceNodeAllocatable=[...new Set([...(current.enforceNodeAllocatable??[]),'pods'])];
const podMemory=nativeNodeQuantity(node.status.capacity.memory)-nativeNodeQuantity(next.systemReserved.memory)-nativeNodeQuantity(next.kubeReserved.memory);
if(BigInt(fs.readFileSync('/sys/fs/cgroup/kubepods.slice/memory.current','utf8').trim())>=podMemory) throw Error('Current Pod memory usage exceeds the planned allocation');
fs.writeFileSync(`${backup}/reservations.conf`,JSON.stringify({apiVersion:'kubelet.config.k8s.io/v1beta1',kind:'KubeletConfiguration',...next},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(next,null,2));
JS
python3 - "$containerdir/config.toml" <<'PY'
import sys,tomllib
with open(sys.argv[1],'rb') as f: c=tomllib.load(f)
if c.get('version') != 3 or any('nri' in k.lower() for k in c.get('plugins',{})):
    raise SystemExit('STOP: containerd config differs from inspected v3 without explicit NRI section')
PY
cp -a "$confdir/00-k3s-defaults.conf" "$backup/00-k3s-defaults.conf"
cp -a "$containerdir/config.toml" "$backup/containerd-before.toml"
systemctl cat k3s > "$backup/k3s-unit-before.txt"
k3s etcd-snapshot save --name "before-native-activation-$(date +%Y%m%d-%H%M%S)"
printf '{{ template "base" . }}\n\n' > "$backup/config-v3.toml.tmpl"
cat "$backup/generated/containerd-nri.toml" >> "$backup/config-v3.toml.tmpl"
printf '[Unit]\nRequires=kubeclaw-native-pools.service\nAfter=kubeclaw-native-pools.service\n' > "$backup/k3s-dependency.conf"
install -m 0600 "$backup/reservations.conf" "$reservation"
install -m 0600 "$backup/config-v3.toml.tmpl" "$template"
install -d -m 0755 /etc/systemd/system/k3s.service.d
install -m 0644 "$backup/k3s-dependency.conf" "$dependency"
systemctl daemon-reload
systemctl enable kubeclaw-native-pools.service
echo "Restarting K3s; retain SSH access and backup directory $backup"
systemctl restart k3s
ready=false
for attempt in {1..60}; do
  if k3s kubectl get --raw /readyz >/dev/null 2>&1; then ready=true; break; fi
  sleep 3
done
[[ "$ready" == true ]] || { echo "STOP: API readiness timeout; inspect journalctl -u k3s and backup $backup" >&2; exit 1; }
k3s kubectl wait --for=condition=Ready node/ax41-production --timeout=180s
node scripts/native-worker-node-preflight.mjs my-values/infra/native-worker-pools-ax41.yaml
k3s ctr plugins ls | grep 'io.containerd.nri.v1'
pgrep -f '^/opt/nri/plugins/10-kubeclaw-native( |$)'
echo 'Capacity preflight passed and NRI process found. Real worker namespace-adjustment smoke test is still required.'
