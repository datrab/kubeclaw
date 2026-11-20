"""Exercise the actual local Semgrep scanner with its patched dependency offline."""
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import tempfile

# Import the optional integration to catch SDK API incompatibility without
# starting a service or fetching Semgrep's external OAuth metadata.
from semgrep.commands.mcp import setup_mcp_server

assert callable(setup_mcp_server)


with tempfile.TemporaryDirectory(prefix='semgrep-security-proof-') as temporary:
    os.environ.update(SEMGREP_ENABLE_VERSION_CHECK='0', SEMGREP_SEND_METRICS='off',
                      SEMGREP_SETTINGS_FILE=temporary + '/settings.yml',
                      SEMGREP_LOG_FILE=temporary + '/semgrep.log')
    patch_file = Path('/opt/kubeclaw-python-locks/security-patch.json')
    if not patch_file.is_file():
        patch_file = Path(__file__).resolve().parents[3] / 'docker/python-tools/security-patch.json'
    patch = json.loads(patch_file.read_text())
    dependency, version = patch['replacementRequirement'].split('==')
    assert importlib.metadata.version(dependency) == version
    assert importlib.metadata.version('semgrep').endswith('+' + patch['versionSuffix'])
    requirements = importlib.metadata.requires('semgrep')
    assert patch['replacementRequirement'] in requirements
    rule = Path(temporary, 'rule.yml')
    rule.write_text('rules:\n- id: unsafe-eval\n  pattern: eval(...)\n  languages: [python]\n  severity: ERROR\n  message: unsafe eval\n')
    target = Path(temporary, 'unsafe.py')
    target.write_text('eval("1 + 1")\n')
    result = subprocess.run(['semgrep', 'scan', '--config', str(rule), '--json', '--metrics', 'off',
                             '--disable-version-check', '--no-git-ignore', '--error', str(target)],
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 1, result.stderr
    report = json.loads(result.stdout)
    assert not report['errors'], report['errors']
    assert any(item['check_id'].endswith('unsafe-eval') for item in report['results'])
    print('Semgrep detected the deliberately unsafe fixture')
    print('Patched Semgrep dependency metadata and SDK imports passed')
