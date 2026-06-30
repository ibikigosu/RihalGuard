# Governance Crosswalk

RihalGuard is a design-time governance standard. Its contracts create reviewable evidence about an agent's intended behavior before teams connect real systems, tools, or data.

This crosswalk shows how the existing RihalGuard contract fields support common enterprise governance concerns in NIST AI RMF 1.0, ISO/IEC 42001:2023, and OWASP agentic application risks.

It is evidence toward governance review, not certification. A `rihalguard.json` file does not prove that a production runtime enforces the policy, that an auditor accepts the control, or that the agent is safe in every deployment. It proves that intent, boundaries, review triggers, limits, and verification checks were declared in a consistent format.

## Crosswalk

| RihalGuard evidence | Contract location | Governance value | NIST AI RMF 1.0 alignment | ISO/IEC 42001:2023 alignment | OWASP agentic risk alignment |
| --- | --- | --- | --- | --- | --- |
| Worst-case impact and risk level | `risk.risk_level`, `risk.maximum_impact` | Classifies the agent by the most consequential action it can technically perform, not by its expected happy path. | MAP: context and impact understanding; MANAGE: risk treatment prioritization | AI system impact assessment and responsible-use planning | Rogue agents, goal hijack, excessive autonomy |
| Authority boundary | `scope.allowed`, `scope.forbidden` | States what the agent may and may not modify, send, delete, approve, or decide. | MAP: system categorization; GOVERN: oversight expectations | Intended use, misuse boundaries, human responsibility | Identity and privilege abuse, goal hijack |
| Tool boundary and least privilege | `tool_policy.allowed_tools`, `tool_policy.approval_required_tools`, `tool_policy.blocked_tools` | Separates safe tools from approval-gated or blocked tools. Unknown tools should fail closed. | MANAGE: risk response and control selection | Resource and tooling governance; usage limits | Tool misuse, privilege abuse, unexpected code execution |
| Human approval gates | `human_review.triggers`, approval-required tools | Requires human review before irreversible, external, sensitive, or ambiguous actions. | MANAGE: override, appeal, and intervention mechanisms; GOVERN: human oversight | Human oversight and override expectations | Human-agent trust exploitation, tool misuse |
| Confidence and ambiguity escalation | `human_review.triggers`, `output_policy.evidence_required` | Routes low-confidence, incomplete, conflicting, or unsupported outputs to review instead of letting the agent invent certainty. | MEASURE: quality and risk evaluation; MANAGE: risk response | Operation monitoring and responsible use | Goal hijack, trust exploitation, unsafe delegation |
| Data handling boundary | `data_policy` | Declares allowed data classes, storage, retention, logging, memory behavior, and redaction posture. | GOVERN: documentation and accountability; MANAGE: privacy and data risk treatment | Data governance, lifecycle controls, interested-party information | Sensitive information disclosure, excessive agency |
| Output boundary | `output_policy` | Defines allowed output formats, evidence requirements, and fabrication rules. | MEASURE: output quality and evaluation criteria | Transparency and information for interested parties | Tool misuse, unexpected code execution, unsafe output |
| Runtime limits | `runtime_limits` | Caps reasoning steps, timeouts, budget, or other execution limits to reduce runaway behavior. | MANAGE: monitoring and risk controls | Operational monitoring and resource control | Cascading failures, denial of wallet, runaway loops |
| Audit trail | `audit.required_events`, `audit.append_only` | Defines what decisions, approvals, tool requests, and policy blocks must be recorded. | GOVERN: documentation; MANAGE: monitoring and incident investigation | Lifecycle logging, traceability, impact assessment evidence | Detection signal for rogue behavior, tool misuse, policy bypass |
| Verification checks | `verification.tests`, blueprint `evals/run.py` | Provides deterministic tests that prove declared boundaries are not just prose. | MEASURE: test and evaluation; MANAGE: control validation | Verification, validation, and operational monitoring | Tool misuse, privilege abuse, unexpected action execution |

## What this does not claim

RihalGuard does not claim that a blueprint is compliant with NIST, ISO, OWASP, or any customer-specific control set.

It also does not replace:

- runtime policy enforcement
- identity and access management
- security review
- privacy review
- penetration testing
- model evaluation
- incident response
- business-owner approval
- formal audit evidence collected from production systems

The crosswalk is useful because it makes governance intent visible early. It helps a reviewer ask better questions before an agent becomes a real workflow.

## How to use this in reviews

For each proposed agent, review the `rihalguard.json` contract and ask:

1. Does the declared risk level match the most powerful tool or action available to the agent?
2. Are forbidden actions specific enough to block obvious misuse?
3. Are write, external-send, deletion, approval, spending, or credential-related tools gated or blocked?
4. Are low-confidence and ambiguous cases routed to humans?
5. Are data retention and logging rules safe for the data involved?
6. Do runtime limits prevent runaway loops, excessive cost, or hidden long-running behavior?
7. Do audit events capture tool requests, approvals, denials, and policy blocks?
8. Do evals prove the highest-risk boundaries fail closed?

If the answer is unclear, the blueprint is not ready for real integration.

## Versioning note

This document is intentionally separate from the `rihalguard.json` schema. Governance mappings change faster than a stable contract format should. Keep the schema focused on agent behavior; keep external-framework interpretation in this document until repeated usage justifies a schema change.
