"""Real local sockets and processes; no claim of account/relay pairing coverage."""
import importlib.util
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest

spec = importlib.util.spec_from_file_location('supervisor', Path(__file__).parents[1] / 'supervisor.py')
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


class SupervisorTests(unittest.TestCase):
    def tearDown(self):
        supervisor.stop.clear()

    def test_missing_regular_and_stale_paths_are_not_ready(self):
        with tempfile.TemporaryDirectory(prefix='ops-') as directory:
            address = Path(directory) / 'control.sock'
            self.assertFalse(supervisor.control_ready(address))
            address.write_text('not a socket')
            self.assertFalse(supervisor.control_ready(address))
            address.unlink()
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(str(address))
            self.assertFalse(supervisor.control_ready(address))

    def test_live_socket_is_ready_and_listener_loss_revokes_readiness(self):
        with tempfile.TemporaryDirectory(prefix='ops-') as directory:
            address = Path(directory) / 'control.sock'
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(str(address))
                server.listen(5)
                self.assertTrue(supervisor.wait_for_control(address, timeout=1))
                connection, _ = server.accept()
                connection.close()
            self.assertFalse(supervisor.control_ready(address))

    def test_startup_wait_is_bounded_and_shutdown_interrupts_it(self):
        with tempfile.TemporaryDirectory(prefix='ops-') as directory:
            address = Path(directory) / 'missing.sock'
            self.assertFalse(supervisor.wait_for_control(address, timeout=0.05))
            timer = threading.Timer(0.05, supervisor.shutdown)
            timer.start()
            started = time.monotonic()
            try:
                self.assertFalse(supervisor.wait_for_control(address, timeout=20))
                self.assertLess(time.monotonic() - started, 2)
            finally:
                timer.join()

    def test_real_control_command_exit_is_preserved(self):
        self.assertEqual(supervisor.run_control([sys.executable, '-c', 'raise SystemExit(7)'], os.environ.copy()), 7)
        self.assertIsNone(supervisor.child)

    def test_timed_out_control_command_is_killed_and_reaped(self):
        started = time.monotonic()
        self.assertEqual(supervisor.run_control([sys.executable, '-c', 'import time; time.sleep(20)'], os.environ.copy(), timeout=0.05), 124)
        self.assertIsNone(supervisor.child)
        self.assertLess(time.monotonic() - started, 3)

    def test_shutdown_terminates_a_real_inflight_control_command(self):
        timer = threading.Timer(0.1, supervisor.shutdown)
        timer.start()
        try:
            self.assertNotEqual(supervisor.run_control([sys.executable, '-c', 'import time; time.sleep(20)'], os.environ.copy()), 0)
            self.assertIsNone(supervisor.child)
        finally:
            timer.join()


if __name__ == '__main__':
    unittest.main()
