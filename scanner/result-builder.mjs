const RISK_AXES = [
  { axis: "scope", label: "Scope & Authority", gates: ["scope-boundary", "authority-boundary"] },
  { axis: "tools", label: "Tool Policy", gates: ["tool-policy", "approval"] },
  { axis: "cost", label: "Cost & Exposure", gates: ["cost-boundary"] },
  { axis: "data", label: "Data Handling", gates: ["data-policy"] },
  { axis: "runtime", label: "Runtime Bounds", gates: ["runtime-limits", "loop-boundary"] },
  { axis: "oversight", label: "Human Oversight", gates: ["human-review", "human-handoff", "review-owner"] },
  { axis: "audit", label: "Auditability", gates: ["audit"] },
  { axis: "verification", label: "Verification", gates: ["verification", "output-integrity"] },
];

const MICROSOFT_SOURCE_URL =
  "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/governance-security-across-organization";
const RIHALGUARD_SOURCE_URL = "../SPEC.md";

function riskForGate(item) {
  if (item.status === "n/a") return 0;
  if (item.status === "pass") return 1;
  if (item.status === "partial") return 4;
  if (item.status === "fail") {
    if (item.severity === "high") return 9;
    if (item.severity === "medium") return 6;
    return 3;
  }
  return 0;
}

