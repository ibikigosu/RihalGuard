export const RISK_LEVELS = ["RG-0", "RG-1", "RG-2", "RG-3", "RG-4", "RG-5"];

const MUTATION_TOOL_PATTERN =
  /(^|[_-])(approve|cancel|charge|commit|delete|deploy|disable|drop|execute|grant|modify|pay|post|publish|purge|quarantine|refund|remove|revoke|rollback|scale|send|shutdown|spend|terminate|transfer|truncate|update|wire)(\b|[_-])|create[_-]?(case|record|ticket|transaction|user)|move[_-]?money|write[_-]?to[_-]?system/i;

const REVIEW_GATED_TOOL_PATTERN =
  /(^|[_-])(prepare|propose|request|stage)([_-]?(change|mutation|payment|refund|send|write|update|payload|action))?(\b|[_-])/i;

const LOOKUP_TOOL_PATTERN = /^(fetch|get|lookup|query|read|retrieve|search|validate|verify)(\b|[_-])/i;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function riskIndex(level) {
  return RISK_LEVELS.indexOf(level);
}

function boundedAutonomousExecution(contract) {
  const audit = contract.audit || {};
  const runtimeLimits = contract.runtime_limits || {};
  const verification = contract.verification || {};
  return (
    audit.required === true &&
    audit.append_only === true &&
    asArray(audit.events).length >= 3 &&
    Number(runtimeLimits.max_reasoning_steps) > 0 &&
    (Number(runtimeLimits.timeout_seconds) > 0 || Number(runtimeLimits.max_cost_usd_per_run) > 0) &&
    asArray(verification.tests).length >= 3
  );
}

export function computeContractRiskLevel(contract) {
  const toolPolicy = contract?.tool_policy || {};
  const allowedTools = asArray(toolPolicy.allowed_tools);

  if (allowedTools.length === 0) {
    return {
      level: "RG-0",
      computable: true,
      basis: "No allowed tools are declared.",
    };
  }

  const autonomousMutations = allowedTools.filter((tool) => MUTATION_TOOL_PATTERN.test(tool));
  if (autonomousMutations.length > 0) {
    const bounded = boundedAutonomousExecution(contract);
    return {
      level: bounded ? "RG-4" : "RG-5",
      computable: true,
      basis: `Autonomous consequential tool(s) [${autonomousMutations.join(", ")}] are in allowed_tools${
        bounded ? " with declared audit, runtime, and verification bounds." : " without complete audit, runtime, and verification bounds."
      }`,
    };
  }

  const reviewGatedTools = allowedTools.filter((tool) => REVIEW_GATED_TOOL_PATTERN.test(tool));
  if (reviewGatedTools.length > 0) {
    return {
      level: "RG-3",
      computable: true,
      basis: `Allowed tool(s) prepare or request approval-gated action [${reviewGatedTools.join(", ")}].`,
    };
  }

  const lookupOnly = allowedTools.every((tool) => LOOKUP_TOOL_PATTERN.test(tool));
  return {
    level: lookupOnly ? "RG-1" : "RG-2",
    computable: true,
    basis: lookupOnly
      ? "Allowed tools are read or validation oriented, with no declared mutation path."
      : "Allowed tools produce structured output, classifications, drafts, or recommendations without declared mutation.",
  };
}

export function compareDeclaredRiskLevel(contract) {
  const declared = contract?.risk_level || "";
  const declaredIndex = riskIndex(declared);
  const computed = computeContractRiskLevel(contract);
  const computedIndex = riskIndex(computed.level);

  return {
    declared,
    computed,
    declaredKnown: declaredIndex >= 0,
    underclassified: declaredIndex >= 0 && computedIndex > declaredIndex,
  };
}
