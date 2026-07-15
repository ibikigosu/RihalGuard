# Custom tool policy

Custom and imported tools are blocked until they are identified, classified, reviewed, and mapped into an agent contract.
Review-required is not the default for an unknown tool because approval cannot compensate for unknown authority or side effects.

## Adoption flow

```text
Tool proposed
-> establish stable identity and version
-> obtain canonical metadata from the tool owner
-> classify authority, data, side effects, and reversibility
-> decide approval and audit requirements
-> map the reviewed tool into one agent policy
-> validate the manifest and contract together
-> expose only allowed tools at runtime
```

Tool behavior must not be inferred from its name alone.
When authoritative metadata is unavailable or contradictory, the tool remains blocked.

## Canonical metadata

Every `tools.json` entry declares:

- stable tool name and version
- plain-language purpose
- authority class
- data classes accessed
- whether it has external side effects
- reversibility
- approval requirement
- audit requirement
- accountable tool owner
- allowed agent scopes
- input schema

Each manifest also declares its tool-manifest schema and manifest version.

The tool owner owns facts about the tool.
The agent owner owns whether that reviewed tool belongs in `allowed_tools`, `approval_required_tools`, or nowhere in the agent's exposed manifest.

## Default decisions

- Unknown or unversioned tools are blocked.
- Tools without an accountable owner are blocked.
- Read and transform tools may be allowed after scope and data review.
- Write or external-action tools require approval unless a higher-risk autonomous design has been explicitly reviewed.
- Irreversible, permission-changing, money-moving, or sensitive-data tools require risk-matched security or data review.
- Tools outside their declared agent scopes are blocked.
- Runtime exposure is derived from the resolved allowlist, never from every installed tool.

## Blueprint manifest

The repository schema for `tools.json` is [`../schema/tool-manifest-v1.schema.json`](../schema/tool-manifest-v1.schema.json).
Blueprint manifests may contain mock or stub tools, but their metadata must describe the real authority they represent.
Every allowed and approval-required contract tool must exist in the manifest.
Blocked tools may remain absent so the runtime cannot expose them.

Production teams may replace the local manifest with references to a Rihal-owned central tool catalog when one is available.
The contract should pin stable tool identifiers or versions so catalog changes cannot silently broaden an agent's authority.
