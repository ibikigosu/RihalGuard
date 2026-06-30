# RihalGuard

**RihalGuard is a starter standard for building governed enterprise AI agents.**

It is not another prompt collection. It is a practical way to start every agent with the same minimum operating discipline: a clear purpose, a risk level, tool boundaries, human-review triggers, audit events, and deterministic safety checks.

The goal is simple: make agent development faster without letting every team invent its own rules.

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
- **Runtime pattern**: examples showing how a contract can gate tool execution before anything dangerous runs.

## Repository map

```text
RihalGuard/
  README.md                         # project overview
  SPEC.md                           # RihalGuard v1 standard
  registry.json                     # blueprint index
  schema/rihalguard-v1.schema.json  # contract schema
  docs/                             # review, runtime, and blueprint docs
  scripts/                          # validation and copy tooling
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

Validate the repo:

```bash
python3 scripts/validate.py
```

Run one starter:

```bash
python3 blueprints/meeting-summarizer/run.py
python3 blueprints/meeting-summarizer/evals/run.py
```

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
| `run.py` | A minimal runtime showing how policy can block or gate tools before execution. |

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

The current starter blueprints are RG-2. That is deliberate. They are safe foundations, not production automations pretending to be demos.

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

RihalGuard should make safe agent work easier, not heavier.
