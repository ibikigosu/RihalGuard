#!/usr/bin/env python3
"""Deterministic checks for repository validation behavior."""

import copy

from jsonschema import Draft7Validator, FormatChecker

from validate import (
    ROOT,
    check_blueprint_metadata,
    check_contract_and_manifest,
    check_registry,
    load_json,
    validate_document,
)


contract = load_json(ROOT / "blueprints" / "invoice-extractor" / "rihalguard.json")
manifest = load_json(ROOT / "blueprints" / "invoice-extractor" / "tools.json")
blueprint = load_json(ROOT / "blueprints" / "invoice-extractor" / "blueprint.json")
contract_schema = load_json(ROOT / "schema" / "rihalguard-v1.schema.json")
tool_schema = load_json(ROOT / "schema" / "tool-manifest-v1.schema.json")
contract_validator = Draft7Validator(contract_schema, format_checker=FormatChecker())
tool_validator = Draft7Validator(tool_schema, format_checker=FormatChecker())

unsafe_default = copy.deepcopy(contract)
unsafe_default["tool_policy"]["fail_closed_on_unknown_tools"] = False
assert any("True was expected" in error for error in validate_document(unsafe_default, contract_validator))

invalid_trigger = copy.deepcopy(contract)
invalid_trigger["human_review"]["trigger_definitions"][1]["condition"] = "A machine trigger without a measurable condition."
assert validate_document(invalid_trigger, contract_validator)

unowned_tool = copy.deepcopy(manifest)
del unowned_tool["tools"][0]["owner"]
assert validate_document(unowned_tool, tool_validator)

undeclared_tool_data = copy.deepcopy(manifest)
undeclared_tool_data["tools"][0]["data_classes"] = ["medical_records"]
assert any(
    "absent from contract data_policy" in error
    for error in check_contract_and_manifest(contract, undeclared_tool_data)
)

missing_tool_manifest = copy.deepcopy(manifest)
missing_tool_manifest["tools"] = [
    tool for tool in missing_tool_manifest["tools"] if tool["name"] != "get_document"
]
assert any(
    "missing from tools.json" in error
    for error in check_contract_and_manifest(contract, missing_tool_manifest)
)

overlapping_policy = copy.deepcopy(contract)
overlapping_policy["tool_policy"]["blocked_tools"].append("get_document")
assert any(
    "overlap" in error
    for error in check_contract_and_manifest(overlapping_policy, manifest)
)

approved_placeholder = copy.deepcopy(contract)
approved_placeholder["review"]["status"] = "approved"
approved_placeholder["review"]["owner"] = "todo-governance-owner"
assert any(
    "unresolved placeholder" in error
    for error in check_contract_and_manifest(approved_placeholder, manifest)
)

mismatched_blueprint = copy.deepcopy(blueprint)
mismatched_blueprint["slug"] = "wrong-agent"
assert check_blueprint_metadata(contract, mismatched_blueprint)

registry = load_json(ROOT / "registry.json")
contract_by_directory = {
    path.parent: load_json(path)
    for path in (ROOT / "blueprints").glob("*/rihalguard.json")
}
mismatched_registry = copy.deepcopy(registry)
mismatched_registry["blueprints"][0]["risk_level"] = "RG-5"
assert check_registry(mismatched_registry, contract_by_directory)

print("PASS schema, tool-manifest, data-policy, overlap, and placeholder validation checks")
