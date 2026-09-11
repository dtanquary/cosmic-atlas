"""Wait for the resumable download and prepare both production and development data."""
import json
from pathlib import Path
import subprocess
import sys
import time

checkpoint=Path('.cache/zall-pix-iron.download.json')
while not checkpoint.exists() or not json.loads(checkpoint.read_text()).get('complete'):
    time.sleep(10)
subprocess.run([sys.executable,'scripts/prepare_data.py','--emit-development','--activate'],check=True)
