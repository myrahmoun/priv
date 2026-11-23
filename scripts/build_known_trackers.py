"""Build src/vendor/privacybadger/known_trackers.json from Privacy Badger's seed data.

Keeps domains Privacy Badger classifies as trackers (block / cookieblock).
Usage: python3 scripts/build_known_trackers.py [path/to/seed.json]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
seed_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "badger/src/data/seed.json"

action_map = json.loads(seed_path.read_text())["action_map"]
domains = sorted(d for d, v in action_map.items()
                 if v.get("heuristicAction") in ("block", "cookieblock"))

out = ROOT / "src/vendor/privacybadger/known_trackers.json"
out.write_text(json.dumps(domains, indent=0) + "\n")
print(f"Wrote {len(domains)} domains to {out}")
