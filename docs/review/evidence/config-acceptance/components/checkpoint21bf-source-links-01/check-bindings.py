"""Validate canonical C0 source/member/profile bindings without modifying old logs."""
from pathlib import Path
import runpy

helper = Path.cwd() / "docs/review/evidence/config-acceptance/four-findings-fix-20261013/components/validate-bindings.py"
runpy.run_path(str(helper))["run"]("01")
