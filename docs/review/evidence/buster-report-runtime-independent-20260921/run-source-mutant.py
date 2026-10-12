"""Private runtime copy: allow a child to substitute the trusted source artifact."""
from pathlib import Path
import subprocess,tempfile
root=Path.cwd();e=root/'docs/review/evidence/buster-report-runtime-independent-20260921'
modules=root/'skills/buster/engine/test-gates'
with tempfile.TemporaryDirectory(prefix='mutant-',dir=e) as temp:
 directory=Path(temp)
 source=(modules/'report-adapter-runtime.ts').read_text()
 needle='    sourceArtifact: { ...artifact },'
 assert source.count(needle)==1
 source=source.replace(needle,'    sourceArtifact: (value as ReportAdapterOutput & { sourceArtifact?: ArtifactRefV1 }).sourceArtifact ?? { ...artifact },')
 for name in ['report-adapter-package.ts','report-artifact-reader.ts','process-input.ts']:
  source=source.replace(f"'./{name}'",repr((modules/name).as_uri()))
 source=source.replace("path.join(path.dirname(fileURLToPath(import.meta.url)), 'report-adapter-child.mjs')",repr(str(modules/'report-adapter-child.mjs')))
 mutant=directory/'runtime.ts';mutant.write_text(source)
 test=(root/'tests/verification/contracts/check-pipeline-report-adapter-runtime.mts').read_text()
 test=test.replace("'../../../skills/buster/engine/src/index.ts'",repr(mutant.as_uri()))
 test=test.replace("'../../../skills/nova/core/src/index.ts'",repr((root/'skills/nova/core/src/index.ts').as_uri()))
 test=test.replace("'../../../contracts/pipeline-test-gate/v1/src/types.ts'",repr((root/'contracts/pipeline-test-gate/v1/src/types.ts').as_uri()))
 check=directory/'mutant.test.mts';check.write_text(test)
 result=subprocess.run(['node','--test',str(check)],capture_output=True,text=True)
 output=result.stdout+result.stderr;(e/'mutant.txt').write_text(output)
 assert result.returncode!=0 and 'artifact:fake' in output,output
 print('Detected child-controlled source substitution in original adapter test; actual fake source reached trusted result.')
