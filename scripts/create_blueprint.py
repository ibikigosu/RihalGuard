#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    ap = argparse.ArgumentParser(description="Copy a RihalGuard starter blueprint")
    ap.add_argument("source", help="Blueprint slug, e.g. meeting-summarizer")
    ap.add_argument("target", help="New folder name")
    ap.add_argument("--out", default="work", help="Output parent directory")
    args = ap.parse_args()
    src = ROOT / "blueprints" / args.source
    if not src.exists():
        raise SystemExit(f"Unknown blueprint: {args.source}")
    dest = ROOT / args.out / args.target
    if dest.exists():
        raise SystemExit(f"Target already exists: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)
    print(f"Created {dest.relative_to(ROOT)} from blueprints/{args.source}")
    print("Next: edit rihalguard.json first, then tools.json and system-prompt.md")

if __name__ == "__main__":
    main()
