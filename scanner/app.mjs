import { ASSESSMENT_EXAMPLES, assessAgentRisk } from "./risk-assessment.mjs";
import { SAMPLES, scanRihalGuard } from "./rules.mjs";

const assessmentPanel = document.querySelector("#assessment-panel");
const resultPanel = document.querySelector("#result-panel");
const modeButtons = [...document.querySelectorAll("[data-mode-button]")];
const assessmentForm = document.querySelector("#assessment-form");
const scanForm = document.querySelector("#scan-form");
const assessButton = document.querySelector("#assess-button");
const clearAssessmentButton = document.querySelector("#clear-assessment-button");
const assessmentSampleSelect = document.querySelector("#assessment-sample-select");
const copyAssessmentContractButton = document.querySelector("#copy-assessment-contract");
const copyAssessmentReportButton = document.querySelector("#copy-assessment-report");
const input = document.querySelector("#scanner-input");
const scanButton = document.querySelector("#scan-button");
const clearButton = document.querySelector("#clear-button");
const sampleSelect = document.querySelector("#sample-select");
const tabButtons = [...document.querySelectorAll("[data-tab-button]")];
const tabPanels = [...document.querySelectorAll("[data-tab-panel]")];
const copyReportButton = document.querySelector("#copy-report");
const copyFixButton = document.querySelector("#copy-fix");

let currentResult = scanRihalGuard("");
let currentAssessment = assessAgentRisk(readAssessmentInput());

function loadSamples() {
  for (const [id, sample] of Object.entries(SAMPLES)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = sample.label;
    sampleSelect.append(option);
  }

  for (const [id, sample] of Object.entries(ASSESSMENT_EXAMPLES)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = sample.label;
    assessmentSampleSelect.append(option);
  }
}

