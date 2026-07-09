#!/usr/bin/env python3
"""RihalGuard resume screener with mock tools and policy gates."""

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
POLICY = json.loads((ROOT / "rihalguard.json").read_text(encoding="utf-8"))
TOOLS = json.loads((ROOT / "tools.json").read_text(encoding="utf-8"))["tools"]
TOOL_NAMES = {tool["name"] for tool in TOOLS}
SYSTEM_PROMPT = (ROOT / "system-prompt.md").read_text(encoding="utf-8")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
ANTHROPIC_MODEL = os.environ.get(
    "ANTHROPIC_MODEL",
    "claude-sonnet-4-20250514",
)
MAX_TURNS = int(
    os.environ.get(
        "RIHALGUARD_MAX_TURNS",
        POLICY.get("runtime_limits", {}).get("max_reasoning_steps", 8),
    )
)
DEFAULT_INPUT = os.environ.get(
    "RIHALGUARD_INPUT",
    "Role: Backend Engineer. Required: three years of production backend work, "
    "a modern backend language, and relational database experience. "
    "Resume: built Go services from 2021 through 2026 and designed PostgreSQL "
    "schemas for a payments API.",
)
RISKY_VERB = re.compile(
    r"(delete|approve|hire|reject|advance|decline|contact|email|message|rank|"
    r"score_candidate|infer_protected|send|publish|permission|grant|revoke|"
    r"deploy|transfer|write|override|external)",
    re.I,
)


def is_gated(tool_name):
    """Return the RihalGuard gate result for a tool name."""
    policy = POLICY["tool_policy"]
    if tool_name in policy.get("blocked_tools", []):
        return "blocked"
    if tool_name in policy.get("approval_required_tools", []):
        return "requires_approval"
    if tool_name not in policy.get("allowed_tools", []):
        if policy.get("fail_closed_on_unknown_tools", True) or RISKY_VERB.search(
            tool_name or ""
        ):
            return "blocked"
    return "allowed"


def run_tool(tool_name, args=None):
    """Run a mock tool after enforcing the RihalGuard policy."""
    args = args or {}
    gate = is_gated(tool_name)
    if gate == "blocked":
        return {
            "status": "blocked",
            "tool": tool_name,
            "reason": "RihalGuard policy blocks this tool.",
        }
    if gate == "requires_approval":
        return {
            "status": "requires_approval",
            "tool": tool_name,
            "reason": "Human approval is required before execution.",
        }
    return {
        "status": "ok",
        "tool": tool_name,
        "args": args,
        "result": "mock result; replace with an approved integration.",
    }


def allowed_tools():
    """Expose only contract-approved tools to the model."""
    allowed = set(POLICY["tool_policy"].get("allowed_tools", []))
    return [
        tool
        for tool in TOOLS
        if tool["name"] in allowed and is_gated(tool["name"]) == "allowed"
    ]


def anthropic_tools():
    """Convert allowed tools to Anthropic tool definitions."""
    return [
        {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "input_schema": tool.get("input_schema")
            or {
                "type": "object",
                "properties": {},
                "additionalProperties": True,
            },
        }
        for tool in allowed_tools()
    ]


def openai_tools():
    """Convert allowed tools to OpenAI function definitions."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema")
                or {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": True,
                },
            },
        }
        for tool in allowed_tools()
    ]


def print_policy_demo():
    """Show allowed and approval-gated registry behavior without an API key."""
    for tool_name in sorted(TOOL_NAMES):
        print(json.dumps(run_tool(tool_name), ensure_ascii=False))
    for tool_name in POLICY["tool_policy"].get("blocked_tools", []):
        print(json.dumps(run_tool(tool_name), ensure_ascii=False))
    print("Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run the LLM tool-use loop.")


def run_anthropic(user_input):
    """Run the optional Anthropic tool-use loop."""
    try:
        from anthropic import Anthropic
    except ImportError:
        sys.exit("Install dependencies first, for example: uv sync")

    client = Anthropic()
    messages = [{"role": "user", "content": user_input}]
    tools = anthropic_tools()
    for _ in range(MAX_TURNS):
        kwargs = {
            "model": ANTHROPIC_MODEL,
            "max_tokens": 1600,
            "system": SYSTEM_PROMPT,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        message = client.messages.create(**kwargs)
        for block in message.content:
            if getattr(block, "type", "") == "text" and block.text.strip():
                print("MODEL:\n" + block.text.strip() + "\n")
        tool_uses = [
            block
            for block in message.content
            if getattr(block, "type", "") == "tool_use"
        ]
        if not tool_uses:
            return
        messages.append({"role": "assistant", "content": message.content})
        results = []
        for tool_use in tool_uses:
            result = run_tool(tool_use.name, tool_use.input or {})
            print("TOOL:", json.dumps(result, ensure_ascii=False))
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result),
                }
            )
        messages.append({"role": "user", "content": results})
    print("Reached RihalGuard max turns.")


def run_openai(user_input):
    """Run the optional OpenAI tool-use loop."""
    try:
        from openai import OpenAI
    except ImportError:
        sys.exit("Install dependencies first, for example: uv sync")

    client = OpenAI()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_input},
    ]
    tools = openai_tools()
    for _ in range(MAX_TURNS):
        kwargs = {
            "model": OPENAI_MODEL,
            "max_tokens": 1600,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        response = client.chat.completions.create(**kwargs)
        message = response.choices[0].message
        if message.content and message.content.strip():
            print("MODEL:\n" + message.content.strip() + "\n")
        if not getattr(message, "tool_calls", None):
            return
        messages.append(
            {
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        },
                    }
                    for tool_call in message.tool_calls
                ],
            }
        )
        for tool_call in message.tool_calls:
            try:
                args = json.loads(tool_call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = run_tool(tool_call.function.name, args)
            print("TOOL:", json.dumps(result, ensure_ascii=False))
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result),
                }
            )
    print("Reached RihalGuard max turns.")


def read_user_input(cli_input):
    """Read input from arguments, stdin, or the built-in sample."""
    if cli_input:
        return " ".join(cli_input)
    if not sys.stdin.isatty():
        stdin = sys.stdin.read().strip()
        if stdin:
            return stdin
    return DEFAULT_INPUT


def main():
    """Run the local demo or an optional provider-backed loop."""
    parser = argparse.ArgumentParser(
        description="Run the RihalGuard resume screener with policy-gated mock tools."
    )
    parser.add_argument(
        "input",
        nargs="*",
        help="Input text for the agent. If omitted, stdin or a built-in sample is used.",
    )
    args = parser.parse_args()
    user_input = read_user_input(args.input)
    print(POLICY["agent_name"])
    print("Risk level:", POLICY["risk_level"])
    print("Purpose:", POLICY["purpose"])
    print("Input:", user_input)
    print("-" * 70)
    if os.environ.get("ANTHROPIC_API_KEY"):
        run_anthropic(user_input)
    elif os.environ.get("OPENAI_API_KEY"):
        run_openai(user_input)
    else:
        print_policy_demo()


if __name__ == "__main__":
    main()
