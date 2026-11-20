import base64
import csv
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('patch', Path(__file__).resolve().parents[3] / 'docker/python-tools/install-patched.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class SemgrepSecurityPatchTest(unittest.TestCase):
    def source(self, directory, requirement='mcp==1.29.0'):
        wheel = Path(directory, 'semgrep-1.186.0-cp311-cp311-manylinux_2_28_x86_64.whl')
        with zipfile.ZipFile(wheel, 'w') as archive:
            archive.writestr('semgrep-1.186.0.dist-info/METADATA',
                             'Name: semgrep\nVersion: 1.186.0\nRequires-Dist: ' + requirement + '\n\n')
            archive.writestr('semgrep-1.186.0.dist-info/RECORD', '')
            binary = zipfile.ZipInfo('semgrep/bin/semgrep-core')
            binary.external_attr = 0o100755 << 16
            archive.writestr(binary, b'unchanged upstream analyzer')
        return wheel

    def test_deterministic_rebuild_retains_analyzer_permissions_and_valid_records(self):
        with tempfile.TemporaryDirectory() as temporary:
            outputs = []
            for index in range(2):
                directory = Path(temporary, str(index))
                directory.mkdir()
                outputs.append(patch.patch_semgrep(self.source(directory), 'mcp==1.30.0'))
            self.assertEqual(outputs[0].read_bytes(), outputs[1].read_bytes())
            with zipfile.ZipFile(outputs[0]) as archive:
                self.assertEqual(archive.read('semgrep/bin/semgrep-core'), b'unchanged upstream analyzer')
                self.assertEqual((archive.getinfo('semgrep/bin/semgrep-core').external_attr >> 16) & 0o777, 0o755)
                metadata = archive.read('semgrep-1.186.0+kubeclaw.1.dist-info/METADATA').decode()
                self.assertIn('Version: 1.186.0+kubeclaw.1', metadata)
                self.assertIn('Requires-Dist: mcp==1.30.0', metadata)
                self.assertNotIn('mcp==1.29.0', metadata)
                record = archive.read('semgrep-1.186.0+kubeclaw.1.dist-info/RECORD').decode()
                for name, checksum, length in csv.reader(io.StringIO(record)):
                    if checksum:
                        content = archive.read(name)
                        self.assertEqual(int(length), len(content))
                        self.assertEqual(checksum, 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b'=').decode())

    def test_upstream_dependency_changes_require_review(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'metadata changed'):
                patch.patch_semgrep(self.source(directory, 'mcp==1.30.0'), 'mcp==1.30.0')


if __name__ == '__main__':
    unittest.main()
