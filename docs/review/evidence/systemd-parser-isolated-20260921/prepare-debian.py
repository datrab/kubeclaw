from pathlib import Path
import urllib.request,hashlib,lzma,json,re,tarfile,io,resource,posixpath
resource.setrlimit(resource.RLIMIT_AS,(256*1024**2,256*1024**2))
c=Path('node_modules/.cache/systemd-parser-20260921');e=Path('docs/review/evidence/systemd-parser-isolated-20260921');(c/'debs').mkdir(exist_ok=True);root=c/'runtime';root.mkdir(exist_ok=True)
def fetch(url,f,size=None,digest=None):
 if not f.exists():
  with urllib.request.urlopen(url,timeout=30) as s,f.open('wb') as out:
   while b:=s.read(65536):
    out.write(b); assert out.tell()<=128*1024**2
 if size is not None:assert f.stat().st_size==size
 if digest:assert hashlib.sha256(f.read_bytes()).hexdigest()==digest
 assert sum(x.stat().st_size for x in c.rglob('*') if x.is_file() and (x.suffix in ['.apk','.deb','.xz','.asc'] or x.name=='InRelease'))<=128*1024**2
release=(c/'InRelease').read_text();match=re.search(r'^ ([a-f0-9]{64})\s+(\d+) main/binary-amd64/Packages.xz$',release,re.M);assert match
fetch('https://deb.debian.org/debian/dists/trixie/main/binary-amd64/Packages.xz',c/'Packages.xz',int(match[2]),match[1])
records={};wanted={'libcap-ng0','systemd','libsystemd-shared','libsystemd0','libc6','libcap2','libacl1','libapparmor1','libmount1','libpam0g','libseccomp2','libselinux1','libssl3t64','libaudit1','libaudit-common','libcrypt1','libblkid1','libpcre2-8-0','liblzma5','liblz4-1','libzstd1','libgcrypt20','libgpg-error0','zlib1g','libkmod2','libbpf1','libelf1t64','openssl-provider-legacy'}
with lzma.open(c/'Packages.xz','rt') as stream:
 block=[]
 for line in stream:
  if line.strip():block.append(line);continue
  fields={};last=None
  for l in block:
   if l.startswith(' ') and last:fields[last]+=' '+l.strip()
   elif ': ' in l:last,v=l.split(': ',1);fields[last]=v.strip()
  if fields.get('Package') in wanted:records[fields['Package']]=fields
  block=[]
assert wanted<=records.keys(),wanted-records.keys()
for name in ['systemd','libsystemd-shared','libsystemd0']:assert records[name]['Version']=='257.13-1~deb13u1',records[name]['Version']
(e/'selected-packages.json').write_text(json.dumps(list(records.values()),indent=2)+'\n')
def contained_filter(member,destination):
 if member.issym() and member.linkname.startswith('/'):
  member=member.replace(linkname=posixpath.relpath(member.linkname.lstrip('/'),posixpath.dirname(member.name)))
 return tarfile.data_filter(member,destination)
for name in sorted(wanted):
 r=records[name];f=c/'debs'/Path(r['Filename']).name;fetch('https://deb.debian.org/debian/'+r['Filename'],f,int(r['Size']),r['SHA256']);data=f.read_bytes();assert data[:8]==b'!<arch>\n';pos=8
 while pos<len(data):
  h=data[pos:pos+60];length=int(h[48:58]);member=h[:16].decode().strip().rstrip('/');body=data[pos+60:pos+60+length];pos+=60+length+(length%2)
  if member.startswith('data.tar'):
   with tarfile.open(fileobj=io.BytesIO(body),mode='r:*') as archive:archive.extractall(root,filter=contained_filter)
 assert sum(x.stat().st_size for x in root.rglob('*') if x.is_file())<=512*1024**2
 print(name,r['Version'],flush=True)
