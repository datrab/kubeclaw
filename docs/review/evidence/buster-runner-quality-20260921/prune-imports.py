from pathlib import Path
import re
root=Path(__file__).resolve().parent/'files'
pattern=re.compile(r'^import(?: type)?\s+(.+?)\s+from\s+(["\'][^"\']+["\']);\n',re.M|re.S)
for p in root.rglob('*'):
 if p.suffix not in ['.ts','.mts']:continue
 s=p.read_text(); body=pattern.sub('',s)
 def prune(m):
  group=m.group(1)
  if '{' not in group:
   return m.group() if re.search(r'\b'+re.escape(group.strip())+r'\b',body) else ''
  keep=[]
  for v in group[group.index('{')+1:group.index('}')].split(','):
   n=v.strip().removeprefix('type ').strip()
   if n and re.search(r'\b'+re.escape(n)+r'\b',body):keep.append(v.strip())
  if not keep:return ''
  prefix='import type' if m.group().startswith('import type') else 'import'
  return prefix+' { '+', '.join(keep)+' } from '+m.group(2)+';\n'
 p.write_text(pattern.sub(prune,s))
p=root/'skills/buster/engine/test-gates/runner.ts';s=p.read_text();s=re.sub(r'const EMPTY_COUNTS = Object.freeze\(\{.*?\}\);\n','',s,flags=re.S);s=s.replace('const WORKER_RESULT_WRAPPER_BYTES = 4096;\n','').replace('const MAX_TIMER_MS = 2_147_483_647;\n','');p.write_text(s)
print({'runnerLines':len(s.splitlines())})
