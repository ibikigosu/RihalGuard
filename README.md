# RihalGuard

> A starter standard for building governed enterprise AI agents.

It is not another prompt collection. It is a practical way to start every agent with the same minimum operating discipline: a clear purpose, a risk level, tool boundaries, human-review triggers, audit events, and deterministic safety checks.

The goal is simple: make agent development faster without letting every team invent its own rules.

> [!NOTE]
> RihalGuard is a design-time contract and starter blueprint system.
> Production agents still need real runtime enforcement, identity, access control, monitoring, and audit evidence.

## Why this exists

Enterprise agents fail in boring ways before they fail in dramatic ways.

They get vague scopes. They expose tools too early. They bury human review in the prompt. They produce confident output without evidence. They start as demos, then quietly grow into workflows nobody has properly reviewed.

RihalGuard fixes that at the starting line.

Every blueprint in this repo answers five questions before implementation begins:

1. What is this agent allowed to do?
2. What must it never do?
3. Which tools are read-only, approval-gated, or blocked?
4. When does a human need to review the result?
5. What test proves the boundary actually holds?

## What RihalGuard provides

- **A governance contract**: `rihalguard.json` defines the agent's risk, scope, tool policy, data policy, review triggers, audit rules, and verification tests.
- **A blueprint format**: each agent has a predictable structure that is easy to review and adapt.
- **Starter agents**: runnable mock implementations for common enterprise workflows.
- **Validation tooling**: scripts that check contracts and prove basic tool-boundary behavior.
- **Policy-gated runners**: examples showing how a contract can gate tool execution before anything dangerous runs, with optional OpenAI or Anthropic tool-use loops.
- **Local scanner**: a browser-based risk assessment tool with contract generation, control findings, safety radar, and copyable reports.
- **Governance crosswalk**: design-time evidence mapped to common AI governance concerns in NIST AI RMF, ISO/IEC 42001, and OWASP agentic risk categories.

## Repository map

```text
RihalGuard/
  README.md                         # project overview
  SPEC.md                           # RihalGuard v1 standard
  registry.json                     # blueprint index
  schema/rihalguard-v1.schema.json  # contract schema
  docs/                             # review, runtime, and blueprint docs
  scripts/                          # validation and copy tooling
  scanner/                          # local browser scanner and assessment UI
  blueprints/                       # governed starter agents
```

The intended path is to start from the closest working blueprint, then adapt it. Blank folders create work; starter blueprints create momentum.

## Starter blueprints

| Blueprint | Use case | Category | Risk |
| --- | --- | --- | --- |
| `invoice-extractor` | Extract validated invoice fields for review | finance operations | RG-2 |
| `form-to-json-extractor` | Convert forms or records into schema-valid JSON | operations | RG-2 |
| `meeting-summarizer` | Produce faithful summaries, decisions, and open questions | workplace productivity | RG-2 |
| `action-item-tracker` | Extract explicit commitments and draft follow-up records | workplace productivity | RG-2 |

All four are mock-integrated on purpose. They run immediately, show the control pattern, and leave the real system integrations to the implementing team.

## Quick start

Requirements:

- Python 3.10+
- Node.js for the scanner validation script
- `uv` when you want to install optional blueprint LLM dependencies

Validate the repo:

```bash
python3 scripts/validate.py
node scripts/validate-risk-tiers.mjs
```

Open the local scanner:

```bash
open scanner/index.html
```

Use it to paste a system prompt or complete the assessment form.
The scanner returns deterministic RihalGuard gate results, a generated `rihalguard.json`, control findings, a safety radar, sample scenarios, and a remediation block.

Run one starter:

```bash
(cd blueprints/meeting-summarizer && uv sync && python3 run.py && python3 evals/run.py)
```

Without an API key, the starter stays in local policy-gate demo mode.
Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to run the optional LLM tool-use loop through the same policy gate.

Create a working copy from a starter blueprint:

```bash
python3 scripts/create_blueprint.py meeting-summarizer my-meeting-agent
```

The copy appears under `work/`, which is gitignored.

## The core idea

A prompt is not a control.

RihalGuard separates the agent into three layers:

| File | Purpose |
| --- | --- |
| `blueprint.json` | What the agent is, who it is for, and where its supporting files live. |
| `rihalguard.json` | What the agent is allowed to do, what it must never do, and when review is required. |
| `run.py` | A minimal runtime showing how policy can block, allow, or approval-gate tools before execution. |

This split keeps governance review separate from implementation detail. A reviewer can inspect `rihalguard.json` without reading the whole agent.

## Risk model

RihalGuard uses six levels:

