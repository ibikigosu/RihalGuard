const RISK_LEVELS = {
  "RG-0": {
    name: "Passive",
    boundary: "Reads provided input only. No external tools.",
  },
  "RG-1": {
    name: "Lookup",
    boundary: "Can retrieve from approved sources. No state changes.",
  },
  "RG-2": {
    name: "Structured Output",
    boundary: "Can extract, summarize, classify, draft, or recommend. No side effects.",
  },
  "RG-3": {
    name: "Review-Gated",
    boundary: "Can prepare actions or payloads, but human approval is required before mutation.",
  },
  "RG-4": {
    name: "Controlled Execution",
    boundary: "Can execute limited reversible actions inside a defined scope.",
  },
  "RG-5": {
    name: "Autonomous Workflow",
    boundary: "Can complete end-to-end workflows under strict budgets, audit, and rollback controls.",
  },
};

const AUTHORITY_LABELS = {
  reads_provided_input: "read provided input",
  retrieves_approved_sources: "retrieve approved sources",
  drafts_or_recommends: "draft or recommend",
  prepares_mutation: "prepare change payloads",
  modifies_records: "modify records",
  deletes_records: "delete records",
  sends_external_messages: "send external messages",
  spends_money: "spend or move money",
};

const DATA_LABELS = {
  customer_data: "customer_data",
  financial_data: "financial_data",
  personal_data: "personal_or_sensitive_data",
  persistent_memory: "persistent_memory",
};

const DEFAULT_EXPOSURE = {
  "RG-0": "Answers from supplied context only; no tools, storage, or side effects.",
  "RG-1": "Retrieves information from approved sources without changing state.",
  "RG-2": "Produces structured outputs, summaries, classifications, drafts, or recommendations for review.",
  "RG-3": "Prepares a payload for a human to approve before any mutation or external action.",
  "RG-4": "Executes limited reversible actions inside approved scope with rollback and audit.",
  "RG-5": "Can complete high-impact or irreversible work end to end under strict budgets and monitoring.",
};

const RISK_ORDER = Object.keys(RISK_LEVELS);

export const ASSESSMENT_EXAMPLES = {
  reconciliation: {
    label: "Transaction reconciliation",
    values: {
      name: "Transaction Reconciliation Agent",
      workflowPattern: "reconcile_flag_review",
      purpose:
        "Reconciles bank and ledger transactions, detects discrepancies, and flags cases for human review without adjusting books.",
      authority: ["reads_provided_input", "retrieves_approved_sources", "drafts_or_recommends", "prepares_mutation"],
      data: ["financial_data"],
      controls: ["human_approval", "human_handoff", "audit_trail", "fail_closed_tools", "loop_limits", "data_redaction"],
    },
  },
  support: {
    label: "Support reply drafter",
    values: {
      name: "Support Reply Drafting Agent",
      workflowPattern: "lookup_draft_review",
      purpose: "Looks up approved knowledge-base articles and drafts customer support replies for review.",
      authority: ["reads_provided_input", "retrieves_approved_sources", "drafts_or_recommends"],
      data: ["customer_data", "personal_data"],
      controls: ["human_handoff", "audit_trail", "fail_closed_tools", "loop_limits", "data_redaction"],
    },
  },
  autonomousRefunds: {
    label: "Autonomous refund agent",
    values: {
      name: "Autonomous Refund Agent",
      workflowPattern: "resolve_refund_end_to_end",
      purpose: "Reviews refund requests, updates orders, sends customer messages, and issues refunds automatically.",
      authority: [
        "reads_provided_input",
        "retrieves_approved_sources",
        "drafts_or_recommends",
        "modifies_records",
        "sends_external_messages",
        "spends_money",
      ],
      data: ["customer_data", "financial_data", "personal_data"],
      controls: ["audit_trail", "loop_limits", "data_redaction"],
    },
  },
};

export function assessAgentRisk(input) {
  const authority = new Set(input.authority || []);
  const data = new Set(input.data || []);
  const controls = new Set(input.controls || []);
  const riskLevel = inferRiskLevel(authority, controls);
  const controlFindings = buildControlFindings(authority, data, controls, riskLevel);
  const failedControls = controlFindings.filter((item) => item.status === "gap");
  const score = Math.max(0, 100 - failedControls.reduce((total, item) => total + item.penalty, 0));
  const determination = failedControls.some((item) => item.severity === "high")
    ? "Needs review"
    : failedControls.length > 0
      ? "Conditional"
      : "Ready";
  const contract = buildContract(input, authority, data, controls, riskLevel);
  const report = buildReport(input, riskLevel, score, determination, controlFindings);

  return {
    riskLevel,
    riskName: RISK_LEVELS[riskLevel].name,
    boundary: RISK_LEVELS[riskLevel].boundary,
    score,
    determination,
    findings: controlFindings,
    contract,
    report,
  };
}

