"""Launch both local processes and reliably tear them down on Ctrl-C."""

import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / ".venv" / "bin" / "python"
if not PYTHON.exists():
    sys.exit("Create .venv and install requirements first. See README.md.")
processes = []
try:
    processes.append(
        subprocess.Popen(
            [str(PYTHON), "-m", "backend.app"], cwd=ROOT, start_new_session=True
        )
    )
    processes.append(
        subprocess.Popen(
            ["npm", "run", "dev", "--", "--strictPort"],
            cwd=ROOT / "frontend",
            start_new_session=True,
        )
    )
    while all(p.poll() is None for p in processes):
        time.sleep(0.3)
except KeyboardInterrupt:
    pass
finally:
    # npm and the terminal can deliver repeated SIGINT while children exit.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    for p in processes:
        if p.poll() is None:
            try:
                os.killpg(p.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for p in processes:
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(p.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
