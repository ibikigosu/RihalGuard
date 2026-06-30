import { SAMPLES, scanRihalGuard } from "./rules.mjs";

const input = document.querySelector("#scanner-input");
const scanButton = document.querySelector("#scan-button");
const clearButton = document.querySelector("#clear-button");
const sampleSelect = document.querySelector("#sample-select");
const resultPanel = document.querySelector("#result-panel");
const tabButtons = [...document.querySelectorAll("[data-tab-button]")];
const tabPanels = [...document.querySelectorAll("[data-tab-panel]")];
const copyReportButton = document.querySelector("#copy-report");
const copyFixButton = document.querySelector("#copy-fix");

let currentResult = scanRihalGuard("");

function loadSamples() {
  for (const [id, sample] of Object.entries(SAMPLES)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = sample.label;
    sampleSelect.append(option);
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

async function copyText(text, button) {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

loadSamples();
renderResult(currentResult);
setActiveTab("gates");

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
