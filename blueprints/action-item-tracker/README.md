# Action Item Tracking Agent

Extracts explicit commitments and prepares reviewable follow-up records without inventing owners or due dates.

This is a governed starter, not a finished production integration. It gives a team the contract, prompt, mock tools, runtime gate, and safety checks needed to start implementation without starting from nothing.

## Best fit

Teams that want a safer starting point for tracking commitments from notes, chats, or meetings.

## Not for

Auto-assigning people, sending reminders, closing tasks, or creating external tickets without approval.

## Risk level

`RG-2 - Structured Output`

The agent can produce structured output for review.
It must not mutate external systems, send messages, create tasks, approve records, or perform write actions.

## Governance boundary

The boundary lives in `rihalguard.json`.

The important rule: if the input is ambiguous, incomplete, or risky, the agent should flag review instead of smoothing over the problem.

Typical review triggers:

- Tentative commitment, unclear ownership, missing due date, conflicting status, or sensitive task content.

Expected evidence:

- source statement, owner confidence, due-date confidence, review reason

## Files

| File | Purpose |
| --- | --- |
| `rihalguard.json` | risk, scope, tool policy, data handling, review triggers |
| `blueprint.json` | starter metadata and file references |
| `system-prompt.md` | behavior rules for the agent |
| `tools.json` | mock tool registry and tool risk labels |
| `workflow.md` | operating flow |
| `run.py` | policy-gated mock runtime |
| `evals/run.py` | deterministic safety checks |

## Run

```bash
python3 run.py
python3 evals/run.py
```

## Adaptation path

1. Edit `rihalguard.json` first.
2. Replace one mock tool with one real integration.
3. Keep write/external actions approval-gated.
4. Add behavioral evals for the highest-risk mistake.
5. Run the root validator before sharing.

```bash
python3 ../../scripts/validate.py
```

## Implementation note

Do not make the prompt carry the safety model alone. The runtime gate should block or approval-gate tools before execution.