| Level | Meaning |
| --- | --- |
| RG-0 | Passive input-only agent. No external tools. |
| RG-1 | Lookup agent. Reads approved sources, no state changes. |
| RG-2 | Structured output agent. Extracts, summarizes, drafts, or recommends. No side effects. |
| RG-3 | Review-gated agent. Prepares an action, but a human must approve before mutation. |
| RG-4 | Controlled execution agent. Executes limited reversible actions inside a defined scope. |
| RG-5 | Autonomous workflow agent. Runs end-to-end workflows with strict audit and rollback controls. |

The current starter blueprints are RG-2.
That is deliberate.
They are safe foundations, not production automations pretending to be demos.

## Local scanner

The scanner in `scanner/` runs directly in the browser.
It has two modes:

| Mode | Use it for |
| --- | --- |
| Prompt scanner | Paste a system prompt or policy text and find missing RihalGuard controls. |
| Risk assessment | Describe an agent's authority, data, and controls to infer an RG level and generate a starter contract. |

The assessment view includes a six-axis safety radar covering authority, human review, tool isolation, auditability, runtime control, and data safety.
Copy buttons use the Clipboard API when available and fall back to selecting the generated contract when browser permissions are stricter.

> [!TIP]
> The scanner is intentionally static.
> You can open `scanner/index.html` without a server, which keeps early governance review easy to run in locked-down environments.

## Governance alignment

RihalGuard is designed to create reviewable design-time evidence for enterprise AI governance. Its contracts map naturally to common concerns in NIST AI RMF, ISO/IEC 42001, and OWASP agentic risk categories: authority boundaries, least-privilege tools, human approval, confidence escalation, bounded execution, auditability, and verification.

This is not a compliance claim. A `rihalguard.json` file documents intended boundaries and required checks; production systems still need runtime enforcement, monitoring, access control, security review, and formal audit evidence.

See [`docs/governance-crosswalk.md`](docs/governance-crosswalk.md) for the detailed mapping.

## What makes a blueprint acceptable

A useful RihalGuard blueprint should have:

- a narrow purpose
- explicit forbidden actions
- tool policy that fails closed
- review triggers for ambiguity and low confidence
- no persistent storage of sensitive source content by default
- deterministic evals for blocked and approval-gated tools
- a clear path for replacing mocks with real integrations

If a blueprint cannot explain its worst-case impact, it is not ready.

## Validation

Run:

```bash
python3 scripts/validate.py
node scripts/validate-risk-tiers.mjs
for d in blueprints/*; do python3 "$d/evals/run.py"; done
```

Expected result:

```text
4/4 RihalGuard contracts valid
16/16 RihalGuard checks passed
```

## Suggested adoption path

1. Use these blueprints for internal prototypes.
2. Add one real integration at a time.
3. Keep write/external tools approval-gated until reviewed.
4. Add behavioral evals for each agent's highest-risk failure.
5. Promote only agents whose `rihalguard.json` and evals match their real capabilities.

## FAQ

### Is RihalGuard an agent framework?

No. RihalGuard is a lightweight blueprint and governance-contract standard. It helps teams define an agent's purpose, risk level, tool boundaries, data rules, review triggers, and verification checks before implementation gets messy.

It does not replace LangGraph, AutoGen, Semantic Kernel, CrewAI, FastAPI services, workflow engines, or internal platforms. It gives those implementations a common starting contract.

### Does RihalGuard enforce policy at runtime?

Only in the starter examples.

The included `run.py` files show a minimal policy gate: load `rihalguard.json`, check the requested tool, block forbidden tools, and require approval for gated tools. That is a pattern, not a full production enforcement platform.

For production, the same contract should inform real runtime controls: tool interception, identity, audit logging, approval workflows, access control, and incident handling.

### How is RihalGuard different from Microsoft's Agent Governance Toolkit?

They sit at different layers.

**Microsoft's Agent Governance Toolkit** is a runtime governance toolkit. It focuses on production controls around autonomous agents: policy enforcement before tool execution, identity and attribution, sandboxing, tamper-evident audit logs, reliability controls, and framework adapters.

**RihalGuard** is the earlier design and starter layer. It helps a team decide what an agent is allowed to do before wiring it into real systems. It provides a human-reviewable `rihalguard.json` contract, starter blueprints, mock tools, and deterministic safety checks.

A simple way to think about it:

| Layer | Main question | Example output |
| --- | --- | --- |
| RihalGuard | What should this agent be allowed to do? | `rihalguard.json`, blueprint, review checklist, starter evals |
| Runtime governance toolkit | Is this specific action allowed right now? | allow/deny decision, audit record, sandboxed execution |

They can complement each other. A RihalGuard contract can inform the policies you implement in a runtime governance layer. RihalGuard does not depend on Microsoft's toolkit, integrate with it by default, or imply affiliation with Microsoft.

RihalGuard should make safe agent work easier, not heavier.
