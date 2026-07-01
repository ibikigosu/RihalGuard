#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDeclaredRiskLevel } from "../scanner/risk-validator.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function defaultContracts() {
  return readdirSync(resolve(root, "blueprints"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, "blueprints", entry.name, "rihalguard.json"));
}

const files = args.length > 0 ? args.map((path) => resolve(process.cwd(), path)) : defaultContracts();
const failures = [];

for (const file of files) {
  let contract;
  try {
    contract = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`${file}: ${error.message}`);
    continue;
  }

  const result = compareDeclaredRiskLevel(contract);
  const relative = file.startsWith(root) ? file.slice(root.length + 1) : file;

  if (!result.declaredKnown) {
    failures.push(`${relative}: unknown declared risk level ${result.declared || "(missing)"}`);
    console.log(`FAIL ${relative}: declared ${result.declared || "missing"} -> computed ${result.computed.level}`);
    continue;
  }

  if (result.underclassified) {
    failures.push(`${relative}: declared ${result.declared} -> computed ${result.computed.level}`);
    console.log(`FAIL ${relative}: declared ${result.declared} -> computed ${result.computed.level}`);
    console.log(`  ${result.computed.basis}`);
    continue;
  }

  const label = result.declared === result.computed.level ? result.declared : `${result.declared} >= ${result.computed.level}`;
  console.log(`PASS ${relative}: ${label}`);
}

if (failures.length > 0) {
  console.log("\nRisk tier validation failed:");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`\n${files.length}/${files.length} RihalGuard risk tiers valid`);
