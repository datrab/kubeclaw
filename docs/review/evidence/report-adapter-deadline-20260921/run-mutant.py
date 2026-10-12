from pathlib import Path
import json
import shutil
import subprocess
import tempfile

root = Path.cwd()
evidence = root / 'docs/review/evidence/report-adapter-deadline-20260921'
with tempfile.TemporaryDirectory(prefix='report-deadline-mutant-') as directory:
    private = Path(directory)
    for name in ['skills', 'contracts', 'tests/verification/contracts']:
        shutil.copytree(root / name, private / name, symlinks=True)
    shutil.copy2(root / 'package.json', private / 'package.json')
    (private / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    shutil.copy2(evidence / 'report-adapter-runtime.ts.before', private / 'skills/buster/engine/test-gates/report-adapter-runtime.ts')
    command = ['/usr/local/bin/node', '--test', 'tests/verification/contracts/check-pipeline-report-adapter-runtime.mts']
    result = subprocess.run(command, cwd=private, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    (evidence / 'mutant.txt').write_text(output)
    detected = result.returncode != 0 and 'REPORT_ADAPTER_CANCELLED' in output and 'REPORT_ADAPTER_TIMEOUT' in output and "operator: 'rejects'" in output
    (evidence / 'mutant.json').write_text(json.dumps({'command': command, 'returnCode': result.returncode, 'detectedOriginalDeadlineDefect': detected}, indent=2)+'\n')
    assert detected, 'Expected original deadline assertion failure, not setup failure'
