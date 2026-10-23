import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).parent))
from runtime_policy import load_supervisor_policy
import supervisor

class SelectedSupervisorPolicy(unittest.TestCase):
    def test_real_startup_poll_and_subprocess_timeout(self):
        supervisor.stop.clear()
        started=time.monotonic()
        self.assertFalse(supervisor.wait_for_control('/tmp/missing-ops-policy-test-socket',timeout=.05,poll_seconds=3,probe_timeout=2))
        self.assertLess(time.monotonic()-started,.4)
        self.assertEqual(supervisor.run_control([sys.executable,'-c','import time;time.sleep(.08)'],os.environ.copy(),timeout=.03,quiet=True),124)
        self.assertEqual(supervisor.run_control([sys.executable,'-c','import time;time.sleep(.08)'],os.environ.copy(),timeout=1,quiet=True),0)
        self.assertIsNone(supervisor.child)

    def test_shared_capture_strict_and_original_values_remain_after_delete(self):
        fields={'controlSocketProbeTimeoutSeconds':.5,'controlStartupTimeoutSeconds':20,'controlStartupPollSeconds':.2,'loginStatusTimeoutSeconds':15,'loginRetryWaitSeconds':5,'controlHealthPollSeconds':2,'controlTerminationTimeoutSeconds':10,'restartWaitSeconds':10}
        policy={'schemaVersion':'ops-mcp-policy.v1','server':{'port':8080},'supervisor':fields,'kubernetes':{},'hubble':{},'presentation':{}}
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'policy.json';file.write_text(json.dumps(policy));url,a=load_supervisor_policy(file)
            policy['server']['port']=9080;policy['supervisor']['loginStatusTimeoutSeconds']=2;file.write_text(json.dumps(policy));other,b=load_supervisor_policy(file)
            file.unlink();self.assertEqual(url,'http://127.0.0.1:8080/mcp');self.assertEqual(other,'http://127.0.0.1:9080/mcp');self.assertEqual(a['loginStatusTimeoutSeconds'],15);self.assertEqual(b['loginStatusTimeoutSeconds'],2)
            with self.assertRaises(TypeError): a['loginStatusTimeoutSeconds']=100
            for key in fields:
                invalid=json.loads(json.dumps(policy));del invalid['supervisor'][key];file.write_text(json.dumps(invalid))
                with self.assertRaises(ValueError):load_supervisor_policy(file)
            invalid=json.loads(json.dumps(policy));invalid['supervisor']['controlStartupPollSeconds']=False;file.write_text(json.dumps(invalid))
            with self.assertRaises(ValueError):load_supervisor_policy(file)

if __name__=='__main__':unittest.main()
