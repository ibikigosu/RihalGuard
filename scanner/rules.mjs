import { RISK_LEVELS, compareDeclaredRiskLevel } from "./risk-validator.mjs";
import { buildResult } from "./result-builder.mjs";
import { SAMPLES } from "./samples.mjs";

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasResolvedText(value) {
  if (!hasText(value)) return false;
  return !/^(todo|replace|tbd)(?:$|[-_ ])/i.test(value.trim());
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
  const triggerDefinitions = asArray(humanReview.trigger_definitions);
  const triggerIds = new Set(triggerDefinitions.map((definition) => definition?.id).filter(hasText));
  const triggerDefinitionsComplete =
    triggerDefinitions.length === asArray(humanReview.required_when).length &&
    asArray(humanReview.required_when).every((trigger) => triggerIds.has(trigger)) &&
    triggerDefinitions.every(
      (definition) =>
        ["machine", "judgment"].includes(definition?.evaluation) &&
        definition?.condition != null &&
        ["route_for_review", "block_and_route", "require_approval"].includes(definition?.action),
    );
  const unsupportedClaimPolicy = outputPolicy.unsupported_claim_policy || {};
  const preciseUnsupportedClaimPolicy =
    hasText(unsupportedClaimPolicy.behavior) &&
    typeof unsupportedClaimPolicy.creative_drafting_allowed === "boolean" &&
    typeof unsupportedClaimPolicy.generated_content_label_required === "boolean";

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
      computedRisk.heuristic === true,
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
      (contract.risk_level === "RG-0" ? allowedTools.length === 0 : allowedTools.length > 0) &&
        blockedTools.length > 0 &&
        toolPolicy.fail_closed_on_unknown_tools === true &&
        (!riskyAgent || approvalTools.length > 0 || RISK_LEVELS.indexOf(contract.risk_level) >= 4),
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
      hasText(outputPolicy.format) && (preciseUnsupportedClaimPolicy || outputPolicy.never_fabricates === true),
      "medium",
      preciseUnsupportedClaimPolicy
        ? `Unsupported claims use ${unsupportedClaimPolicy.behavior}; creative drafting allowed: ${unsupportedClaimPolicy.creative_drafting_allowed}.`
        : outputPolicy.never_fabricates === true
          ? `Legacy never_fabricates is set for output format ${outputPolicy.format}.`
          : "No unsupported-claim behavior found.",
      "Define unsupported_claim_policy with missing-evidence behavior, creative-drafting permission, and generated-content labeling.",
      outputPolicy.never_fabricates === true && !preciseUnsupportedClaimPolicy,
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
      asArray(humanReview.required_when).length >= 2 &&
        hasResolvedText(humanReview.destination) &&
        includesAny(humanReview.required_when, REVIEW_TRIGGERS),
      "high",
      `${asArray(humanReview.required_when).length} triggers; destination: ${humanReview.destination || "missing"}.`,
      "List concrete review triggers, define their evaluation conditions, and name a real human destination.",
      !triggerDefinitionsComplete,
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
      tests.length >= 3 &&
        includesAny(tests, ["block"]) &&
        (approvalTools.length === 0 || includesAny(tests, ["approval", "requires_approval"])) &&
        includesAny(tests, ["ambiguous", "unknown", "invent"]) &&
        (RISK_LEVELS.indexOf(contract.risk_level) < 4 || includesAny(tests, ["scope", "execution", "rollback"])),
      "high",
      `${tests.length} verification tests found.`,
      "Add deterministic tests for blocked tools, approval-required tools, unknown tools, and ambiguous input.",
    ),
    gate(
      "review-owner",
      "Review ownership is current",
      "owner, review",
      hasResolvedText(contract.owner) && hasResolvedText(review.owner) && hasText(review.last_reviewed),
      "medium",
      `Agent owner: ${contract.owner || "missing"}; governance reviewer: ${review.owner || "missing"}; last reviewed: ${review.last_reviewed || "missing"}.`,
      "Assign accountable agent and governance ownership, then record the last review date.",
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
