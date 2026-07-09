#!/usr/bin/env python3
"""Deterministic policy and fairness checks for the resume screener."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from run import SYSTEM_PROMPT, TOOL_NAMES, allowed_tools, is_gated, run_tool  # noqa: E402

policy = json.loads((ROOT / "rihalguard.json").read_text(encoding="utf-8"))
checks = []

for tool in policy["tool_policy"].get("blocked_tools", []):
    checks.append((f"blocked tool '{tool}' is blocked", is_gated(tool) == "blocked"))

for tool in policy["tool_policy"].get("approval_required_tools", []):
    checks.append(
        (
            f"approval tool '{tool}' requires approval",
            is_gated(tool) == "requires_approval",
        )
    )

for tool in policy["tool_policy"].get("allowed_tools", []):
    checks.append(
        (
            f"allowed tool '{tool}' executes",
            run_tool(tool).get("status") == "ok",
        )
    )

decision_tools = {
    "rank_candidates",
    "reject_candidate",
    "advance_candidate",
    "hire_candidate",
    "contact_candidate",
}
exposed_tools = {tool["name"] for tool in allowed_tools()}
checks.append(
    (
        "decision and contact tools are absent from the exposed registry",
        decision_tools.isdisjoint(TOOL_NAMES),
    )
)
checks.append(
    (
        "the model receives only contract-allowed tools",
        exposed_tools == set(policy["tool_policy"]["allowed_tools"]),
    )
)

for tool in sorted(decision_tools):
    checks.append(
        (
            f"decision probe '{tool}' returns blocked",
            run_tool(tool).get("status") == "blocked",
        )
    )

checks.append(
    (
        "unknown tools fail closed",
        is_gated("unreviewed_resume_export") == "blocked",
    )
)

prompt = SYSTEM_PROMPT.lower()
checks.append(
    (
        "prompt excludes protected characteristics",
        "never use or infer age" in prompt
        and "protected_characteristics_excluded" in prompt,
    )
)
checks.append(
    (
        "prompt excludes proxy signals",
        "do not use names" in prompt and "proxy_signals_excluded" in prompt,
    )
)
checks.append(
    (
        "prompt requires evidence and uncertainty",
        "smallest useful resume excerpt" in prompt
        and "use unclear when evidence is missing" in prompt,
    )
)
checks.append(
    (
        "prompt keeps decisions with a recruiter",
        "you do not make hiring decisions" in prompt
        and "human_review_required to true" in prompt,
    )
)

assessment_labels = set(
    policy["output_policy"].get("allowed_assessment_labels", [])
)
hiring_dispositions = {"advance", "reject", "decline", "hire"}
checks.append(
    (
        "output labels are assessments rather than hiring dispositions",
        bool(assessment_labels)
        and assessment_labels.isdisjoint(hiring_dispositions),
    )
)
checks.append(
    (
        "every assessment requires human review",
        policy["output_policy"].get("human_review_required") is True
        and "every_assessment"
        in policy["human_review"].get("required_when", []),
    )
)

blueprint_files = [
    path
    for path in ROOT.rglob("*")
    if path.is_file()
    and "__pycache__" not in path.parts
    and path.suffix in {".json", ".md", ".py", ".toml"}
]
blueprint_text = "\n".join(
    path.read_text(encoding="utf-8") for path in blueprint_files
).lower()
checks.append(
    (
        "blueprint contains no reference-project branding",
        ("agent" + "az") not in blueprint_text,
    )
)
checks.append(
    (
        "blueprint contains no em dash characters",
        "\u2014" not in blueprint_text,
    )
)

passed = sum(1 for _, ok in checks if ok)
for name, ok in checks:
    print(("PASS  " if ok else "FAIL  ") + name)
print(f"{passed}/{len(checks)} RihalGuard checks passed")
sys.exit(0 if passed == len(checks) else 1)
