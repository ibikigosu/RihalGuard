# RihalGuard Specification v1.0

RihalGuard is a lightweight governance standard for enterprise AI agents.

It defines the minimum contract an agent should have before a team treats it as more than a throwaway demo: purpose, risk level, maximum impact, tool boundaries, data handling, human-review triggers, audit events, and verification tests.

The contract is written in `rihalguard.json`. The runtime is expected to enforce it.

## Design goals

RihalGuard is designed to be:

- **Practical**: small enough to use on real projects without becoming paperwork.
- **Reviewable**: one short contract should explain the agent's authority and risk.
- **Portable**: usable with LangGraph, FastAPI services, workflow engines, notebooks, or internal platforms.
- **Enforceable**: tool policy should be loadable by code, not trapped in prose.
- **General**: applicable to enterprise automation, knowledge work, operations, finance workflows, engineering support, and internal productivity.

## Non-goals

RihalGuard is not:

- a model evaluation benchmark
- a prompt library
- a replacement for security review
- a replacement for runtime access control
- a claim that an agent is production-ready

It is the starting contract. Production still requires real enforcement, monitoring, access control, incident handling, and business-owner approval.

## Risk levels

Risk is classified by the most consequential action the agent is technically able to perform, not by its usual happy-path behavior.

| Level | Name | Boundary |
| --- | --- | --- |
| RG-0 | Passive | Reads provided input only. No external tools. |
| RG-1 | Lookup | Retrieves from approved sources. No state changes. |
| RG-2 | Structured Output | Extracts, summarizes, classifies, drafts, or recommends. No side effects. |
| RG-3 | Review-Gated | Prepares actions or payloads, but human approval is required before mutation. |
| RG-4 | Controlled Execution | Executes limited reversible actions inside approved scope. |
| RG-5 | Autonomous Workflow | Completes end-to-end workflows under strict limits, audit, and rollback controls. |

If an agent has one RG-4 tool, the agent should be reviewed as RG-4 even if most of its work is RG-2.

## Required contract sections

Every governed agent must include `rihalguard.json` with these sections:

| Section | Purpose |
| --- | --- |
| identity | `agent_id`, `agent_name`, version, owner, review date |
| risk | `risk_level`, workflow pattern, maximum impact |
| scope | allowed and forbidden behavior |
| tool policy | allowed, approval-required, and blocked tools |
| data policy | data classes, storage, retention, logging, memory rules |
| output policy | output format, evidence requirements, fabrication rules |
| runtime limits | reasoning steps, timeout, cost or budget limits |
| human review | triggers and review destination |
| audit | required events and append-only logging expectation |
| verification | tests that prove the boundaries hold |

## Tool policy

Tools must be classified before implementation:

- `allowed_tools`: can run without additional approval inside the agent's scope
- `approval_required_tools`: can prepare or request an action but must not execute without human approval
- `blocked_tools`: must not execute in this agent

Unknown tools should fail closed.

Prompt rules are not enough. If a tool must never be called, it should be absent, blocked, or approval-gated in code.

## Data policy

The contract must state what kind of data the agent may handle and how that data is treated.

Default posture:

- no persistent memory for sensitive source content
- task-scoped processing unless explicitly approved
- redacted logs for private or client-provided data
- client and project isolation where relevant
- audit metadata without unnecessary raw content retention

## Human review

Human review should be triggered by conditions, not vibes.

Good triggers:

- low confidence
- ambiguous ownership
- missing required fields
- conflicting evidence
- unsupported format
- request for a write/external action
- sensitive content

## Verification

Every blueprint must include deterministic safety checks. At minimum:

1. blocked tools are blocked
2. approval-required tools return `requires_approval`
3. allowed mock tools can execute
4. unknown risky tools fail closed
5. ambiguous input is flagged instead of invented away

Behavioral evals should be added as the blueprint matures.

## Review rule

Any change to these fields is a governance change:

- `risk_level`
- `maximum_impact`
- `scope.forbidden`
- `tool_policy`
- `data_policy`
- `human_review`
- `runtime_limits`

Treat those changes differently from normal prompt or documentation edits.