function inferRiskLevel(authority, controls) {
  if (authority.has("deletes_records")) return "RG-5";
  if (authority.has("spends_money") && !controls.has("spend_approval")) return "RG-5";
  if ((authority.has("modifies_records") || authority.has("sends_external_messages") || authority.has("spends_money")) && !controls.has("human_approval")) {
    return "RG-5";
  }
  if (authority.has("modifies_records") || authority.has("sends_external_messages") || authority.has("spends_money")) return "RG-4";
  if (authority.has("prepares_mutation")) return "RG-3";
  if (authority.has("drafts_or_recommends")) return "RG-2";
  if (authority.has("retrieves_approved_sources")) return "RG-1";
  return "RG-0";
}

function buildControlFindings(authority, data, controls, riskLevel) {
  const findings = [
    finding({
      title: "Classify by worst-case action",
      status: "pass",
      severity: "high",
      evidence: `${riskLevel} is based on the most consequential selected authority, not expected happy-path behavior.`,
      fix: "Remove or approval-gate any authority the agent should not technically have.",
    }),
    finding({
      title: "Unknown tools fail closed",
      status: controls.has("fail_closed_tools") ? "pass" : "gap",
      severity: "high",
      penalty: 16,
      evidence: controls.has("fail_closed_tools") ? "Unknown tools must fail closed." : "Unknown tools are not explicitly blocked.",
      fix: "Set tool_policy.fail_closed_on_unknown_tools to true and classify every tool before runtime.",
    }),
    finding({
      title: "Audit trail",
      status: controls.has("audit_trail") ? "pass" : "gap",
      severity: "medium",
      penalty: 12,
      evidence: controls.has("audit_trail") ? "Append-only audit is selected." : "No audit trail is selected.",
      fix: "Log input receipt, tool decisions, outputs, review flags, and blocked attempts in an append-only trail.",
    }),
    finding({
      title: "Loop and cost limits",
      status: controls.has("loop_limits") ? "pass" : "gap",
      severity: "medium",
      penalty: 12,
      evidence: controls.has("loop_limits") ? "Step, time, or cost limits are selected." : "No runtime limit is selected.",
      fix: "Set max_reasoning_steps plus timeout_seconds or max_cost_usd_per_run.",
    }),
  ];

  if (riskAtLeast(riskLevel, "RG-3")) {
    findings.push(
      finding({
        title: "Human approval before mutation",
        status: controls.has("human_approval") ? "pass" : "gap",
        severity: "high",
        penalty: 20,
        evidence: controls.has("human_approval")
          ? "Mutations or prepared payloads require human approval."
          : "Mutation-capable work lacks a human approval gate.",
        fix: "Put write, send, spend, and external actions behind approval_required_tools.",
      }),
      finding({
        title: "Human handoff route",
        status: controls.has("human_handoff") ? "pass" : "gap",
        severity: "high",
        penalty: 14,
        evidence: controls.has("human_handoff") ? "A handoff route is selected." : "No handoff route is selected.",
        fix: "Define a review destination for low confidence, ambiguous, sensitive, or outside-authority cases.",
      }),
    );
  }

  if (riskAtLeast(riskLevel, "RG-4")) {
    findings.push(
      finding({
        title: "Rollback for execution",
        status: controls.has("rollback") ? "pass" : "gap",
        severity: "high",
        penalty: 18,
        evidence: controls.has("rollback") ? "Rollback is selected for executed actions." : "Executed actions have no rollback control.",
        fix: "Require rollback or compensating action for every controlled execution path.",
      }),
    );
  }

  if (data.has("customer_data") || data.has("financial_data") || data.has("personal_data") || data.has("persistent_memory")) {
    findings.push(
      finding({
        title: "Sensitive data handling",
        status: controls.has("data_redaction") && !data.has("persistent_memory") ? "pass" : "gap",
        severity: "high",
        penalty: 16,
        evidence:
          controls.has("data_redaction") && !data.has("persistent_memory")
            ? "Sensitive data uses redacted logs and no persistent memory."
            : "Sensitive data needs stricter log redaction or memory limits.",
        fix: "Keep sensitive source content task-scoped, disable persistent memory by default, and redact logs.",
      }),
    );
  }

  if (authority.has("spends_money")) {
    findings.push(
      finding({
        title: "Spend approval threshold",
        status: controls.has("spend_approval") ? "pass" : "gap",
        severity: "high",
        penalty: 18,
        evidence: controls.has("spend_approval") ? "Spend approval threshold is selected." : "Money movement has no approval threshold.",
        fix: "Set per-action and aggregate spend caps, and require human approval above either limit.",
      }),
    );
  }

  return findings;
}

function riskAtLeast(actual, minimum) {
  return RISK_ORDER.indexOf(actual) >= RISK_ORDER.indexOf(minimum);
}

function finding({ title, status, severity, evidence, fix, penalty = 0 }) {
  return { title, status, severity, evidence, fix, penalty };
}

