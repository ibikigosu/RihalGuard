#!/usr/bin/env python3
"""Validate RihalGuard contracts, tool manifests, and blueprint consistency."""

import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator, FormatChecker
    from jsonschema.exceptions import SchemaError
except ImportError:
    sys.exit(
        "Repository validation requires jsonschema. "
        "Run `uv run python scripts/validate.py` from the repository root."
    )


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_BLUEPRINT_FILES = [
    "README.md",
    "blueprint.json",
    "rihalguard.json",
    "system-prompt.md",
    "tools.json",
    "workflow.md",
    "examples.md",
    "setup-guide.md",
    "run.py",
    "evals/run.py",
]
PLACEHOLDER_PREFIXES = ("todo", "replace", "tbd")


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def format_error(error):
    location = ".".join(str(part) for part in error.absolute_path) or "<root>"
    return f"{location}: {error.message}"


def validate_document(document, validator):
    return [
        format_error(error)
        for error in sorted(
            validator.iter_errors(document),
            key=lambda item: tuple(str(part) for part in item.absolute_path),
        )
    ]


def contains_placeholder(value):
    if isinstance(value, str):
        normalized = value.strip().lower()
        return not normalized or any(
            normalized == prefix
            or normalized.startswith(f"{prefix}-")
            or normalized.startswith(f"{prefix}_")
            or normalized.startswith(f"{prefix} ")
            for prefix in PLACEHOLDER_PREFIXES
        )
    if isinstance(value, list):
        return any(contains_placeholder(item) for item in value)
    if isinstance(value, dict):
        return any(contains_placeholder(item) for item in value.values())
    return False


def check_contract_and_manifest(contract, manifest):
    failures = []
    policy = contract["tool_policy"]
    policy_sets = {
        key: set(policy[key])
        for key in ("allowed_tools", "approval_required_tools", "blocked_tools")
    }

    keys = list(policy_sets)
    for index, left_key in enumerate(keys):
        for right_key in keys[index + 1 :]:
            overlap = policy_sets[left_key] & policy_sets[right_key]
            if overlap:
                failures.append(
                    f"tool_policy.{left_key} and tool_policy.{right_key} overlap: "
                    + ", ".join(sorted(overlap))
                )

    tools = manifest["tools"]
    names = [tool["name"] for tool in tools]
    duplicate_names = sorted({name for name in names if names.count(name) > 1})
    if duplicate_names:
        failures.append("tools.json contains duplicate names: " + ", ".join(duplicate_names))

    manifest_by_name = {tool["name"]: tool for tool in tools}
    risk_index = int(contract["risk_level"].split("-")[1])
    contract_data_classes = set(contract["data_policy"]["data_classes"])
    reviewed_tools = policy_sets["allowed_tools"] | policy_sets["approval_required_tools"]
    missing_manifest_tools = reviewed_tools - set(manifest_by_name)
    if missing_manifest_tools:
        failures.append(
            "allowed or approval-required tools missing from tools.json: "
            + ", ".join(sorted(missing_manifest_tools))
        )

    unclassified_manifest_tools = set(manifest_by_name) - reviewed_tools
    if unclassified_manifest_tools:
        failures.append(
            "tools.json entries are not classified as allowed or approval-required: "
            + ", ".join(sorted(unclassified_manifest_tools))
        )

    for tool_name in sorted(reviewed_tools & set(manifest_by_name)):
        tool = manifest_by_name[tool_name]
        if contract["agent_id"] not in tool["allowed_agent_scopes"]:
            failures.append(f"tools.json.{tool_name} does not allow agent scope {contract['agent_id']}")
        undeclared_data_classes = set(tool["data_classes"]) - contract_data_classes
        if undeclared_data_classes:
            failures.append(
                f"tools.json.{tool_name} accesses data classes absent from contract data_policy: "
                + ", ".join(sorted(undeclared_data_classes))
            )
        if tool_name in policy_sets["allowed_tools"]:
            if tool["approval"] != "not_required":
                failures.append(f"allowed tool {tool_name} incorrectly requires approval")
            if tool["external_side_effects"] or tool["authority"] in {
                "write",
                "external_action",
                "permission_change",
                "money_movement",
            }:
                expected_risk = "controlled_execution" if risk_index == 4 else "autonomous_execution"
                if risk_index < 4:
                    failures.append(f"allowed RG-{risk_index} tool {tool_name} declares execution authority")
                elif tool["risk"] != expected_risk:
                    failures.append(f"allowed execution tool {tool_name} must declare risk {expected_risk}")
            elif tool["risk"] != "read_or_transform":
                failures.append(f"allowed non-execution tool {tool_name} must declare risk read_or_transform")
        if tool_name in policy_sets["approval_required_tools"]:
            if tool["approval"] != "required" or tool["risk"] != "approval_required":
                failures.append(f"approval-required tool {tool_name} lacks required approval metadata")

    unsupported_claim_policy = contract["output_policy"].get("unsupported_claim_policy")
    if not unsupported_claim_policy:
        failures.append("output_policy.unsupported_claim_policy is required for repository blueprints")

    if contains_placeholder(contract.get("owner")):
        failures.append("repository blueprint requires a resolved agent owner")
    if contract["review"].get("status") != "reference_blueprint":
        failures.append("repository blueprint review.status must be reference_blueprint")

    required_triggers = set(contract["human_review"]["required_when"])
    trigger_definitions = contract["human_review"].get("trigger_definitions", [])
    trigger_ids = [definition["id"] for definition in trigger_definitions]
    if len(trigger_ids) != len(set(trigger_ids)):
        failures.append("human_review.trigger_definitions contains duplicate ids")
    if required_triggers != set(trigger_ids):
        missing = required_triggers - set(trigger_ids)
        extra = set(trigger_ids) - required_triggers
        if missing:
            failures.append("review triggers missing definitions: " + ", ".join(sorted(missing)))
        if extra:
            failures.append("trigger definitions not listed in required_when: " + ", ".join(sorted(extra)))

    review_status = contract["review"].get("status")
    if review_status in {"approved", "integrated", "periodic_review"}:
        approval_fields = {
            "owner": contract.get("owner"),
            "review.owner": contract["review"].get("owner"),
            "human_review.destination": contract["human_review"].get("destination"),
            "review.next_review_due": contract["review"].get("next_review_due"),
        }
        for field, value in approval_fields.items():
            if contains_placeholder(value):
                failures.append(f"approved contract has unresolved placeholder in {field}")

    return failures


