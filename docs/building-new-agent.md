# Building a new agent

Prefer adapting a starter blueprint over beginning with a blank folder.

1. Pick the closest blueprint.
2. Copy it with `scripts/create_blueprint.py`.
3. Edit `purpose`, `maximum_impact`, and `scope` first.
4. Define tools as read-only, approval-required, or blocked.
5. Write evals for the agent's most damaging likely failure.
6. Run `python3 scripts/validate.py`.

A blank base template exists for unusual agents, but the intended path is to start from a working governed starter.
