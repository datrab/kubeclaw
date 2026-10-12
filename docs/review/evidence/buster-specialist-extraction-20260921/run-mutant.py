"""Private-copy negative control; never edits production modules or original tests."""
from pathlib import Path
import subprocess
import tempfile
root = Path.cwd()
evidence = root / 'docs/review/evidence/buster-specialist-extraction-20260921'
modules = root / 'skills/buster/engine/test-gates'
with tempfile.TemporaryDirectory(prefix='mutant-', dir=evidence) as temporary:
    directory = Path(temporary)
    source = (modules / 'specialist-report-finalization.ts').read_text()
    needle = '    && canonical(candidate.registration.package) === canonical(reference.package));'
    assert source.count(needle) == 1
    source = source.replace(needle, '    );')
    for name in ['canonical-value.ts', 'provider-result-validation.ts', 'report-finalizer.ts', 'report-adapter-runtime.ts']:
        source = source.replace(f"'./{name}'", repr((modules / name).as_uri()))
    mutant = directory / 'mutant.ts'
    mutant.write_text(source)
    test = (modules / 'tests/specialist-boundary.test.ts').read_text()
    test = test.replace("'../provider-result-validation.ts'", repr((modules / 'provider-result-validation.ts').as_uri()))
    test = test.replace("'../specialist-report-finalization.ts'", repr(mutant.as_uri()))
    check = directory / 'mutant.test.ts'
    check.write_text(test)
    result = subprocess.run(['node', '--test', str(check)], capture_output=True, text=True)
    output = result.stdout + result.stderr
    (evidence / 'mutant.txt').write_text(output)
    assert result.returncode != 0 and 'ADAPTER_MUST_NOT_RUN' in output, output
    print('Detected removed adapter-package binding: mismatched package executed the fake adapter.')
