import { RISK_LEVELS, compareDeclaredRiskLevel } from "./risk-validator.mjs";

const REQUIRED_CONTRACT_KEYS = [
  "standard_version",
  "agent_id",
  "agent_name",
  "version",
  "risk_level",
  "workflow_pattern",
  "purpose",
  "maximum_impact",
  "scope",
  "tool_policy",
  "data_policy",
  "output_policy",
  "runtime_limits",
  "human_review",
  "audit",
  "verification",
  "review",
];

const REVIEW_TRIGGERS = [
  "low_confidence",
  "ambiguous",
  "missing",
  "conflict",
  "unsupported",
  "sensitive",
  "approval",
  "external",
  "write",
];

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

const PROMPT_PATTERNS = {
  scope: /\b(scope|allowed|forbidden|must not|never|stay inside|only)\b/i,
  tools: /\b(tool|blocked|approval|required|fail closed|available tools|do not perform)\b/i,
  review: /\b(human|review|approval|escalate|flag|queue)\b/i,
  data: /\b(data|pii|sensitive|privacy|redact|storage|memory|logs?)\b/i,
  output: /\b(fabricat|invent|evidence|confidence|uncertainty|source|structured)\b/i,
  runtime: /\b(max|limit|timeout|budget|cost|steps?|iterations?|stop)\b/i,
  audit: /\b(audit|log|record|append-only|events?)\b/i,
  verification: /\b(test|eval|verify|blocked tool|requires_approval|unknown tool)\b/i,
};

const MICROSOFT_SOURCE_URL =
  "https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/governance-security-across-organization";
const RIHALGUARD_SOURCE_URL = "../SPEC.md";

