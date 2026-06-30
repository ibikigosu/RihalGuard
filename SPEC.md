# RihalGuard Specification v1.0

RihalGuard is a design-time governance standard for enterprise AI agents. It documents an agent's intended role, maximum impact, boundaries, tool permissions, data handling, review triggers, audit requirements, and verification tests before the agent is deployed.

RihalGuard does not replace runtime controls. The contract states what should be true; the runtime must enforce it.

## Risk levels

Risk is classified by the most consequential action the agent is technically able to perform, not by its usual behavior.

| Level | Name | Boundary |
| --- | --- | --- |
| RG-0 | Passive | Reads provided input only. No external tools. |
| RG-1 | Lookup | Retrieves from approved sources. No state changes. |
| RG-2 | Structured Output | Extracts, summarizes, classifies, drafts, or recommends. No side effects. |
| RG-3 | Review-Gated | Prepares actions or payloads, but human approval is required before mutation. |
| RG-4 | Controlled Execution | Executes limited reversible actions inside approved scope. |
| RG-5 | Autonomous Workflow | Completes end-to-end workflows under strict limits, audit, and rollback controls. |

## Required contract sections

Every governed agent must include `rihalguard.json` with:

- identity: `agent_id`, `agent_name`, `version`, owner, review date
- risk: `risk_level`, `workflow_pattern`, `maximum_impact`
- boundaries: `scope`, `tool_policy`, `data_policy`, `output_policy`
- controls: `runtime_limits`, `human_review`, `audit`
- proof: `verification.tests`

## Tool policy rule

If an agent must not perform an action, the tool should be absent or blocked. Prompt instructions alone are not enough.

## Review rule

Any change to `risk_level`, `maximum_impact`, `tool_policy`, `data_policy`, or `human_review` should be reviewed as a governance change.