def check_blueprint_metadata(contract, blueprint):
    failures = []
    expected = {
        "slug": contract["agent_id"],
        "title": contract["agent_name"],
        "rihalguard_contract": "./rihalguard.json",
        "tools": "./tools.json",
    }
    for field, expected_value in expected.items():
        if blueprint.get(field) != expected_value:
            failures.append(
                f"blueprint.json.{field} must be {expected_value!r}, got {blueprint.get(field)!r}"
            )
    return failures


def check_registry(registry, contract_by_directory):
    failures = []
    items = registry.get("blueprints", [])
    paths = [ROOT / item.get("path", "") for item in items]
    duplicate_paths = sorted({str(path.relative_to(ROOT)) for path in paths if paths.count(path) > 1})
    if duplicate_paths:
        failures.append("registry.json contains duplicate paths: " + ", ".join(duplicate_paths))

    if set(paths) != set(contract_by_directory):
        failures.append("registry.json does not match blueprints directory")

    for item, path in zip(items, paths):
        contract = contract_by_directory.get(path)
        if not contract:
            continue
        expected = {
            "slug": contract["agent_id"],
            "title": contract["agent_name"],
            "risk_level": contract["risk_level"],
        }
        for field, expected_value in expected.items():
            if item.get(field) != expected_value:
                failures.append(
                    f"registry.json entry {item.get('path', '<missing path>')} has {field} "
                    f"{item.get(field)!r}, expected {expected_value!r}"
                )
    return failures


def main():
    failures = []
    contract_by_directory = {}

    contract_schema_path = ROOT / "schema" / "rihalguard-v1.schema.json"
    tool_schema_path = ROOT / "schema" / "tool-manifest-v1.schema.json"
    contract_schema = load_json(contract_schema_path)
    tool_schema = load_json(tool_schema_path)

    try:
        Draft7Validator.check_schema(contract_schema)
        Draft7Validator.check_schema(tool_schema)
    except SchemaError as error:
        sys.exit(f"Invalid repository schema: {error.message}")

    contract_validator = Draft7Validator(contract_schema, format_checker=FormatChecker())
    tool_validator = Draft7Validator(tool_schema, format_checker=FormatChecker())
    contracts = sorted((ROOT / "blueprints").glob("*/rihalguard.json"))
    if not contracts:
        failures.append("no blueprint contracts found")

    for contract_path in contracts:
        blueprint_dir = contract_path.parent
        relative_contract = contract_path.relative_to(ROOT)
        blueprint_failures = []

        for name in REQUIRED_BLUEPRINT_FILES:
            if not (blueprint_dir / name).exists():
                blueprint_failures.append(f"missing {name}")

        if not blueprint_failures:
            try:
                contract = load_json(contract_path)
                manifest = load_json(blueprint_dir / "tools.json")
                blueprint = load_json(blueprint_dir / "blueprint.json")
            except (json.JSONDecodeError, OSError) as error:
                blueprint_failures.append(str(error))
            else:
                blueprint_failures.extend(validate_document(contract, contract_validator))
                blueprint_failures.extend(
                    f"tools.json {error}" for error in validate_document(manifest, tool_validator)
                )
                if not blueprint_failures:
                    blueprint_failures.extend(check_contract_and_manifest(contract, manifest))
                    blueprint_failures.extend(check_blueprint_metadata(contract, blueprint))
                    contract_by_directory[blueprint_dir] = contract

        if blueprint_failures:
            print(f"FAIL {relative_contract}")
            for failure in blueprint_failures:
                print(f"  - {failure}")
                failures.append(f"{relative_contract}: {failure}")
        else:
            print(f"PASS {relative_contract} schema and manifest consistent")

    try:
        registry = load_json(ROOT / "registry.json")
    except (json.JSONDecodeError, OSError) as error:
        failures.append(f"registry.json: {error}")
    else:
        failures.extend(check_registry(registry, contract_by_directory))

    if failures:
        print("\nValidation failed:")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)

    print(f"\n{len(contracts)}/{len(contracts)} RihalGuard contracts and tool manifests valid")


if __name__ == "__main__":
    main()
