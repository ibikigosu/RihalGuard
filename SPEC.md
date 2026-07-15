# RihalGuard Specification v1.0

RihalGuard is a lightweight governance standard for enterprise AI agents.

It defines the minimum contract an agent should have before a team treats it as more than a throwaway demo: purpose, risk level, maximum impact, tool boundaries, data handling, human-review triggers, audit events, and verification tests.

The contract is written in `rihalguard.json` and reviewed before production integration.
It records intended boundaries and required controls, but does not prove that a runtime enforces them.
Compatible runtimes may consume selected fields and must separately provide enforcement evidence.

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

## Governance alignment

RihalGuard creates design-time evidence for governance review. Its contract fields support common enterprise governance concerns such as impact classification, intended-use boundaries, least-privilege tooling, human oversight, data handling, bounded execution, auditability, and verification.

The detailed mapping lives in [`docs/governance-crosswalk.md`](docs/governance-crosswalk.md). Keep framework mappings there instead of adding compliance-specific fields to the schema. External frameworks change; the core contract should stay focused on the agent's actual behavior.

RihalGuard does not certify compliance with NIST AI RMF, ISO/IEC 42001, OWASP, or any customer-specific control set. It gives reviewers a consistent artifact to inspect before real integrations are added.

## Risk levels

Risk is classified by the most consequential action the agent is technically able to perform, not by its usual happy-path behavior.

| Level | Name | Boundary |
| --- | --- | --- |
| RG-0 | Passive | Reads provided input only. No external tools. |
| RG-1 | Lookup | Retrieves from approved sources. No state changes. |
| RG-2 | Structured Output | Extracts, summarizes, classifies, drafts, or recommends. No side effects. |
| RG-3 | Review-Gated | Prepares actions or payloads, but human approval is required before mutation. |
| RG-4 | Controlled Execution | Executes limited reversible actions inside approved scope. |
| RG-5 | Autonomous Workflow | Can execute consequential actions without complete approval, reversibility, or execution bounds. |

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

An unknown tool is blocked, not merely sent for approval.
A custom or imported tool may become allowed or approval-required only after its identity, authority, data access, side effects, reversibility, approval needs, audit needs, owner, and permitted agent scopes are reviewed.
Canonical tool facts belong to the tool owner; an agent owner decides whether the reviewed tool belongs in the agent's policy.

Prompt rules are not enough. If a tool must never be called, it should be absent, blocked, or approval-gated in code.

Every allowed or approval-required tool in a blueprint must appear in that blueprint's reviewed `tools.json` manifest.
Blocked tool names may be absent from the runtime manifest so that the capability is unavailable as well as denied by policy.

## Workflow pattern

`workflow_pattern` is a short governance shorthand for the expected control shape, such as `extract_validate_review` or `plan_review_execute`.
It helps reviewers compare designs but does not prescribe orchestration, implementation steps, or runtime ownership.

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

The `required_when` list remains the stable v1 trigger identifier list.
Contracts may add `trigger_definitions` to describe whether a trigger is machine-evaluated or judgment-based, the condition that activates it, and the review action.
Machine-evaluated triggers should declare measurable conditions where practical.

## Output integrity

The v1 `never_fabricates` boolean is retained for compatibility but is deprecated because it is too absolute to describe behavior precisely.
New and updated contracts should also declare `unsupported_claim_policy`.
That policy must say what happens when evidence is absent, whether creative drafting is allowed, and whether generated draft content must be labeled.

## Enforcement responsibility

Every RihalGuard field is design-time review evidence.
Some fields, including tool allowlists and runtime limits, can also be consumed by compatible runtimes.
Enforceability is deployment-specific, so RihalGuard does not label a field as universally runtime-enforced.
Each production integration must record which fields it consumes, which controls remain procedural, and what test or evidence demonstrates the mapping.

## Verification

Every blueprint must include deterministic safety checks. At minimum:

1. blocked tools are blocked
2. approval-required tools return `requires_approval` when the contract declares any
3. allowed mock tools can execute
4. unknown tools fail closed
5. ambiguous input is flagged instead of invented away
6. RG-0 through RG-2 manifests contain no execution tools

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

The Rihal adoption process, role ownership, and lifecycle are defined in [`docs/operating-model.md`](docs/operating-model.md).
Schema compatibility and migration rules are defined in [`docs/versioning.md`](docs/versioning.md).
