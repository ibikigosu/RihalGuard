import assert from "node:assert/strict";
import { SAMPLES, scanRihalGuard } from "./rules.mjs";

const contractResult = scanRihalGuard(SAMPLES.invoice.value);
assert.equal(contractResult.type, "contract");
assert.equal(contractResult.determination, "Ready for review");
assert.equal(contractResult.failedCount, 0);
assert.equal(contractResult.score, 100);
assert.equal(contractResult.gates.length, 10);
assert.ok(contractResult.report.includes("RihalGuard scanner report"));

const promptResult = scanRihalGuard(SAMPLES.prompt.value);
assert.equal(promptResult.type, "prompt");
assert.equal(promptResult.determination, "Blocked");
assert.equal(promptResult.trustTier, "RG-2");
assert.equal(promptResult.failedCount, 3);
assert.equal(promptResult.confidence, 82);
assert.deepEqual(
  promptResult.gates.map((gate) => [gate.id, gate.status]),
  [
    ["approval", "pass"],
    ["human-handoff", "fail"],
    ["cost-boundary", "fail"],
    ["authority-boundary", "pass"],
    ["loop-boundary", "n/a"],
    ["audit", "fail"],
  ],
);
assert.deepEqual(
  promptResult.scenarios.map((scenario) => scenario.id),
  ["missing-audit-trail", "no-human-fallback"],
);
assert.ok(promptResult.fixBlock.includes("RIHALGUARD REMEDIATION BLOCK"));
assert.ok(promptResult.fixBlock.includes("ESCALATION PATH TO A HUMAN"));
assert.ok(promptResult.fixBlock.includes("COST / EXPOSURE CONTROL"));

const riskyResult = scanRihalGuard(SAMPLES.risky.value);
assert.equal(riskyResult.type, "prompt");
assert.ok(riskyResult.failedCount >= 5);
assert.equal(riskyResult.determination, "Blocked");
assert.ok(riskyResult.scenarios.some((scenario) => scenario.id === "unbounded-tool-loop"));
assert.ok(riskyResult.scenarios.some((scenario) => scenario.id === "missing-approval-gate"));

const refundPrompt = `You are a Customer Refund and Returns Agent for AcmeCorp.
ROLE: Process customer refund requests, verify order eligibility, and approve or deny returns within policy guidelines.
TOOLS:
- lookup_customer(customer_id)
- verify_order(order_id)
- process_refund(order_id, amount)
- cancel_order(order_id)
- send_email(customer_email, subject, body)
- escalate_case(case_id, reason)
GUIDELINES:
- Refunds under $50 can be approved automatically
- Refunds over $50 require supervisor approval
- Orders older than 90 days are not eligible
- Always verify customer identity before processing
Be helpful and resolve issues efficiently.`;
const refundResult = scanRihalGuard(refundPrompt);
assert.equal(refundResult.type, "prompt");
assert.equal(refundResult.determination, "Blocked");
assert.deepEqual(
  refundResult.scenarios.map((scenario) => scenario.id),
  [
    "sub-threshold-financial-abuse",
    "unbounded-tool-loop",
    "sensitive-data-without-constraints",
    "missing-audit-trail",
  ],
);
assert.ok(refundResult.report.includes("Scenarios: 4"));

const malformedContract = scanRihalGuard(JSON.stringify({ agent_id: "thin-agent", risk_level: "RG-9" }));
assert.equal(malformedContract.type, "contract");
assert.equal(malformedContract.determination, "Needs work");
assert.ok(malformedContract.gates.find((gate) => gate.id === "contract-shape").status === "fail");

console.log("scanner rules passed");
