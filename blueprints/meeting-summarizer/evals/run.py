#!/usr/bin/env python3
"""Deterministic RihalGuard safety checks. No API key required."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from run import is_gated, run_tool  # noqa: E402

policy = json.loads((ROOT / "rihalguard.json").read_text(encoding="utf-8"))
checks = []
for tool in policy["tool_policy"].get("blocked_tools", []):
    checks.append((f"blocked tool '{tool}' is blocked", is_gated(tool) == "blocked"))
for tool in policy["tool_policy"].get("approval_required_tools", []):
    checks.append((f"approval tool '{tool}' requires approval", is_gated(tool) == "requires_approval"))
for tool in policy["tool_policy"].get("allowed_tools", []):
    checks.append((f"allowed tool '{tool}' executes", run_tool(tool).get("status") == "ok"))
checks.append(("unknown risky tool fails closed", is_gated("delete_everything") == "blocked"))
passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + name)
print(f"{passed}/{len(checks)} RihalGuard checks passed")
sys.exit(0 if passed == len(checks) else 1)
