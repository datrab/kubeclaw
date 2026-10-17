import pathlib,json,hashlib,gzip,io,subprocess
root=pathlib.Path.cwd(); out=pathlib.Path(__file__).parent;a=root/'docs/review/evidence/config-acceptance/author';r=json.loads((a/'checkpoint-7-identities.json').read_text());h=hashlib.sha256();parts=[]
for p in r['patch']['parts']:
 data=(root/p['path']).read_bytes();parts.append({'path':p['path'],'matches':hashlib.sha256(data).hexdigest()==p['sha256']});h.update(data)
# Exactly recorded parts, with streaming decompression; no restore/application to shared checkout.
class Parts(io.RawIOBase):
 def __init__(self):self.files=iter(r['patch']['parts']);self.current=None
 def readable(self):return True
 def readinto(self,b):
  while True:
   if self.current is None:
    try:self.current=open(root/next(self.files)['path'],'rb')
    except StopIteration:return 0
   data=self.current.read(len(b))
   if data:b[:len(data)]=data;return len(data)
   self.current.close();self.current=None
rawh=hashlib.sha256();n=0
with gzip.GzipFile(fileobj=io.BufferedReader(Parts())) as f:
 while data:=f.read(1024*1024):rawh.update(data);n+=len(data)
v={'partChecks':parts,'gzipSha256Matches':h.hexdigest()==r['patch']['gzipSha256'],'rawSha256Matches':rawh.hexdigest()==r['patch']['rawSha256'],'rawBytesMatches':n==r['patch']['rawBytes'],'parentMatches':r['parentCommit']==subprocess.check_output(['git','rev-parse','HEAD^'],text=True).strip(),'selfExclusions':r['selfExclusions']};(out/'freeze-verification.json').write_text(json.dumps(v,indent=2));print(json.dumps(v))
