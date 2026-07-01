#!/usr/bin/env python3
"""Minimal RihalGuard runner with mock tools and policy-based gating."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
POLICY = json.loads((ROOT / "rihalguard.json").read_text(encoding="utf-8"))
TOOLS = json.loads((ROOT / "tools.json").read_text(encoding="utf-8"))["tools"]
TOOL_NAMES = {t["name"] for t in TOOLS}
RISKY_VERB = re.compile(r"(delete|approve|pay|send|publish|permission|grant|revoke|deploy|transfer|post|write|override|external)", re.I)

def is_gated(tool_name):
    policy = POLICY["tool_policy"]
    if tool_name in policy.get("blocked_tools", []):
        return "blocked"
    if tool_name in policy.get("approval_required_tools", []):
        return "requires_approval"
    if tool_name not in policy.get("allowed_tools", []):
        if policy.get("fail_closed_on_unknown_tools", True) or RISKY_VERB.search(tool_name or ""):
            return "blocked"
    return "allowed"

def run_tool(tool_name, args=None):
    args = args or {}
    gate = is_gated(tool_name)
    if gate == "blocked":
        return {"status": "blocked", "tool": tool_name, "reason": "RihalGuard policy blocks this tool."}
    if gate == "requires_approval":
        return {"status": "requires_approval", "tool": tool_name, "reason": "Human approval required before execution."}
    return {"status": "ok", "tool": tool_name, "result": "mock result; replace with a real integration."}

def main():
    print(POLICY["agent_name"])
    print("Risk level:", POLICY["risk_level"])
    print("Purpose:", POLICY["purpose"])
    for tool in sorted(TOOL_NAMES):
        print(json.dumps(run_tool(tool), ensure_ascii=False))

if __name__ == "__main__":
    main()