function riskStatus(score) {
  if (score <= 0) return "n/a";
  if (score >= 9) return "critical";
  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function buildRiskRadar(gates) {
  const gateById = new Map(gates.map((item) => [item.id, item]));
  const axes = RISK_AXES.map(({ axis, label, gates: ids }) => {
    const mapped = ids.map((id) => gateById.get(id)).filter(Boolean);
    if (mapped.length === 0) {
      return { axis, label, risk: 0, status: "n/a", contributors: [] };
    }
    const contributors = mapped.map((item) => ({
      id: item.id,
      status: item.status,
      severity: item.severity,
      risk: riskForGate(item),
    }));
    const worst = contributors.reduce((max, c) => (c.risk > max ? c.risk : max), 0);
    return { axis, label, risk: worst, status: riskStatus(worst), contributors };
  });
  const applicable = axes.filter((a) => a.status !== "n/a");
  const average = applicable.length === 0 ? 0 : applicable.reduce((s, a) => s + a.risk, 0) / applicable.length;
  const criticalCount = axes.filter((a) => a.status === "critical" || a.status === "high").length;
  const level = applicable.length === 0 ? "n/a" : riskStatus(Number(average.toFixed(1)));
  return { axes, average: Number(average.toFixed(1)), level, criticalCount };
}

export function buildResult(type, gates, contract, promptSignals = null, computedRisk = null) {
  const failed = gates.filter((item) => item.status === "fail");
  const partial = gates.filter((item) => item.status === "partial");
  const applicable = gates.filter((item) => item.status !== "n/a");
  const score =
    applicable.length === 0
      ? 100
      : Math.round(((applicable.length - failed.length - partial.length * 0.5) / applicable.length) * 100);
  const highFailures = failed.filter((item) => item.severity === "high").length;
  const determination =
    type === "prompt" && highFailures > 0
      ? "Blocked"
      : highFailures > 0
        ? "Needs work"
        : failed.length > 0 || partial.length > 0
          ? "Conditional"
          : "Ready for review";
  const confidence = type === "contract" ? 92 : 82;
  const scenarios = buildScenarios(gates, promptSignals);
  const fixBlock = buildFixBlock(failed);
  const frameworks = buildFrameworks(gates, type);
  const riskRadar = buildRiskRadar(gates);
  const trustTier =
    type === "contract" && contract?.risk_level
      ? computedRisk?.level && computedRisk.level !== contract.risk_level
        ? `${contract.risk_level} -> ${computedRisk.level}`
        : contract.risk_level
      : type === "prompt"
        ? inferPromptTrustTier(gates)
        : "n/a";

  return {
    type,
    determination,
    score,
    trustTier,
    confidence,
    failedCount: failed.length + partial.length,
    gates,
    scenarios,
    frameworks,
    riskRadar,
    computedRisk,
    fixBlock,
    report: buildReport({ type, determination, score, confidence, failed, gates, scenarios }),
  };
}

function inferPromptTrustTier(gates) {
  const failed = new Set(gates.filter((item) => item.status === "fail").map((item) => item.id));
  if (failed.has("cost-boundary")) return "RG-2";
  if (failed.has("loop-boundary")) return "RG-3";
  return "RG-1";
}

function buildScenarios(gates, promptSignals = null) {
  const failed = new Map(gates.filter((item) => item.status === "fail").map((item) => [item.id, item]));
  const scenarios = [];
  const addScenario = (id, severity, title, body, remediation, example = "") => {
    if (scenarios.some((item) => item.id === id)) return;
    scenarios.push({ id, severity, title, body, remediation, example });
  };

  if (promptSignals) {
    if (promptSignals.hasAutomaticFinancialApproval && !promptSignals.hasAggregateExposureCap) {
      addScenario(
        "sub-threshold-financial-abuse",
        "high",
        "Sub-threshold financial abuse",
        "The agent can approve money movement below a fixed threshold, but the prompt does not require aggregate caps, anomaly checks, or pattern review.",
        "Add per-window aggregate caps and a confidence or anomaly check, not just a per-transaction threshold.",
        "A user splits one large refund into many small refunds to avoid the approval limit.",
      );
    }

    if ((promptSignals.hasTooling || promptSignals.hasToolLoopRisk) && !promptSignals.hasLoopBound) {
      addScenario(
        "unbounded-tool-loop",
        "high",
        "Unbounded tool loop / cost blowout",
        "A tool-using agent with no max-step, max-tool-call, timeout, or stop condition can retry or re-plan indefinitely when tools fail or return ambiguous results.",
        "Set hard max-iterations and max-tool-calls caps, then stop and escalate when progress stalls.",
        "A verification or refund lookup keeps returning ambiguous results and the agent keeps calling tools.",
      );
    }

    if (promptSignals.hasSensitiveData && !promptSignals.hasDataConstraints) {
      addScenario(
        "sensitive-data-without-constraints",
        "high",
        "Sensitive data handled without constraints",
        "The agent processes customer or personal data without rules for retention, redaction, logging, memory, or onward sharing.",
        "State what data may be read, retained, logged, redacted, or sent to downstream tools.",
        "Customer identifiers or email content are written into logs, messages, or another tool without masking.",
      );
    }

    if (!promptSignals.hasAudit && (promptSignals.hasConsequentialAction || promptSignals.hasTooling)) {
      addScenario(
        "missing-audit-trail",
        "medium",
        "No audit trail for actions taken",
        "The agent can take consequential or tool-backed actions, but the prompt does not require a durable record of inputs, decisions, tool calls, outcomes, and review status.",
        "Log every decision and tool call with input summary, reasoning, arguments, result, and review status.",
        "After a disputed action, the team cannot reconstruct why the agent approved, denied, sent, or escalated a case.",
      );
    }

    if (failed.has("approval")) {
      addScenario(
        "missing-approval-gate",
        "high",
        "Consequential action without approval",
        "The prompt allows irreversible, external, or high-impact actions without a clear approval gate.",
        failed.get("approval").fix,
        "An agent updates, refunds, blocks, sends, or deletes before a human has approved the action.",
      );
    }

    if (failed.has("human-handoff") && (promptSignals.hasConsequentialAction || promptSignals.asksToResolveFast)) {
      addScenario(
        "no-human-fallback",
        "high",
        "No human fallback for edge cases",
        "The agent is told to resolve cases but lacks a named escalation destination for ambiguous, sensitive, unsupported, or outside-policy requests.",
        failed.get("human-handoff").fix,
        "A borderline case is forced through normal handling because there is nowhere to hand it off.",
      );
    }
  }

  const scenarioByGate = {
    "scope-boundary": "The agent receives an adjacent request and cannot prove whether it is inside or outside its lane.",
    "tool-policy": "A newly wired tool appears at runtime and the agent calls it because unknown tools are not forced closed.",
    "data-policy": "Sensitive source content lands in persistent memory or unredacted logs during normal operation.",
    "human-review": "A low-confidence or consequential case ships without a clear review destination.",
    "runtime-limits": "The agent retries a failing tool path until it burns budget or repeats side effects.",
    audit: "A reviewer cannot reconstruct which input, tool call, or decision produced the final answer.",
    verification: "The blueprint looks governed on paper but has no deterministic proof that blocked and approval-gated paths hold.",
  };

  for (const item of failed.values()) {
    if (promptSignals && item.id === "audit" && scenarios.some((scenario) => scenario.id === "missing-audit-trail")) {
      continue;
    }
    if (scenarioByGate[item.id]) {
      addScenario(item.id, item.severity, item.title, item.scenario || scenarioByGate[item.id], item.fix);
    }
  }

  return scenarios;
}

function buildFixBlock(failed) {
  if (failed.length === 0) {
    return "No failed gates. Keep the contract and runtime evals together during implementation.";
  }

  const lines = ["RIHALGUARD REMEDIATION BLOCK", "Add this block to address every failed gate."];
  for (const item of failed) {
    const heading = {
      approval: "HUMAN APPROVAL FOR IRREVERSIBLE ACTIONS",
      "human-handoff": "ESCALATION PATH TO A HUMAN",
      "cost-boundary": "COST / EXPOSURE CONTROL",
      "authority-boundary": "EXPLICIT GUARDRAILS",
      "loop-boundary": "LOOP / ITERATION BOUND",
      audit: "AUDITABILITY OF DECISIONS",
    }[item.id] || item.title.toUpperCase();
    lines.push("", `// ${heading}`, item.fix);
  }
  lines.push("", "Runtime must enforce this contract before any tool executes.");
  return lines.join("\n");
}

function buildFrameworks(gates, type) {
  const gateById = new Map(gates.map((item) => [item.id, item]));
  const mapStatus = (...ids) => {
    const mapped = ids.map((id) => gateById.get(id)).filter(Boolean);
    if (mapped.length === 0 || mapped.every((item) => item.status === "n/a")) return "n/a";
    return mapped.some((item) => item.status === "fail") ? "gap" : "satisfied";
  };
  const mapSeverity = (...ids) => {
    const severities = ids.map((id) => gateById.get(id)?.severity).filter(Boolean);
    if (severities.includes("high")) return "high";
    if (severities.includes("medium")) return "medium";
    return "low";
  };
  const mapEvidence = (satisfied, gap, notApplicable = "No applicable signal was detected in this scan.") => (status) => {
    if (status === "gap") return gap;
    if (status === "n/a") return notApplicable;
    return satisfied;
  };
  const microsoftRows = [
    frameworkRow({
      status: mapStatus("human-review", "human-handoff", "review-owner"),
      severity: mapSeverity("human-review", "human-handoff", "review-owner"),
      control: "Human accountable for approving consequential actions",
      field: "human_review, review.owner",
      detailForStatus: mapEvidence(
        "Human accountability, review ownership, or escalation is represented in the design layer.",
        "Consequential cases need a named human owner, review destination, or approval route.",
      ),
    }),
    frameworkRow({
      status: mapStatus("scope-boundary", "human-review", "human-handoff", "authority-boundary"),
      severity: mapSeverity("scope-boundary", "human-review", "human-handoff", "authority-boundary"),
      control: "Clear ownership and human escalation",
      field: "scope, human_review",
      detailForStatus: mapEvidence(
        "Ownership and escalation boundaries are explicit enough for design review.",
        "Add clear ownership for outcomes and a defined route to a person when the agent cannot proceed.",
      ),
    }),
    frameworkRow({
      status: mapStatus("tool-policy", "authority-boundary"),
      severity: mapSeverity("tool-policy", "authority-boundary"),
      control: "Embedded safeguards and guardrails",
      field: "tool_policy, scope.forbidden",
      detailForStatus: mapEvidence(
        "Tool boundaries and prohibitions are documented as guardrails.",
        "Classify allowed, approval-required, and blocked actions, then fail closed on unknown tools.",
      ),
    }),
    frameworkRow({
      status: mapStatus("contract-shape", "cost-boundary"),
      severity: mapSeverity("contract-shape", "cost-boundary"),
      control: "Risk-matched oversight and zoned governance",
      field: "risk_level, maximum_impact, runtime_limits",
      detailForStatus: mapEvidence(
        "Risk level, maximum impact, and exposure controls provide risk-matched review evidence.",
        "Set the worst-case risk tier, maximum impact, spend or exposure caps, and approval thresholds.",
      ),
    }),
    frameworkRow({
      status: mapStatus("runtime-limits", "loop-boundary"),
      severity: mapSeverity("runtime-limits", "loop-boundary"),
      control: "Reliable, bounded operation",
      field: "runtime_limits",
      detailForStatus: mapEvidence(
        "Runtime or loop limits bound runaway behavior.",
        "Cap iterations, tool calls, time, or cost so the agent cannot run unbounded.",
        "No autonomous loop or runtime execution path was detected in the prompt.",
      ),
    }),
    frameworkRow({
      status: mapStatus("audit"),
      severity: mapSeverity("audit"),
      control: "Monitoring and recorded decisions",
      field: "audit",
      detailForStatus: mapEvidence(
        "Audit or monitoring requirements make decisions reviewable.",
        "Log agent actions, tool decisions, reasons, outputs, and review status in an append-only trail.",
      ),
    }),
    frameworkRow({
      status: mapStatus("tool-policy", "data-policy", "authority-boundary"),
      severity: mapSeverity("tool-policy", "data-policy", "authority-boundary"),
      control: "Least-privilege scope",
      field: "tool_policy, data_policy, scope",
      detailForStatus: mapEvidence(
        "Scope, tool, and data rules constrain access to the agent's lane.",
        "Scope the agent to the minimum tools and data it needs, with no production or out-of-lane changes.",
      ),
    }),
    platformRow(
      "Non-human identity and conditional access",
      "Entra ID",
      "Microsoft describes identity and access as platform controls. A browser prompt scan can only mark this out of scope.",
    ),
    platformRow(
      "Data loss prevention",
      "Purview",
      "Microsoft describes DLP and compliance policy enforcement as platform controls. The scanner checks only data-policy intent.",
    ),
    platformRow(
      "Runtime threat detection",
      "Defender",
      "Microsoft describes runtime detection as a platform control. This scanner does not inspect live infrastructure.",
    ),
  ];

  const rihalGuardRows = [
    frameworkRow({
      status: mapStatus("tool-policy", "approval"),
      severity: mapSeverity("tool-policy", "approval"),
      control: "tool_policy.approval_required_tools maps to Microsoft approval controls",
      field: "tool_policy.approval_required_tools",
      detailForStatus: mapEvidence(
        "Approval-required tools or no-action rules put irreversible actions behind a human gate.",
        "Move irreversible tools into approval_required_tools or state that the agent cannot execute them.",
      ),
    }),
    frameworkRow({
      status: mapStatus("human-review", "human-handoff"),
      severity: mapSeverity("human-review", "human-handoff"),
      control: "human_review maps to Microsoft accountability",
      field: "human_review",
      detailForStatus: mapEvidence(
        "Human review triggers define the escalation path for ambiguous, low-confidence, or sensitive cases.",
        "Define review triggers and a named destination for cases the agent should not resolve alone.",
      ),
    }),
    frameworkRow({
      status: mapStatus("scope-boundary", "authority-boundary"),
      severity: mapSeverity("scope-boundary", "authority-boundary"),
      control: "scope.allowed and scope.forbidden map to guardrails",
      field: "scope",
      detailForStatus: mapEvidence(
        "Allowed and forbidden behaviors define the agent's authority boundary.",
        "Add concrete allowed behavior, forbidden behavior, and out-of-authority handling.",
      ),
    }),
    frameworkRow({
      status: mapStatus("contract-shape", "cost-boundary"),
      severity: mapSeverity("contract-shape", "cost-boundary"),
      control: "risk_level and maximum_impact map to risk-tier governance",
      field: "risk_level, maximum_impact",
      detailForStatus: mapEvidence(
        "Worst-case impact is classified with a RihalGuard risk tier.",
        "Classify the agent by its worst-case action and bind exposure with maximum_impact.",
      ),
    }),
    frameworkRow({
      status: mapStatus("runtime-limits", "loop-boundary"),
      severity: mapSeverity("runtime-limits", "loop-boundary"),
      control: "runtime_limits maps to reliability boundaries",
      field: "runtime_limits",
      detailForStatus: mapEvidence(
        "Step, time, or cost limits bound runtime behavior.",
        "Add max_reasoning_steps and either timeout_seconds or max_cost_usd_per_run.",
        "No autonomous loop or runtime execution path was detected in the prompt.",
      ),
    }),
    frameworkRow({
      status: mapStatus("audit"),
      severity: mapSeverity("audit"),
      control: "audit maps to monitored and recorded decisions",
      field: "audit",
      detailForStatus: mapEvidence(
        "Append-only audit events make agent decisions reviewable.",
        "Require append-only records for inputs, tool calls, outputs, review flags, and blocked attempts.",
      ),
    }),
  ];

  if (type === "prompt") {
    return {
      summary:
        "Scored against Microsoft's published agent-governance guidance, with RihalGuard as the companion mapping. Prompt scans only assess the design layer; platform controls remain out of scope.",
      sections: [
        {
          title: "Microsoft - Responsible AI and Cloud Adoption Framework for AI agents",
          badge: "primary",
          source: MICROSOFT_SOURCE_URL,
          description:
            "Maps the prompt to Microsoft's organization-wide governance and security baseline for agents. Platform-enforced controls are marked out of scope rather than guessed.",
          rows: microsoftRows,
        },
        {
          title: "RihalGuard specifications (companion mapping)",
          source: RIHALGUARD_SOURCE_URL,
          description:
            "Shows which RihalGuard contract fields satisfy each Microsoft design-layer control at the prompt layer.",
          rows: rihalGuardRows,
        },
      ],
    };
  }

  return {
    summary:
      "Scored against Microsoft's published agent-governance guidance, with RihalGuard contract fields as the companion mapping. Contract scans inspect rihalguard.json directly.",
    sections: [
      {
        title: "Microsoft - Responsible AI and Cloud Adoption Framework for AI agents",
        badge: "primary",
        source: MICROSOFT_SOURCE_URL,
        description:
          "Maps the contract to Microsoft's organization-wide governance and security baseline for agents. Platform-enforced controls are marked out of scope rather than guessed.",
        rows: microsoftRows,
      },
      {
        title: "RihalGuard specifications (companion mapping)",
        source: "../schema/rihalguard-v1.schema.json",
        description:
          "Shows which RihalGuard fields satisfy each Microsoft design-layer control before runtime integration.",
        rows: rihalGuardRows,
      },
    ],
  };
}

function frameworkRow({ status, severity, control, field, detailForStatus }) {
  return {
    status,
    severity,
    control,
    field,
    detail: detailForStatus(status),
  };
}

function platformRow(control, field, detail) {
  return {
    status: "platform",
    severity: "platform",
    control,
    field,
    detail,
  };
}

function buildReport({ type, determination, score, confidence, failed, gates, scenarios }) {
  return [
    `RihalGuard scanner report`,
    `Input type: ${type}`,
    `Determination: ${determination}`,
    `Score: ${score}%`,
    `Confidence: ${confidence}%`,
    `Failed gates: ${failed.length}/${gates.length}`,
    `Scenarios: ${scenarios.length}`,
    "",
    "Gate results:",
    ...gates.map((item) => `- ${item.status.toUpperCase()} ${item.title} (${item.field}) - ${item.evidence}`),
    "",
    "Failure scenarios:",
    ...(scenarios.length === 0
      ? ["- None detected."]
      : scenarios.map((item) => `- ${item.severity.toUpperCase()} ${item.title} - ${item.body}`)),
  ].join("\n");
}
