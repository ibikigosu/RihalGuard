# RihalGuard

RihalGuard is a lightweight standard and starter registry for building governed AI agents in enterprise workflows.

It gives each agent a reviewable contract before deployment: purpose, risk level, scope, tool permissions, data handling, human-review triggers, audit requirements, and verification checks.

RihalGuard is intentionally general. It can be used for workplace productivity, finance operations, internal knowledge assistants, business process automation, engineering support, customer operations, and other agentic workflows.

## What is included

- `SPEC.md` — the RihalGuard v1 standard
- `schema/rihalguard-v1.schema.json` — machine-readable contract schema
- `blueprints/` — governed starter agents with mock tools and safety evals
- `docs/` — risk levels, review checklist, runtime enforcement, and blueprint format
- `scripts/validate.py` — validates contracts and required blueprint files
- `scripts/create_blueprint.py` — copies a starter blueprint into a new workspace

## Quick start

```bash
python3 scripts/validate.py
python3 blueprints/meeting-summarizer/evals/run.py
python3 scripts/create_blueprint.py meeting-summarizer my-meeting-agent
```

## Design principle

A prompt is not a control. RihalGuard separates agent design from runtime enforcement:

- `blueprint.json` explains what the agent is.
- `rihalguard.json` defines what the agent is allowed to do.
- `run.py` shows how the contract can be enforced before tool execution.

## Starter blueprints

| Blueprint | Category | Risk |
| --- | --- | --- |
| invoice-extractor | finance operations | RG-2 |
| form-to-json-extractor | operations | RG-2 |
| meeting-summarizer | workplace productivity | RG-2 |
| action-item-tracker | workplace productivity | RG-2 |
