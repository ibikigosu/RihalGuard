# Meeting Summary Agent

Turns transcripts into faithful summaries, decisions, action items, and open questions grounded in the source.

This is a governed starter, not a finished production integration. It gives a team the contract, prompt, mock tools, runtime gate, and safety checks needed to start implementation without starting from nothing.

## Best fit

Internal meetings where participants need a reviewable summary and clear follow-up draft.

## Not for

Sending notes, assigning tasks, scheduling meetings, or turning unresolved discussion into decisions.

## Risk level

`RG-2 - Structured Output`

The agent can produce structured output for review.
It must not mutate external systems, send messages, create tasks, approve records, or perform write actions.

## Governance boundary

The boundary lives in `rihalguard.json`.

The important rule: if the input is ambiguous, incomplete, or risky, the agent should flag review instead of smoothing over the problem.

Typical review triggers:

- Unclear owner, ambiguous decision, sensitive content, or low transcript quality.

Expected evidence:

- speaker/source excerpt, summary section, decision/action status, review reason

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
uv sync
python3 run.py
python3 evals/run.py
```

Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to run the optional LLM tool-use loop.
Without an API key, `run.py` stays in local policy-gate demo mode.

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
