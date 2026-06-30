# Blueprint format

A RihalGuard blueprint is a governed starter folder. It should be runnable with mock tools, clear enough to adapt, and strict enough to review.

Required files:

- `README.md`
- `blueprint.json`
- `rihalguard.json`
- `system-prompt.md`
- `tools.json`
- `tools.py` optional for richer implementations
- `workflow.md`
- `examples.md`
- `setup-guide.md`
- `run.py`
- `evals/run.py`

`blueprint.json` is product/build metadata. `rihalguard.json` is the governance contract.