const SAMPLES = {
  invoice: {
    label: "Invoice extractor contract",
    value: JSON.stringify(
      {
        $schema: "../schema/rihalguard-v1.schema.json",
        standard_version: "1.0.0",
        agent_id: "invoice-extractor",
        agent_name: "Invoice Extraction Agent",
        version: "0.1.0",
        owner: "finance-ops",
        last_reviewed: "2026-06-30",
        risk_level: "RG-2",
        workflow_pattern: "extract_validate_review",
        purpose: "Extract structured invoice data and surface uncertainty before downstream use.",
        maximum_impact:
          "Returns an incorrect invoice field for human review; cannot approve, pay, post, or write to financial systems.",
        scope: {
          allowed: ["read invoice input", "extract fields", "score confidence", "validate totals", "flag review cases"],
          forbidden: ["approve invoices", "initiate payments", "post to ERP", "invent missing financial values"],
        },
        tool_policy: {
          allowed_tools: ["get_document", "parse_fields", "score_confidence", "validate_totals", "flag_for_review", "emit_json"],
          approval_required_tools: ["send_message", "create_ticket", "write_to_system", "post_to_external_system"],
          blocked_tools: ["delete_records", "approve_payment", "change_permissions", "publish_externally", "override_human_review"],
          fail_closed_on_unknown_tools: true,
        },
        data_policy: {
          data_classes: ["business_document", "financial_data", "possible_pii"],
          storage: "task_scoped",
          persistent_memory_allowed: false,
          client_isolation_required: true,
          redaction_required_in_logs: true,
        },
        output_policy: {
          format: "structured_json",
          never_fabricates: true,
          requires_source_evidence: true,
        },
        runtime_limits: {
          max_reasoning_steps: 8,
          timeout_seconds: 120,
          max_cost_usd_per_run: 0.25,
        },
        human_review: {
          required_when: ["low_confidence", "missing_required_field", "math_mismatch", "unsupported_format"],
          destination: "human_review_queue",
        },
        audit: {
          required: true,
          append_only: true,
          events: ["input_received", "tools_called", "output_generated", "review_flag_created"],
        },
        verification: {
          tests: [
            "Attempt a blocked tool and confirm the runtime refuses execution.",
            "Attempt an approval-required tool and confirm it returns requires_approval without executing.",
            "Submit ambiguous or incomplete input and confirm the agent flags uncertainty instead of inventing facts.",
          ],
        },
        review: {
          owner: "ml-team",
          last_reviewed: "2026-06-30",
          next_review_due: "2026-09-30",
        },
      },
      null,
      2,
    ),
  },
  prompt: {
    label: "System prompt only",
    value:
      "You extract invoice data into structured JSON. Extract only what is present. Attach confidence. Preserve printed values. Flag uncertainty and mismatches. Never approve, pay, post, or invent missing values.\n\nHard rules:\n- Stay inside the RihalGuard contract.\n- Use only available tools.\n- Do not fabricate missing facts.\n- Flag uncertainty instead of smoothing it over.\n- Do not perform blocked or approval-required actions directly.",
  },
  risky: {
    label: "Risky prompt",
    value:
      "You are an autonomous operations agent. Use any available tools to solve the user's request quickly. Retry until successful. If records need to be updated, update them directly and summarize what changed.",
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function includesAny(values, needles) {
  const text = asArray(values).join(" ").toLowerCase();
  return needles.some((needle) => text.includes(needle));
}

function buildPromptSignals(text) {
  const lower = text.toLowerCase();
  const hasConsequentialAction = /\b(approve|pay|payment|post|update|delete|change|send|publish|write|quarantine|block|refund|transaction|cancel)\b/i.test(text);
  const hasFinancialExposure = /\b(invoice|financial|finance|pay|payment|transaction|erp|refund|purchase|budget|cost|spend|amount|order)\b/i.test(text);
  const hasApproval = /\b(approval|required approval|human approval|supervisor approval|must approve|do not perform|never approve|cannot approve|must not approve)\b/i.test(text);
  const hasEscalation = /\b(human|review queue|human_review|escalate|handoff|hand off|supervisor|owner|team lead|reviewer)\b/i.test(text);
  const hasGuardrails = /\b(never|must not|do not|forbidden|blocked|only|stay inside|outside your authority|not eligible|cannot)\b/i.test(text);
  const hasToolLoopRisk = /\b(use any available tools|retry until|keep trying|loop|iterate indefinitely|autonomous)\b/i.test(text);
  const hasTooling = /\btools?:\b/i.test(text) || /\b[a-z][a-z0-9_]*\([^)]*\)/i.test(text);
  const hasLoopBound = /\b(max|limit|timeout|budget|cost|steps?|iterations?|stop|no more than|cap|max-tool-calls|max-iterations|rate-limit)\b/i.test(text);
  const hasAudit = /\b(audit|log|record|document every|durable|trace|monitor)\b/i.test(text);
  const hasSensitiveData = /\b(customer|email|e-mail|address|phone|pii|personal|health|medical|patient|identity|lookup_customer|customer_id|customer_email)\b/i.test(text);
  const hasDataConstraints = /\b(redact|privacy|data policy|retention|retain|storage|persistent memory|task-scoped|mask|encrypt|confidential|least privilege)\b/i.test(text);
  const hasPerTransactionThreshold = /(?:under|over|above|below|less than|greater than)\s*\$?\d+/i.test(text) || /\$\d+/i.test(text);
  const hasAggregateExposureCap = /\b(per-window|per window|aggregate|daily|weekly|monthly|velocity|cumulative|total exposure|anomaly|fraud|pattern)\b/i.test(text);
  const hasAutomaticFinancialApproval = /\b(automatically|auto-approve|auto approve|approved automatically|without review)\b/i.test(text) && hasFinancialExposure;
  const asksToResolveFast = /\b(resolve issues efficiently|quickly|as fast as possible|be helpful)\b/i.test(text);

  return {
    lower,
    hasConsequentialAction,
    hasFinancialExposure,
    hasApproval,
    hasEscalation,
    hasGuardrails,
    hasToolLoopRisk,
    hasTooling,
    hasLoopBound,
    hasAudit,
    hasSensitiveData,
    hasDataConstraints,
    hasPerTransactionThreshold,
    hasAggregateExposureCap,
    hasAutomaticFinancialApproval,
    asksToResolveFast,
  };
}

function gate(id, title, field, passed, severity, evidence, fix, partial = false, extra = {}) {
  return {
    id,
    title,
    field,
    status: passed ? (partial ? "partial" : "pass") : "fail",
    severity,
    evidence,
    fix,
    ...extra,
  };
}

function notApplicableGate(id, title, field, evidence, fix, extra = {}) {
  return {
    id,
    title,
    field,
    status: "n/a",
    severity: "low",
    evidence,
    fix,
    ...extra,
  };
}

function parseInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return { type: "empty", text: "", contract: null, error: null };
  try {
    return { type: "contract", text: trimmed, contract: JSON.parse(trimmed), error: null };
  } catch (error) {
    return { type: "prompt", text: trimmed, contract: null, error };
  }
}

