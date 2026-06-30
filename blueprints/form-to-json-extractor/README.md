# Form-to-JSON Extraction Agent

Maps form inputs into schema-valid JSON while flagging missing, ambiguous, or low-confidence fields.

## Risk level

`RG-2 — Structured Output`: this starter can produce structured output for review. It must not mutate external systems.

## Files

- `rihalguard.json` — governance contract
- `system-prompt.md` — behavioral rules
- `tools.json` — mock tool registry
- `run.py` — policy-gated mock runner
- `evals/run.py` — deterministic safety checks

## Run

```bash
python3 run.py
python3 evals/run.py
```

## Adaptation path

1. Edit `rihalguard.json` first.
2. Replace mock tools with real integrations.
3. Add behavioral evals for the agent's main failure modes.
4. Keep write/external tools approval-gated until reviewed.
