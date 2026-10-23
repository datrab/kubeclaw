import io,gzip,tarfile,random,json,hashlib
from pathlib import Path
b=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/independent-c1-case-oracles/fixture-definition-01');o=b/'archives';o.mkdir(exist_ok=True)
class Zeros:
 def read(self,n=-1):return b'\0'*n
class RandomBytes:
 def __init__(self):self.r=random.Random(229)
 def read(self,n=-1):return self.r.randbytes(n)
def member(t,name,size,data):
 x=tarfile.TarInfo(name);x.size=size;x.mode=0o600;x.uid=x.gid=0;x.mtime=0;t.addfile(x,data if size else None)
def archive(name,make):
 p=o/(name+'.tar.gz')
 with open(p,'wb') as f:
  with gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0,compresslevel=1) as g:
   with tarfile.open(mode='w|',fileobj=g,format=tarfile.PAX_FORMAT) as t:make(t)
 return {'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
r=[]
r.append(archive('entries-150001',lambda t:[member(t,'entry-'+str(i),0,None) for i in range(150001)]))
r.append(archive('expanded-402653185',lambda t:member(t,'expanded.bin',402653185,Zeros())))
name=('p'*64+'/')*(810000//65)+'f'*(810000%65)
r.append(archive('listing-long-name-810000',lambda t:member(t,name,0,None)))
r.append(archive('archive-bytes-50335744-body',lambda t:member(t,'uncompressed-data.bin',50335744,RandomBytes())))
(b/'archive-generation.json').write_text(json.dumps({'scope':'Deterministic local regular-file PAX gzip/tar definitions only; no extraction; all member names relative, no links/devices/host writes','archives':r,'pythonRandomSeed':229,'gzipMtime':0,'sourceCaseIds':['CMP-C1-EFFECT-buster-engine-preparation.maximumArchiveEntries','CMP-C1-EFFECT-buster-engine-preparation.maximumExtractedBytes','CMP-C1-EFFECT-buster-engine-preparation.maximumListingLineBytes','CMP-C1-EFFECT-buster-engine-preparation.maximumArchiveBytes']},indent=2)+'\n');print(json.dumps(r))