function setMode(mode) {
  const assessmentMode = mode === "assess";
  assessmentForm.hidden = !assessmentMode;
  assessmentPanel.hidden = !assessmentMode;
  scanForm.hidden = assessmentMode;
  resultPanel.hidden = assessmentMode;

  for (const button of modeButtons) {
    const active = button.dataset.modeButton === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
}

function setActiveTab(tabName) {
  for (const button of tabButtons) {
    const active = button.dataset.tabButton === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  }
}

function renderResult(result) {
  currentResult = result;
  resultPanel.classList.toggle("is-empty", result.type === "empty");
  document.querySelector("#determination").textContent = result.determination;
  document.querySelector("#trust-tier").textContent = result.trustTier || "n/a";
  document.querySelector("#confidence").textContent = `${result.confidence}%`;
  document.querySelector("#failed-count").textContent = String(result.failedCount);
  document.querySelector("#input-type").textContent = result.type === "contract" ? "rihalguard.json" : result.type;
  renderGates(result.gates);
  renderRiskRadar(result.riskRadar);
  renderScenarios(result.scenarios);
  renderFrameworks(result.frameworks);
  document.querySelector("#fix-block").textContent = result.fixBlock;
}

function readAssessmentInput() {
  return {
    name: document.querySelector("#agent-name")?.value || "",
    workflowPattern: document.querySelector("#workflow-pattern")?.value || "",
    purpose: document.querySelector("#agent-purpose")?.value || "",
    authority: [...document.querySelectorAll("[data-authority]:checked")].map((node) => node.dataset.authority),
    data: [...document.querySelectorAll("[data-data]:checked")].map((node) => node.dataset.data),
    controls: [...document.querySelectorAll("[data-control]:checked")].map((node) => node.dataset.control),
  };
}

function writeAssessmentInput(values) {
  document.querySelector("#agent-name").value = values.name || "";
  document.querySelector("#workflow-pattern").value = values.workflowPattern || "";
  document.querySelector("#agent-purpose").value = values.purpose || "";
  setCheckedValues("[data-authority]", values.authority || []);
  setCheckedValues("[data-data]", values.data || []);
  setCheckedValues("[data-control]", values.controls || []);
}

function setCheckedValues(selector, values) {
  const selected = new Set(values);
  for (const node of document.querySelectorAll(selector)) {
    node.checked = selected.has(node.dataset.authority || node.dataset.data || node.dataset.control);
  }
}

function renderAssessment(result) {
  currentAssessment = result;
  document.querySelector("#assessment-risk-level").textContent = result.riskLevel;
  document.querySelector("#assessment-risk-name").textContent = result.riskName;
  document.querySelector("#assessment-score").textContent = result.score;
  document.querySelector("#assessment-determination").textContent = result.determination;
  document.querySelector("#assessment-boundary").textContent = result.boundary;
  document.querySelector("#assessment-contract").textContent = JSON.stringify(result.contract, null, 2);
  renderAssessmentRadar(result);
  renderAssessmentBreakdown(result);
}

function renderAssessmentRadar(result) {
  const mount = document.querySelector("#assessment-safety-radar");
  mount.replaceChildren();
  mount.innerHTML = buildAssessmentRadarSvg(buildAssessmentRadar(result));
}

function buildAssessmentRadar(result) {
  const findingScore = (title, fallback = 10) => {
    const item = result.findings.find((finding) => finding.title === title);
    if (!item) return fallback;
    if (item.status !== "gap") return 10;
    return item.severity === "high" ? 3 : 5;
  };
  const humanScores = [];
  const approval = result.findings.find((finding) => finding.title === "Human approval before mutation");
  const handoff = result.findings.find((finding) => finding.title === "Human handoff route");
  if (approval) humanScores.push(approval.status === "gap" ? 3 : 10);
  if (handoff) humanScores.push(handoff.status === "gap" ? 4 : 10);
  const runtimeScores = [findingScore("Loop and cost limits")];
  const rollback = result.findings.find((finding) => finding.title === "Rollback for execution");
  if (rollback) runtimeScores.push(rollback.status === "gap" ? 3 : 10);
  const riskIndex = Number(result.riskLevel.replace("RG-", ""));
  const authorityScore = Math.max(4, 10 - Math.max(0, riskIndex - 3) * 2);

  return [
    { label: "Authority", score: authorityScore },
    { label: "Human Review", score: average(humanScores, 10) },
    { label: "Tool Isolation", score: findingScore("Unknown tools fail closed") },
    { label: "Auditability", score: findingScore("Audit trail") },
    { label: "Runtime Control", score: average(runtimeScores, 10) },
    { label: "Data Safety", score: findingScore("Sensitive data handling", 10) },
  ];
}

function average(values, fallback) {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildAssessmentRadarSvg(axes) {
  const width = 620;
  const height = 430;
  const cx = 310;
  const cy = 210;
  const R = 126;
  const rings = [2, 4, 6, 8, 10];
  const angle = (i) => ((i * 360) / axes.length - 90) * (Math.PI / 180);
  const point = (i, value) => {
    const r = (value / 10) * R;
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ringPolygons = rings
    .map((value) => {
      const points = axes.map((_, i) => point(i, value).join(",")).join(" ");
      return `<polygon points="${points}" class="assessment-radar-ring" />`;
    })
    .join("");
  const spokes = axes
    .map((_, i) => {
      const [x, y] = point(i, 10);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="assessment-radar-spoke" />`;
    })
    .join("");
  const safetyPoints = axes.map((axis, i) => point(i, axis.score).join(",")).join(" ");
  const vertices = axes
    .map((axis, i) => {
      const [x, y] = point(i, axis.score);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="assessment-radar-vertex" />`;
    })
    .join("");
  const labels = axes
    .map((axis, i) => {
      const a = angle(i);
      const lx = cx + (R + 48) * Math.cos(a);
      const ly = cy + (R + 48) * Math.sin(a);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      const dy = sin < -0.5 ? -8 : sin > 0.5 ? 16 : 4;
      return `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" class="assessment-radar-label">${escapeHtml(axis.label)}</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" class="assessment-radar-chart" role="img" aria-label="Safety breakdown radar across six dimensions">${ringPolygons}${spokes}<polygon points="${safetyPoints}" class="assessment-radar-area" />${vertices}${labels}</svg>`;
}

function renderAssessmentBreakdown(result) {
  const mount = document.querySelector("#assessment-breakdown");
  mount.replaceChildren();

  const summary = document.createElement("article");
  summary.className = "assessment-summary-card";
  summary.innerHTML = `
    <span class="status-pill">${escapeHtml(result.riskLevel)}</span>
    <h3>${escapeHtml(result.riskName)}</h3>
    <p>${escapeHtml(result.boundary)}</p>
  `;
  mount.append(summary);

  for (const item of result.findings) {
    const row = document.createElement("article");
    row.className = `gate-card gate-${item.status === "gap" ? "fail" : "pass"}`;
    const icon = item.status === "gap" ? "!" : "✓";
    row.innerHTML = `
      <div class="gate-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="gate-topline">
          <span class="status-pill">${escapeHtml(item.status)}</span>
          <span class="severity">${escapeHtml(item.severity)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.evidence)}</p>
        ${item.status === "gap" ? `<p class="fix">${escapeHtml(item.fix)}</p>` : ""}
      </div>
    `;
    mount.append(row);
  }
}

function renderGates(gates) {
  const list = document.querySelector("#gate-list");
  list.replaceChildren();

  if (gates.length === 0) {
    list.append(emptyState("Paste a system prompt or rihalguard.json to see gate results."));
    return;
  }

  for (const item of gates) {
    const row = document.createElement("article");
    row.className = `gate-card gate-${item.status}`;
    const icon = item.status === "pass" ? "✓" : item.status === "n/a" ? "◇" : "!";
    row.innerHTML = `
      <div class="gate-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="gate-topline">
          <span class="status-pill">${item.status}</span>
          <span class="severity">${item.severity}</span>
          <span class="field">${item.field}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.evidence)}</p>
        ${item.status === "fail" ? `<p class="fix">${escapeHtml(item.fix)}</p>` : ""}
      </div>
    `;
    list.append(row);
  }
}

function renderRiskRadar(radar) {
  const mount = document.querySelector("#risk-radar");
  mount.replaceChildren();

  if (!radar || radar.axes.length === 0) {
    mount.append(emptyState("Risk radar will appear after a scan."));
    return;
  }

  const summary = document.createElement("div");
  summary.className = "radar-summary";
  summary.innerHTML = `
    <div>
      <span class="severity">Overall risk</span>
      <strong class="radar-level radar-level-${radar.level}">${radar.level}</strong>
    </div>
    <div>
      <span class="severity">Average</span>
      <strong>${radar.average} / 10</strong>
    </div>
    <div>
      <span class="severity">High+ axes</span>
      <strong>${radar.criticalCount}</strong>
    </div>
  `;
  mount.append(summary);

  const chartWrap = document.createElement("div");
  chartWrap.className = "radar-card";
  chartWrap.innerHTML = buildRadarSvg(radar);
  mount.append(chartWrap);

  const legend = document.createElement("div");
  legend.className = "radar-legend";
  legend.innerHTML = `
    <span><i class="radar-low"></i>Low (0-3)</span>
    <span><i class="radar-medium"></i>Medium (4-5)</span>
    <span><i class="radar-high"></i>High (6-8)</span>
    <span><i class="radar-critical"></i>Critical (9-10)</span>
  `;
  mount.append(legend);
}

function buildRadarSvg(radar) {
  const width = 560;
  const height = 440;
  const cx = 280;
  const cy = 215;
  const R = 120;
  const rings = [2, 4, 6, 8, 10];
  const n = radar.axes.length;
  const angle = (i) => ((i * 360) / n - 90) * (Math.PI / 180);
  const point = (i, v) => {
    const r = (v / 10) * R;
    const a = angle(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  const ringPolygons = rings
    .map((v) => {
      const pts = radar.axes.map((_, i) => point(i, v).join(",")).join(" ");
      return `<polygon points="${pts}" class="radar-ring" />`;
    })
    .join("");

  const spokes = radar.axes
    .map((_, i) => {
      const [x, y] = point(i, 10);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke" />`;
    })
    .join("");

  const riskPts = radar.axes.map((ax, i) => point(i, ax.risk).join(",")).join(" ");

  const vertices = radar.axes
    .map((ax, i) => {
      const [x, y] = point(i, ax.risk);
      return `<rect x="${(x - 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="6" height="6" class="radar-vertex radar-${ax.status}" />`;
    })
    .join("");

  const labels = radar.axes
    .map((ax, i) => {
      const a = angle(i);
      const lx = cx + (R + 30) * Math.cos(a);
      const ly = cy + (R + 30) * Math.sin(a);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
      let dy = sin < -0.5 ? -10 : sin > 0.5 ? 14 : 4;
      const vy = ly + dy + 14;
      return `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" text-anchor="${anchor}" class="radar-label">${escapeHtml(ax.label)}</text><text x="${lx.toFixed(1)}" y="${vy.toFixed(1)}" text-anchor="${anchor}" class="radar-value radar-${ax.status}">${ax.risk} / 10</text>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" class="radar-chart" role="img" aria-label="Risk radar chart">${ringPolygons}${spokes}<polygon points="${riskPts}" class="radar-area" />${vertices}${labels}</svg>`;
}

function renderFrameworks(frameworks) {
  const list = document.querySelector("#framework-list");
  list.replaceChildren();

  if (!frameworks?.sections?.length) {
    list.append(emptyState("Framework mapping will appear after a scan."));
    return;
  }

  if (frameworks.summary) {
    const summary = document.createElement("p");
    summary.className = "framework-summary";
    summary.textContent = frameworks.summary;
    list.append(summary);
  }

  for (const section of frameworks.sections) {
    const group = document.createElement("section");
    group.className = "framework-group";
    group.innerHTML = `
      <div class="framework-group__header">
        <div>
          <div class="gate-topline">
            ${section.badge ? `<span class="status-pill">${escapeHtml(section.badge)}</span>` : ""}
            <a class="source" href="${escapeAttribute(section.source)}" target="_blank" rel="noopener noreferrer">source</a>
          </div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.description)}</p>
        </div>
      </div>
    `;

    const rows = document.createElement("div");
    rows.className = "framework-rows";
    for (const row of section.rows) {
      const item = document.createElement("article");
      item.className = `framework-card framework-${row.status}`;
      item.innerHTML = `
        <div class="gate-topline">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-pill">${escapeHtml(row.status)}</span>
          <span class="severity">${escapeHtml(row.severity)}</span>
        </div>
        <h4>${escapeHtml(row.control)}</h4>
        <p><strong>${escapeHtml(row.field)}</strong> - ${escapeHtml(row.detail)}</p>
      `;
      rows.append(item);
    }
    group.append(rows);
    list.append(group);
  }
}

function renderScenarios(scenarios) {
  const list = document.querySelector("#scenario-list");
  list.replaceChildren();

  if (scenarios.length === 0) {
    list.append(emptyState("No failed scenarios from this scan."));
    return;
  }

  for (const scenario of scenarios) {
    const row = document.createElement("article");
    row.className = "scenario-card";
    row.innerHTML = `
      <span class="severity">${escapeHtml(scenario.severity)}</span>
      <h3>${escapeHtml(scenario.title)}</h3>
      <p>${escapeHtml(scenario.body)}</p>
      ${scenario.example ? `<p class="scenario-example">${escapeHtml(scenario.example)}</p>` : ""}
      <p class="fix">${escapeHtml(scenario.remediation)}</p>
    `;
    list.append(row);
  }
}

function emptyState(message) {
  const node = document.createElement("p");
  node.className = "empty-state";
  node.textContent = message;
  return node;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

async function copyText(text, button, fallbackSelectionTarget = null) {
  const copied = await writeClipboard(text);
  if (!copied && fallbackSelectionTarget) {
    selectElementText(fallbackSelectionTarget);
  }
  const original = button.textContent;
  button.textContent = copied ? "Copied" : fallbackSelectionTarget ? "Selected" : "Copy failed";
  window.setTimeout(() => {
    button.textContent = original;
  }, copied ? 1200 : 1800);
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy selection path for stricter browser settings.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function selectElementText(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

loadSamples();
renderAssessment(currentAssessment);
renderResult(currentResult);
setMode("assess");
setActiveTab("gates");

assessButton.addEventListener("click", () => renderAssessment(assessAgentRisk(readAssessmentInput())));
clearAssessmentButton.addEventListener("click", () => {
  assessmentSampleSelect.value = "";
  writeAssessmentInput({
    name: "",
    workflowPattern: "",
    purpose: "",
    authority: ["reads_provided_input"],
    data: [],
    controls: ["human_approval", "human_handoff", "audit_trail", "fail_closed_tools", "loop_limits", "data_redaction", "spend_approval"],
  });
  renderAssessment(assessAgentRisk(readAssessmentInput()));
});
assessmentSampleSelect.addEventListener("change", () => {
  const sample = ASSESSMENT_EXAMPLES[assessmentSampleSelect.value];
  if (!sample) return;
  writeAssessmentInput(sample.values);
  renderAssessment(assessAgentRisk(readAssessmentInput()));
});

for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.modeButton));
}

scanButton.addEventListener("click", () => renderResult(scanRihalGuard(input.value)));
clearButton.addEventListener("click", () => {
  input.value = "";
  sampleSelect.value = "";
  renderResult(scanRihalGuard(""));
});
sampleSelect.addEventListener("change", () => {
  const sample = SAMPLES[sampleSelect.value];
  if (!sample) return;
  input.value = sample.value;
  renderResult(scanRihalGuard(input.value));
});

for (const button of tabButtons) {
  button.addEventListener("click", () => setActiveTab(button.dataset.tabButton));
}

copyReportButton.addEventListener("click", () => copyText(currentResult.report, copyReportButton));
copyFixButton.addEventListener("click", () => copyText(currentResult.fixBlock, copyFixButton));
copyAssessmentContractButton.addEventListener("click", () =>
  copyText(
    JSON.stringify(currentAssessment.contract, null, 2),
    copyAssessmentContractButton,
    document.querySelector("#assessment-contract"),
  ),
);
copyAssessmentReportButton.addEventListener("click", () => copyText(currentAssessment.report, copyAssessmentReportButton));
