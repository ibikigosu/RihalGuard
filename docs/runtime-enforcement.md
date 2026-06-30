# Runtime enforcement

The contract is only useful if the runtime enforces it.

Minimum runtime controls:

1. Load `rihalguard.json` before exposing tools.
2. Expose only allowed tools.
3. Return `requires_approval` for approval-required tools.
4. Block forbidden and unknown risky tools.
5. Enforce turn, timeout, and cost limits.
6. Write append-only audit events.
7. Route review cases to the configured human destination.

The starter `run.py` files demonstrate policy-based gating with mock tools.
