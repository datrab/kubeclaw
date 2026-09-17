#!/usr/bin/env python3
# Installer-Step: repair.k3s-reservation-arguments; category: repair-only. See scripts/install/README.md.
"""Remove exactly the two observed legacy kubelet reservation arguments."""
import pathlib
import json
import re
import shlex
import subprocess
import tempfile

VALUES = ["system-reserved=cpu=500m,memory=1024Mi", "kube-reserved=cpu=500m,memory=512Mi"]


def repair(text):
    lines = text.splitlines(keepends=True)
    starts = [i for i, line in enumerate(lines) if line.startswith("ExecStart=")]
    if len(starts) != 1:
        raise ValueError("Expected exactly one ExecStart in the primary unit")
    start = end = starts[0]
    while lines[end].rstrip().endswith("\\"):
        end += 1
    original = "".join(lines[start:end + 1])
    changed = original
    for value in VALUES:
        v = re.escape(value)
        quoted = rf'(?:"{v}"|\'{v}\'|{v})'
        flag = r'(?:"--kubelet-arg"|\'--kubelet-arg\'|--kubelet-arg)'
        expression = rf'''(?<!\S)(?:"--kubelet-arg={v}"|'--kubelet-arg={v}'|--kubelet-arg={quoted}|{flag}(?:[ \t\r\n]|\\\r?\n)+{quoted})(?=\s|\\|$)'''
        changed, count = re.subn(expression, "", changed)
        if count != 1:
            raise ValueError("Expected exactly one complete legacy kubelet argument for " + value.split("=")[0])
    def tokens(block):
        return shlex.split(block.split("=", 1)[1].replace("\\\n", " "))
    before = tokens(original)
    expected = []
    index = 0
    while index < len(before):
        if before[index] == "--kubelet-arg" and index + 1 < len(before) and before[index + 1] in VALUES:
            index += 2
        elif before[index] in ["--kubelet-arg=" + value for value in VALUES]:
            index += 1
        else:
            expected.append(before[index])
            index += 1
    if tokens(changed) != expected:
        raise ValueError("Repair would change unrelated startup arguments")
    return "".join(lines[:start]) + changed + "".join(lines[end + 1:])


if __name__ == "__main__":
    dropin = json.loads(pathlib.Path("/var/lib/rancher/k3s/agent/etc/kubelet.conf.d/90-kubeclaw-native.conf").read_text())
    for key in ["systemReserved", "kubeReserved"]:
        if not all(name in dropin.get(key, {}) for name in ["cpu", "memory", "pid"]):
            raise SystemExit("Native reservation drop-in incomplete; refusing to remove legacy arguments")
    unit = pathlib.Path("/etc/systemd/system/k3s.service")
    original = unit.read_text()
    corrected = repair(original)
    backup = pathlib.Path(tempfile.mkdtemp(prefix="kubeclaw-k3s-arguments-", dir="/root"))
    (backup / "original.service").write_text(original)
    staged = backup / "k3s.service"
    staged.write_text(corrected)
    subprocess.run(["systemd-analyze", "verify", str(staged)], check=True)
    if unit.read_text() != original:
        raise SystemExit("Unit changed during preparation; refusing overwrite")
    subprocess.run(["install", "-o", "root", "-g", "root", "-m", "0644", str(staged), str(unit)], check=True)
    print("Unit repaired. Original unit saved at:", backup / "original.service")
    print("K3s has NOT been restarted yet.")
