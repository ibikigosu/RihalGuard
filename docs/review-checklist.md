# Review checklist

Use this before a blueprint is used beyond a demo.

## Scope

- Is the purpose narrow enough?
- Is the maximum impact specific?
- Are forbidden actions written as actions, not vague principles?
- Does the README match the contract?

## Tools

- Are dangerous tools absent, blocked, or approval-gated?
- Do unknown tools fail closed?
- Are write/external tools separated from read/transform tools?
- Does every allowed or approval-required tool have reviewed metadata and an accountable owner?
- Does the manifest describe authority, data access, side effects, reversibility, approval, audit, and allowed agent scopes?
- Does the runtime check policy before tool execution?

## Data

- Is the data class stated?
- Is persistent memory disabled for sensitive content by default?
- Are logs redacted where needed?
- Is client or project isolation required where relevant?

## Output

- Does the agent show uncertainty?
- Does it require source evidence where appropriate?
- Does it avoid inventing missing facts?
- Does `unsupported_claim_policy` define what happens when evidence is missing?
- Does it produce a reviewable structure?

## Evals

- Do blocked tools fail?
- Do approval-required tools return `requires_approval`?
- Do allowed tools run?
- Is the agent's most damaging likely failure tested?

## Decision

Approve the blueprint only if its contract, runtime, and evals tell the same story.
