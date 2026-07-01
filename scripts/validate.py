#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = ["README.md", "blueprint.json", "rihalguard.json", "system-prompt.md", "tools.json", "workflow.md", "examples.md", "setup-guide.md", "run.py", "evals/run.py"]
RISK_LEVELS = {"RG-0", "RG-1", "RG-2", "RG-3", "RG-4", "RG-5"}

def check_contract(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    required = ["standard_version", "agent_id", "agent_name", "version", "risk_level", "workflow_pattern", "purpose", "maximum_impact", "scope", "tool_policy", "data_policy", "output_policy", "runtime_limits", "human_review", "audit", "verification", "review"]
    missing = [k for k in required if k not in data]
    if missing:
        return False, "missing keys: " + ", ".join(missing)
    if data["risk_level"] not in RISK_LEVELS:
        return False, "invalid risk_level"
    tools = data["tool_policy"]
    for key in ["allowed_tools", "approval_required_tools", "blocked_tools"]:
        if key not in tools or not isinstance(tools[key], list):
            return False, f"tool_policy.{key} must be a list"
    if not data["verification"].get("tests"):
        return False, "verification.tests must not be empty"
    return True, "ok"

def main():
    failures = []
    contracts = sorted((ROOT / "blueprints").glob("*/rihalguard.json"))
    if not contracts:
        failures.append("no blueprint contracts found")
    for contract in contracts:
        bp_dir = contract.parent
        for name in REQUIRED:
            if not (bp_dir / name).exists():
                failures.append(f"{bp_dir.relative_to(ROOT)} missing {name}")
        ok, msg = check_contract(contract)
        print(("PASS" if ok else "FAIL"), contract.relative_to(ROOT), msg)
        if not ok:
            failures.append(f"{contract}: {msg}")
    registry = json.loads((ROOT / "registry.json").read_text(encoding="utf-8"))
    registry_paths = {ROOT / item["path"] for item in registry.get("blueprints", [])}
    blueprint_dirs = {p.parent for p in contracts}
    if registry_paths != blueprint_dirs:
        failures.append("registry.json does not match blueprints directory")
    if failures:
        print("\nValidation failed:")
        for f in failures:
            print("-", f)
        sys.exit(1)
    print(f"\n{len(contracts)}/{len(contracts)} RihalGuard contracts valid")

if __name__ == "__main__":
    main()
