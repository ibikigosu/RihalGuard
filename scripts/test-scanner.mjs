#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assessAgentRisk } from "../scanner/risk-assessment.mjs";
import { computeContractRiskLevel, compareDeclaredRiskLevel } from "../scanner/risk-validator.mjs";
import { scanRihalGuard } from "../scanner/rules.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function assessment(overrides = {}) {
  return assessAgentRisk({
    name: "Test Agent",
    workflowPattern: "test_review_execute",
    purpose: "Exercise deterministic scanner behavior.",
    authority: ["reads_provided_input"],
    data: [],
    controls: ["human_approval", "human_handoff", "audit_trail", "fail_closed_tools", "loop_limits"],
    ...overrides,
  });
}

const gatedMutation = assessment({ authority: ["modifies_records"] });
assert.equal(gatedMutation.riskLevel, "RG-3");
assert.equal(gatedMutation.determination, "Control-ready draft");
assert.deepEqual(gatedMutation.contract.tool_policy.allowed_tools, ["prepare_update_payload"]);
assert.deepEqual(gatedMutation.contract.tool_policy.approval_required_tools, ["update_record"]);

const controlledMutation = assessment({
  authority: ["modifies_records"],
  controls: ["human_handoff", "audit_trail", "fail_closed_tools", "loop_limits", "rollback"],
});
assert.equal(controlledMutation.riskLevel, "RG-4");
assert.deepEqual(controlledMutation.contract.tool_policy.allowed_tools, ["update_record"]);

const autonomousMutation = assessment({
  authority: ["modifies_records"],
  controls: ["human_handoff", "audit_trail", "fail_closed_tools", "loop_limits"],
});
assert.equal(autonomousMutation.riskLevel, "RG-5");

const spendApprovalOnly = assessment({
  authority: ["spends_money"],
  controls: ["spend_approval", "human_handoff", "audit_trail", "fail_closed_tools", "loop_limits"],
});
assert.equal(spendApprovalOnly.riskLevel, "RG-3");

const approvalOnlyContract = {
  tool_policy: { allowed_tools: [], approval_required_tools: ["delete_record"] },
};
const approvalOnlyManifest = {
  tools: [{ name: "delete_record", authority: "write", external_side_effects: true }],
};
assert.equal(computeContractRiskLevel(approvalOnlyContract, approvalOnlyManifest).level, "RG-3");

const executionManifest = {
  tools: [
    {
      name: "update_record",
      authority: "write",
      external_side_effects: true,
      reversibility: "irreversible",
    },
  ],
};
assert.equal(computeContractRiskLevel(controlledMutation.contract, executionManifest).level, "RG-5");
executionManifest.tools[0].reversibility = "reversible";
assert.equal(computeContractRiskLevel(controlledMutation.contract, executionManifest).level, "RG-4");

const draftScan = scanRihalGuard(JSON.stringify(gatedMutation.contract));
assert.equal(draftScan.gates.find((gate) => gate.id === "review-owner")?.status, "fail");
assert.equal(draftScan.gates.find((gate) => gate.id === "human-review")?.status, "fail");

const passiveDraft = assessment();
assert.deepEqual(passiveDraft.contract.data_policy.data_classes, ["provided_input"]);
assert.deepEqual(passiveDraft.contract.tool_policy.allowed_tools, []);
const passiveScan = scanRihalGuard(JSON.stringify(passiveDraft.contract));
assert.equal(passiveScan.computedRisk.level, "RG-0");
assert.equal(passiveScan.gates.find((gate) => gate.id === "tool-policy")?.status, "pass");

const blueprintDirectories = readdirSync(resolve(root, "blueprints"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
for (const directory of blueprintDirectories) {
  const contract = JSON.parse(readFileSync(resolve(root, "blueprints", directory.name, "rihalguard.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(root, "blueprints", directory.name, "tools.json"), "utf8"));
  const riskComparison = compareDeclaredRiskLevel(contract, manifest);
  assert.equal(riskComparison.computed.level, contract.risk_level, `${directory.name} manifest-backed risk`);
  assert.equal(riskComparison.underclassified, false, `${directory.name} is not underclassified`);
  const result = scanRihalGuard(JSON.stringify(contract));
  const outputGate = result.gates.find((gate) => gate.id === "output-integrity");
  const reviewGate = result.gates.find((gate) => gate.id === "human-review");
  assert.equal(outputGate?.status, "pass", `${directory.name} output-integrity gate`);
  assert.equal(reviewGate?.status, "pass", `${directory.name} human-review gate`);
  const issues = result.gates.filter(
    (gate) => !["pass", "n/a"].includes(gate.status) && !(gate.id === "computed-risk" && gate.status === "partial"),
  );
  assert.deepEqual(issues, [], `${directory.name} scanner issues`);
}

console.log("PASS scanner risk, placeholder, output-policy, and review-trigger checks");
