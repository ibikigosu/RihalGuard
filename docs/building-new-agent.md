# Building a new agent

Start from the closest blueprint. Do not start from a blank folder unless the agent is genuinely unlike anything in `blueprints/`.

The blueprint is not supposed to be finished software. It is a governed starting point: contract first, mocked tools second, real integration last.

## Flow

1. Pick the closest blueprint.
2. Copy it with `scripts/create_blueprint.py`.
3. Edit `rihalguard.json` before touching the prompt.
4. Tighten the purpose and maximum impact.
5. Decide which tools are allowed, approval-required, or blocked.
6. Replace mock tools one at a time.
7. Classify every imported or custom tool in `tools.json` before adding it to the contract.
8. Add evals for the highest-risk failure.
9. Run validation before sharing.

```bash
python3 scripts/create_blueprint.py meeting-summarizer my-meeting-agent
uv run python scripts/validate.py
python3 work/my-meeting-agent/evals/run.py
```

## What to edit first

In `rihalguard.json`, edit these fields first:

- `purpose`
- `maximum_impact`
- `scope.allowed`
- `scope.forbidden`
- `tool_policy`
- `human_review.required_when`
- `data_policy.data_classes`

If those are vague, the agent is vague.

## What not to do

Do not add real write tools just because the demo works.

Keep these approval-gated until a reviewer signs off:

- sending messages
- creating tickets
- writing to internal systems
- posting to external systems
- changing permissions
- approving payments or records

## Done enough for a demo

A blueprint is demo-ready when:

- `uv run python scripts/validate.py` passes
- the agent's own `evals/run.py` passes
- the README explains the boundary in plain language
- unsafe tools are absent, blocked, or approval-gated
- the output says what it does not know