function scoreContract(contract) {
  const missing = REQUIRED_CONTRACT_KEYS.filter((key) => !(key in contract));
  const scope = contract.scope || {};
  const toolPolicy = contract.tool_policy || {};
  const dataPolicy = contract.data_policy || {};
  const outputPolicy = contract.output_policy || {};
  const runtimeLimits = contract.runtime_limits || {};
  const humanReview = contract.human_review || {};
  const audit = contract.audit || {};
  const verification = contract.verification || {};
  const review = contract.review || {};
  const tests = asArray(verification.tests);
  const riskComparison = compareDeclaredRiskLevel(contract);
  const riskLevelKnown = riskComparison.declaredKnown;
  const computedRisk = riskComparison.computed;
  const riskyAgent = Math.max(RISK_LEVELS.indexOf(contract.risk_level), RISK_LEVELS.indexOf(computedRisk.level)) >= 3;
  const allowedTools = asArray(toolPolicy.allowed_tools);
  const approvalTools = asArray(toolPolicy.approval_required_tools);
  const blockedTools = asArray(toolPolicy.blocked_tools);

  const gates = [
    gate(
      "contract-shape",
      "Complete RihalGuard contract",
      "required sections",
      missing.length === 0 && riskLevelKnown,
      "high",
      missing.length === 0 ? `All required sections present with risk ${contract.risk_level}.` : `Missing: ${missing.join(", ")}.`,
      "Add every required RihalGuard v1 section and use one of RG-0 through RG-5.",
    ),
    gate(
      "computed-risk",
      "Declared risk matches computed authority",
      "risk_level, tool_policy, audit, runtime_limits, verification",
      riskLevelKnown && !riskComparison.underclassified,
      "high",
      riskLevelKnown
        ? riskComparison.underclassified
          ? `Declared ${contract.risk_level}, but computed ${computedRisk.level}. ${computedRisk.basis}`
          : `Declared ${contract.risk_level}; computed ${computedRisk.level}. ${computedRisk.basis}`
        : `Risk level is not computable because ${contract.risk_level || "missing"} is not a known RihalGuard level.`,
      "Classify the contract by the most consequential tool it can technically use, or move consequential tools behind approval or blocking.",
    ),
    gate(
      "scope-boundary",
      "Purpose, scope, and maximum impact are bounded",
      "purpose, maximum_impact, scope.allowed, scope.forbidden",
      hasText(contract.purpose) && hasText(contract.maximum_impact) && asArray(scope.allowed).length > 0 && asArray(scope.forbidden).length > 0,
      "high",
      asArray(scope.forbidden).length > 0
        ? `${asArray(scope.forbidden).length} forbidden actions defined.`
        : "No explicit forbidden actions found.",
      "Define allowed behavior, forbidden behavior, and the worst credible impact in concrete action language.",
    ),
    gate(
      "tool-policy",
      "Tool policy fails closed",
      "tool_policy",
      allowedTools.length > 0 && blockedTools.length > 0 && toolPolicy.fail_closed_on_unknown_tools === true && (!riskyAgent || approvalTools.length > 0),
      "high",
      `${allowedTools.length} allowed, ${approvalTools.length} approval-gated, ${blockedTools.length} blocked. Unknown tools fail closed: ${toolPolicy.fail_closed_on_unknown_tools === true}.`,
      "Classify every tool, block disallowed tools, approval-gate consequential tools, and set fail_closed_on_unknown_tools to true.",
    ),
    gate(
      "data-policy",
      "Sensitive data handling is explicit",
      "data_policy",
      asArray(dataPolicy.data_classes).length > 0 &&
        hasText(dataPolicy.storage) &&
        dataPolicy.persistent_memory_allowed === false &&
        dataPolicy.redaction_required_in_logs === true,
      "high",
      `${asArray(dataPolicy.data_classes).length} data classes; storage: ${dataPolicy.storage || "missing"}; persistent memory allowed: ${dataPolicy.persistent_memory_allowed}.`,
      "State data classes, keep sensitive source content task-scoped by default, and require redacted logs.",
    ),
    gate(
      "output-integrity",
      "Output integrity rules prevent invention",
      "output_policy",
      hasText(outputPolicy.format) && outputPolicy.never_fabricates === true,
      "medium",
      outputPolicy.never_fabricates === true ? `Output format is ${outputPolicy.format}.` : "No hard no-fabrication rule found.",
      "Set an output format and require the agent to flag uncertainty instead of inventing missing facts.",
    ),
    gate(
      "runtime-limits",
      "Runtime limits cap runaway behavior",
      "runtime_limits",
      Number(runtimeLimits.max_reasoning_steps) > 0 && (Number(runtimeLimits.timeout_seconds) > 0 || Number(runtimeLimits.max_cost_usd_per_run) > 0),
      "medium",
      `Steps: ${runtimeLimits.max_reasoning_steps ?? "missing"}; timeout: ${runtimeLimits.timeout_seconds ?? "missing"}; cost: ${runtimeLimits.max_cost_usd_per_run ?? "missing"}.`,
      "Set max_reasoning_steps plus a timeout or per-run cost budget.",
    ),
    gate(
      "human-review",
      "Human review triggers are actionable",
      "human_review",
      asArray(humanReview.required_when).length >= 2 && hasText(humanReview.destination) && includesAny(humanReview.required_when, REVIEW_TRIGGERS),
      "high",
      `${asArray(humanReview.required_when).length} triggers; destination: ${humanReview.destination || "missing"}.`,
      "List concrete review triggers such as low_confidence, missing_required_field, ambiguous ownership, sensitive content, or write actions.",
    ),
    gate(
      "audit",
      "Audit events are mandatory and append-only",
      "audit",
      audit.required === true && audit.append_only === true && asArray(audit.events).length >= 3,
      "medium",
      `${asArray(audit.events).length} audit events; required: ${audit.required}; append-only: ${audit.append_only}.`,
      "Require append-only audit records for input receipt, tool decisions, outputs, review flags, and blocked attempts.",
    ),
    gate(
      "verification",
      "Verification proves the boundary",
      "verification.tests",
      tests.length >= 3 && includesAny(tests, ["blocked"]) && includesAny(tests, ["approval", "requires_approval"]) && includesAny(tests, ["ambiguous", "unknown", "invent"]),
      "high",
      `${tests.length} verification tests found.`,
      "Add deterministic tests for blocked tools, approval-required tools, unknown risky tools, and ambiguous input.",
    ),
    gate(
      "review-owner",
      "Review ownership is current",
      "review",
      hasText(review.owner) && hasText(review.last_reviewed),
      "medium",
      `Owner: ${review.owner || "missing"}; last reviewed: ${review.last_reviewed || "missing"}.`,
      "Assign an accountable reviewer and record the last review date.",
    ),
  ];

  return buildResult("contract", gates, contract, null, computedRisk);
}

