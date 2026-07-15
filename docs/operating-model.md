# RihalGuard operating model

RihalGuard is a design-time review contract, scanner, and blueprint standard for agents built for Rihal.
It does not operate production approval queues or replace runtime, security, privacy, data-governance, or business controls.

## Lifecycle

Rihal agent contracts move through this lifecycle:

```text
Draft -> Validate -> Review -> Approved -> Integrated -> Periodic Review -> Deprecated
```

Draft contracts may contain explicit `todo-` placeholders.
Validation checks schema conformance, tool-manifest consistency, safe defaults, and computed risk.
Review confirms the stated boundary, risk, tools, data handling, output policy, escalation route, and verification evidence.
Approval records accountable owners and any required security, data, or business decisions.
Integration connects reviewed tools and records which contract fields the runtime consumes.
Periodic review checks that deployed capabilities still match the contract.
Deprecation removes exposure, integrations, credentials, and registry references according to Rihal policy.

Reusable contracts in `blueprints/` are reference starting points rather than approved production deployments.
Teams must replace blueprint owners, destinations, dates, tools, data classes, and evidence with deployment-specific values before approval.

## Roles

### Agent owner

The agent owner drafts and maintains `rihalguard.json`, owns the business purpose and outcome, and initiates review when capabilities change.

### Tool owner

The tool owner maintains canonical metadata for tool behavior, authority, data access, side effects, reversibility, approval needs, audit needs, and supported scopes.
The tool owner does not decide that every agent may use the tool.

### Governance reviewer

The governance reviewer validates purpose, maximum impact, risk level, forbidden actions, review triggers, verification evidence, and contract completeness.
This role is represented by `review.owner` and is distinct from the agent owner.

### Security or data reviewer

A security or data reviewer is required when the agent accesses sensitive data, introduces external or write actions, changes identity or permissions, stores persistent memory, or crosses an existing Rihal review threshold.
This is a triggered role, not a mandatory reviewer for every low-risk blueprint.

### Runtime or platform owner

The runtime or platform owner decides which contract fields the deployed platform can enforce and maintains the enforcement profile, integration tests, audit plumbing, approval connection, and incident behavior.

### Review destination owner

The review destination owner operates the human team or queue named by `human_review.destination`.
This destination handles agent cases and is not the same as the governance reviewer who approves the contract.

## Governance changes

Changes to risk level, maximum impact, forbidden scope, tool policy, data policy, human review, output integrity, or runtime limits require governance review.
Adding or materially changing a tool also requires its canonical metadata and agent-specific policy mapping to be reviewed.
Sensitive-data access, external side effects, irreversible actions, identity changes, and risk-level increases trigger security or data review as applicable.

Normal wording, examples, and implementation changes do not require governance review unless they change actual capability or invalidate existing evidence.

## Approval rule

An agent is not approved merely because its JSON validates or the scanner reports no gaps.
Approval requires accountable owners, reviewed tool metadata, deployment-specific destinations, risk-matched evidence, and confirmation that the implementation does not exceed the contract.

No `todo-` placeholder may remain in an approved or integrated contract.

## Drift prevention

The contract, tool manifest, runtime exposure, tests, and deployment enforcement profile must describe the same capabilities.
Repository validation checks the artifacts it can inspect, while production drift must also be detected through the runtime platform and Rihal's normal change controls.
Contract versions must be pinned per deployment and migrated according to [`versioning.md`](versioning.md).
