# Blueprint format

A RihalGuard blueprint is a governed starter folder. It should run with mock tools, explain its boundary, and be easy for an employee to adapt without reading the whole repository.

## Required files

| File | Purpose |
| --- | --- |
| `README.md` | Human-facing explanation, risk level, run commands, adaptation path |
| `blueprint.json` | Metadata and file references |
| `rihalguard.json` | Governance contract |
| `system-prompt.md` | Behavioral rules for the agent |
| `tools.json` | Reviewed tool manifest with authority, data, side-effect, approval, audit, ownership, and scope metadata |
| `workflow.md` | Step-by-step operating flow |
| `examples.md` | Clean, ambiguous, and unsafe examples |
| `setup-guide.md` | How to run and adapt the starter |
| `run.py` | Minimal policy-gated mock runner |
| `evals/run.py` | Deterministic safety checks |

## Separation of concerns

`blueprint.json` is product/build metadata.

`rihalguard.json` is the governance contract.

Keep them separate so review stays clean. A product owner can read the blueprint. A reviewer can inspect the contract. A runtime can load the contract and enforce the tool policy.

Every allowed or approval-required contract tool must have a matching `tools.json` entry.
Blocked tools may remain absent from `tools.json` so the runtime cannot expose them.

## Blueprint quality bar

A blueprint should be:

- narrow enough to understand in five minutes
- runnable without external credentials
- explicit about forbidden actions
- clear about when review is required
- ready for real integrations without changing its safety model

If a starter needs a long explanation before anyone can use it, the starter is doing too much.