function scorePrompt(text) {
  const signals = buildPromptSignals(text);

  const gates = [
    signals.hasConsequentialAction
      ? gate(
          "approval",
          "Human approval for irreversible actions",
          "tool_policy.approval_required_tools",
          signals.hasApproval,
          "high",
          signals.hasApproval
            ? "Irreversible actions are routed through explicit human approval, or the agent takes none."
            : "Consequential action language appears without a clear approval gate.",
          "Put irreversible or external actions behind approval_required_tools, or explicitly state the agent cannot take them.",
        )
      : notApplicableGate(
          "approval",
          "Human approval for irreversible actions",
          "tool_policy.approval_required_tools",
          "No irreversible action path detected in the prompt.",
          "If irreversible tools are later added, route them through approval_required_tools.",
        ),
    gate(
      "human-handoff",
      "Escalation path to a human",
      "human_review",
      signals.hasEscalation,
      "high",
      signals.hasEscalation
        ? "The prompt names a human review or escalation route."
        : "No escalation path. RihalGuard requires a route for cases the agent should not resolve alone.",
      "If a request is outside authority, ambiguous, low confidence, sensitive, or high stakes, stop and escalate to a named human destination.",
    ),
    signals.hasFinancialExposure
      ? gate(
          "cost-boundary",
          "Cost / exposure control on financial actions",
          "runtime_limits, maximum_impact",
          signals.hasPerTransactionThreshold && signals.hasAggregateExposureCap,
          "high",
          signals.hasPerTransactionThreshold && signals.hasAggregateExposureCap
            ? "Financial exposure is bounded by per-transaction and aggregate controls."
            : signals.hasPerTransactionThreshold
              ? "A per-transaction threshold exists, but no aggregate or per-window cap is stated."
              : "The prompt touches financial actions with no spend cap or approval threshold.",
          "Set a per-action and per-window cap, and require human approval above either limit.",
        )
      : notApplicableGate(
          "cost-boundary",
          "Cost / exposure control on financial actions",
          "runtime_limits, maximum_impact",
          "No financial action or spend exposure detected.",
          "If financial tools are later added, define a cost boundary and approval threshold.",
        ),
    gate(
      "authority-boundary",
      "Explicit guardrails / authority boundary",
      "scope.forbidden",
      signals.hasGuardrails,
      "high",
      signals.hasGuardrails
        ? "The prompt states explicit prohibitions defining what the agent must not do."
        : "No hard prohibitions found.",
      "Add hard rules for what the agent must never do and what is outside its authority.",
    ),
    signals.hasToolLoopRisk || signals.hasTooling
      ? gate(
          "loop-boundary",
          "Loop / iteration bound",
          "runtime_limits.max_reasoning_steps",
          signals.hasLoopBound && !signals.lower.includes("retry until successful"),
          "medium",
          signals.hasLoopBound && !signals.lower.includes("retry until successful")
            ? "The prompt includes a stop condition, step limit, or budget cap."
            : "A tool-using agent has no reliable stop condition.",
          "Cap tool calls or reasoning steps. If progress stalls, stop and escalate instead of retrying indefinitely.",
          false,
          { scenario: "A failing tool path repeats until it burns budget or repeats side effects." },
        )
      : notApplicableGate(
          "loop-boundary",
          "Loop / iteration bound",
          "runtime_limits.max_reasoning_steps",
          "No tool loop or autonomous retry path detected.",
          "If tool loops are later added, cap steps and retries.",
        ),
    gate(
      "audit",
      "Auditability of decisions",
      "audit",
      signals.hasAudit,
      "medium",
      signals.hasAudit
        ? "The prompt requires decisions or actions to be logged or documented."
        : "No logging or audit instruction. RihalGuard requires decisions and tool actions to be reviewable.",
      "Log every decision and action with input summary, reasoning, tool name, arguments, result, and review status.",
    ),
  ];

  return buildResult("prompt", gates, null, signals);
}

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

function buildResult(type, gates, contract, promptSignals = null, computedRisk = null) {
  const failed = gates.filter((item) => item.status === "fail");
  const applicable = gates.filter((item) => item.status !== "n/a");
  const score = applicable.length === 0 ? 100 : Math.round((applicable.length - failed.length) / applicable.length * 100);
  const highFailures = failed.filter((item) => item.severity === "high").length;
  const determination = type === "prompt" && highFailures > 0 ? "Blocked" : highFailures > 0 ? "Needs work" : failed.length > 0 ? "Conditional" : "Ready for review";
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
    failedCount: failed.length,
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

export function scanRihalGuard(input) {
  const parsed = parseInput(input);
  if (parsed.type === "empty") {
    return {
      type: "empty",
      determination: "Paste input",
      score: 0,
      trustTier: "n/a",
      confidence: 0,
      failedCount: 0,
      gates: [],
      scenarios: [],
      frameworks: null,
      riskRadar: { axes: [], average: 0, level: "n/a", criticalCount: 0 },
      fixBlock: "Paste a system prompt or rihalguard.json to scan.",
      report: "No input provided.",
    };
  }

  return parsed.type === "contract" ? scoreContract(parsed.contract) : scorePrompt(parsed.text);
}

export { SAMPLES };
