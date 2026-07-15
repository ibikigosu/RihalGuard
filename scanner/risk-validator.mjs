export const RISK_LEVELS = ["RG-0", "RG-1", "RG-2", "RG-3", "RG-4", "RG-5"];

const MUTATION_TOOL_PATTERN =
  /(^|[_-])(approve|cancel|charge|commit|delete|deploy|disable|drop|execute|grant|modify|pay|post|publish|purge|quarantine|refund|remove|revoke|rollback|scale|send|shutdown|spend|terminate|transfer|truncate|update|wire)(\b|[_-])|create[_-]?(case|record|ticket|transaction|user)|move[_-]?money|write[_-]?to[_-]?system/i;

const REVIEW_GATED_TOOL_PATTERN =
  /(^|[_-])(prepare|propose|request|stage)([_-]?(change|mutation|payment|refund|send|write|update|payload|action))?(\b|[_-])/i;

const LOOKUP_TOOL_PATTERN = /^(fetch|get|lookup|query|read|retrieve|search|validate|verify)(\b|[_-])/i;
const EXECUTION_AUTHORITIES = new Set(["write", "external_action", "permission_change", "money_movement"]);
const REVERSIBLE_EXECUTION = new Set(["reversible", "compensating_action"]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function riskIndex(level) {
  return RISK_LEVELS.indexOf(level);
}

function boundedAutonomousExecution(contract, executionTools = []) {
  const audit = contract.audit || {};
  const runtimeLimits = contract.runtime_limits || {};
  const verification = contract.verification || {};
  const tests = asArray(verification.tests);
  const recoveryVerified = tests.some((test) => /\b(rollback|revers|compensat)/i.test(test));
  const executionIsRecoverable = executionTools.every((tool) => REVERSIBLE_EXECUTION.has(tool.reversibility));
  return (
    audit.required === true &&
    audit.append_only === true &&
    asArray(audit.events).length >= 3 &&
    Number(runtimeLimits.max_reasoning_steps) > 0 &&
    (Number(runtimeLimits.timeout_seconds) > 0 || Number(runtimeLimits.max_cost_usd_per_run) > 0) &&
    tests.length >= 3 &&
    recoveryVerified &&
    executionIsRecoverable
  );
}

function computeFromManifest(contract, manifest) {
  const allowedTools = asArray(contract?.tool_policy?.allowed_tools);
  const approvalTools = asArray(contract?.tool_policy?.approval_required_tools);
  const manifestTools = asArray(manifest?.tools);
  if (manifestTools.length === 0) return null;

  const byName = new Map(manifestTools.map((tool) => [tool.name, tool]));
  const missing = [...allowedTools, ...approvalTools].filter((toolName) => !byName.has(toolName));
  if (missing.length > 0) return null;

  const allowedMetadata = allowedTools.map((toolName) => byName.get(toolName));
  const approvalMetadata = approvalTools.map((toolName) => byName.get(toolName));
  const executionTools = allowedMetadata.filter(
    (tool) => tool.external_side_effects === true || EXECUTION_AUTHORITIES.has(tool.authority),
  );
  if (executionTools.length > 0) {
    const bounded = boundedAutonomousExecution(contract, executionTools);
    return {
      level: bounded ? "RG-4" : "RG-5",
      computable: true,
      heuristic: false,
      basis: `Reviewed manifest declares execution authority for [${executionTools.map((tool) => tool.name).join(", ")}]${
        bounded ? " with declared audit, runtime, and verification bounds." : " without complete audit, runtime, and verification bounds."
      }`,
    };
  }

  const preparedMutationTools = allowedMetadata.filter((tool) => tool.authority === "prepare_mutation");
  if (preparedMutationTools.length > 0 || approvalMetadata.length > 0) {
    const gatedNames = [...preparedMutationTools, ...approvalMetadata].map((tool) => tool.name);
    return {
      level: "RG-3",
      computable: true,
      heuristic: false,
      basis: `Reviewed manifest declares review-gated authority for [${[...new Set(gatedNames)].join(", ")}].`,
    };
  }

  const readOnly = allowedMetadata.every((tool) => tool.authority === "read");
  return {
    level: readOnly ? "RG-1" : "RG-2",
    computable: true,
    heuristic: false,
    basis: readOnly
      ? "Reviewed manifest contains read-only tools and no mutation path."
      : "Reviewed manifest contains transforms or structured-output tools and no mutation path.",
  };
}

export function computeContractRiskLevel(contract, manifest = null) {
  const toolPolicy = contract?.tool_policy || {};
  const allowedTools = asArray(toolPolicy.allowed_tools);
  const approvalTools = asArray(toolPolicy.approval_required_tools);

  if (allowedTools.length === 0 && approvalTools.length === 0) {
    return {
      level: "RG-0",
      computable: true,
      heuristic: false,
      basis: "No allowed tools are declared.",
    };
  }

  const manifestResult = computeFromManifest(contract, manifest);
  if (manifestResult) return manifestResult;

  const autonomousMutations = allowedTools.filter((tool) => MUTATION_TOOL_PATTERN.test(tool));
  if (autonomousMutations.length > 0) {
    const bounded = boundedAutonomousExecution(contract);
    return {
      level: bounded ? "RG-4" : "RG-5",
      computable: true,
      heuristic: true,
      basis: `Autonomous consequential tool(s) [${autonomousMutations.join(", ")}] are in allowed_tools${
        bounded ? " with declared audit, runtime, and verification bounds." : " without complete audit, runtime, and verification bounds."
      }`,
    };
  }

  const reviewGatedTools = allowedTools.filter((tool) => REVIEW_GATED_TOOL_PATTERN.test(tool));
  if (reviewGatedTools.length > 0 || approvalTools.length > 0) {
    const gatedNames = [...reviewGatedTools, ...approvalTools];
    return {
      level: "RG-3",
      computable: true,
      heuristic: true,
      basis: `Contract declares review-gated tool(s) [${[...new Set(gatedNames)].join(", ")}].`,
    };
  }

  const lookupOnly = allowedTools.every((tool) => LOOKUP_TOOL_PATTERN.test(tool));
  return {
    level: lookupOnly ? "RG-1" : "RG-2",
    computable: true,
    heuristic: true,
    basis: lookupOnly
      ? "No tool manifest was supplied; tool names appear read or validation oriented, with no declared mutation path."
      : "No tool manifest was supplied; tool names appear to produce structured output, classifications, drafts, or recommendations without declared mutation.",
  };
}

export function compareDeclaredRiskLevel(contract, manifest = null) {
  const declared = contract?.risk_level || "";
  const declaredIndex = riskIndex(declared);
  const computed = computeContractRiskLevel(contract, manifest);
  const computedIndex = riskIndex(computed.level);

  return {
    declared,
    computed,
    declaredKnown: declaredIndex >= 0,
    underclassified: declaredIndex >= 0 && computedIndex > declaredIndex,
  };
}