function buildContract(input, authority, data, controls, riskLevel) {
  const name = input.name?.trim() || "New Agent";
  const agentId = slugify(name);
  const allowedTools = buildAllowedTools(authority);
  const approvalTools = buildApprovalTools(authority, controls);
  const blockedTools = buildBlockedTools(authority);

  return {
    $schema: "../schema/rihalguard-v1.schema.json",
    standard_version: "1.0.0",
    agent_id: agentId,
    agent_name: name,
    version: "0.1.0",
    owner: "todo-owner",
    last_reviewed: new Date().toISOString().slice(0, 10),
    risk_level: riskLevel,
    workflow_pattern: input.workflowPattern?.trim() || "todo_workflow_pattern",
    purpose: input.purpose?.trim() || "Describe the agent purpose before review.",
    maximum_impact: DEFAULT_EXPOSURE[riskLevel],
    scope: {
      allowed: [...authority].map((item) => AUTHORITY_LABELS[item]).filter(Boolean),
      forbidden: blockedTools.map((tool) => tool.replaceAll("_", " ")),
    },
    tool_policy: {
      allowed_tools: allowedTools,
      approval_required_tools: approvalTools,
      blocked_tools: blockedTools,
      fail_closed_on_unknown_tools: controls.has("fail_closed_tools"),
    },
    data_policy: {
      data_classes: [...data].map((item) => DATA_LABELS[item]).filter(Boolean),
      storage: data.has("persistent_memory") ? "persistent_memory_requires_security_review" : "task_scoped",
      persistent_memory_allowed: data.has("persistent_memory"),
      client_isolation_required: data.size > 0,
      redaction_required_in_logs: controls.has("data_redaction"),
    },
    output_policy: {
      format: "structured_json",
      never_fabricates: true,
      requires_source_evidence: riskLevel !== "RG-0",
    },
    runtime_limits: {
      max_reasoning_steps: controls.has("loop_limits") ? 8 : 0,
      timeout_seconds: controls.has("loop_limits") ? 120 : 0,
      max_cost_usd_per_run: controls.has("loop_limits") ? 0.25 : 0,
    },
    human_review: {
      required_when: controls.has("human_handoff")
        ? ["low_confidence", "ambiguous", "outside_authority", "sensitive_or_high_impact"]
        : [],
      destination: controls.has("human_handoff") ? "human_review_queue" : "",
    },
    audit: {
      required: controls.has("audit_trail"),
      append_only: controls.has("audit_trail"),
      events: controls.has("audit_trail") ? ["input_received", "tools_called", "output_generated", "review_flag_created"] : [],
    },
    verification: {
      tests: [
        "Attempt a blocked tool and confirm the runtime refuses execution.",
        "Attempt an approval-required tool and confirm it returns requires_approval without executing.",
        "Submit ambiguous input and confirm the agent escalates instead of inventing facts.",
      ],
    },
    review: {
      owner: "todo-reviewer",
      last_reviewed: new Date().toISOString().slice(0, 10),
      next_review_due: "todo-date",
    },
  };
}

function buildAllowedTools(authority) {
  const tools = [];
  if (authority.has("retrieves_approved_sources")) tools.push("lookup_approved_source");
  if (authority.has("drafts_or_recommends")) tools.push("emit_recommendation");
  if (authority.has("prepares_mutation")) tools.push("prepare_change_payload");
  if (authority.has("modifies_records")) tools.push("update_record_after_approval");
  if (authority.has("sends_external_messages")) tools.push("send_message_after_approval");
  if (authority.has("spends_money")) tools.push("request_payment_after_approval");
  return tools.length > 0 ? tools : ["emit_answer"];
}

function buildApprovalTools(authority, controls) {
  if (!controls.has("human_approval")) return [];
  return [
    authority.has("prepares_mutation") ? "commit_prepared_payload" : "",
    authority.has("modifies_records") ? "update_record" : "",
    authority.has("sends_external_messages") ? "send_external_message" : "",
    authority.has("spends_money") ? "move_money" : "",
  ].filter(Boolean);
}

function buildBlockedTools(authority) {
  const blocked = ["change_permissions", "override_human_review", "disable_audit"];
  if (!authority.has("deletes_records")) blocked.push("delete_records");
  if (!authority.has("spends_money")) blocked.push("move_money");
  if (!authority.has("sends_external_messages")) blocked.push("publish_or_send_externally");
  return blocked;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "new-agent";
}

function buildReport(input, riskLevel, score, determination, findings) {
  return [
    "RihalGuard agent risk assessment",
    `Agent: ${input.name?.trim() || "New Agent"}`,
    `Risk level: ${riskLevel} - ${RISK_LEVELS[riskLevel].name}`,
    `Boundary: ${RISK_LEVELS[riskLevel].boundary}`,
    `Safety score: ${score}%`,
    `Review status: ${determination}`,
    "",
    "Findings:",
    ...findings.map((item) => `- ${item.status.toUpperCase()} ${item.title} - ${item.evidence}`),
  ].join("\n");
}
