# Runtime enforcement

A RihalGuard contract is useful as design-time review evidence even before a runtime consumes it.
Production value depends on the deployed system implementing and proving the controls that apply to that integration.

The starter `run.py` files are intentionally small. They show the minimum pattern: load `rihalguard.json`, check the requested tool against policy, and refuse anything outside the contract.

## Minimum controls

1. Load `rihalguard.json` before exposing tools.
2. Expose only allowed tools to the agent where possible.
3. Return `requires_approval` for approval-required tools.
4. Block forbidden tools.
5. Block every unknown tool.
6. Enforce turn, timeout, and budget limits.
7. Write append-only audit events.
8. Route review cases to the configured human destination.

## Tool gate behavior

Expected behavior:

| Tool class | Runtime result |
| --- | --- |
| allowed | execute inside scope |
| approval-required | prepare request, do not execute |
| blocked | refuse execution |
| unknown | refuse execution |

## Why fail closed

Agent systems change quickly. New tools appear during development. If unknown tools are allowed by default, a safe RG-2 agent can accidentally become a write-capable workflow.

Failing closed is annoying. It is also the right default.

## Production notes

A production runtime should add:

- real identity and permission checks
- audit storage outside the model context
- approval workflow integration
- per-tool input/output validation
- timeout and cost enforcement
- environment-specific allowlists
- incident logging for blocked attempts

## Deployment enforcement profile

Each production integration should keep an enforcement profile beside its implementation evidence.
The profile should map each consumed contract field to the responsible runtime component, enforcement behavior, test, and evidence location.
Fields that are not consumed by the runtime remain review evidence or procedural controls and must not be presented as automatically enforced.
