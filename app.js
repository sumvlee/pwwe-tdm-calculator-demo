let CONFIG = null;
let EXAMPLES = [];

const ids = [
  "example", "drug", "stage", "pre_seizure_free", "pre_dose", "target_conc",
  "current_dose", "current_conc", "n_tdm"
];

function $(id) {
  return document.getElementById(id);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const header = rows.shift();
  return rows.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

function numberValue(id, name) {
  const value = Number($(id).value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be greater than 0.`);
  }
  return value;
}

function integerValue(id, name) {
  const value = Math.round(Number($(id).value));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be 0 or greater.`);
  }
  return value;
}

function roundUpToIncrement(value, increment, cap) {
  const rounded = Math.ceil(value / increment) * increment;
  return { value: Math.min(rounded, cap), capped: rounded > cap };
}

function logistic(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function estimateRisk(drug, highRisk, rtc) {
  const coefs = CONFIG.risk_model_display_coefficients;
  const exposureDeficit = Math.max(0, 1 - rtc);
  const high = highRisk ? 1 : 0;
  const drugLtg = drug === "LTG" ? 1 : 0;
  const logit = coefs.intercept
    + coefs.high_baseline_risk * high
    + coefs.exposure_deficit * exposureDeficit
    + coefs.interaction_high_risk_x_deficit * high * exposureDeficit
    + coefs.drug_LTG * drugLtg;
  return logistic(logit);
}

function calculate() {
  const drug = $("drug").value;
  const stage = $("stage").value;
  const settings = CONFIG.drug_settings[drug];
  const preDose = numberValue("pre_dose", "Preconception daily dose");
  const targetConc = numberValue("target_conc", "Preconception target trough");
  const currentDose = numberValue("current_dose", "Current daily dose");
  const currentConc = numberValue("current_conc", "Current trough");
  const nTdm = integerValue("n_tdm", "Prior pregnancy TDM measurements");
  const preSeizureFree = $("pre_seizure_free").value === "yes";
  const highRisk = !preSeizureFree;

  const cutoff = Number(settings.rtc_cutoff);
  const cap = Number(settings.dose_cap_mg_day);
  const increment = Number(settings.dose_increment_mg_day);
  const minGate = Number(settings.minimum_preconception_gate_ug_ml);
  const stan = CONFIG.stan_stage_multipliers[drug][stage];
  const stanMult = Number(stan.multiplier);

  const currentRtc = currentConc / targetConc;
  const observedClRatio = (currentDose / preDose) / Math.max(currentRtc, 1e-9);
  const shrinkWeight = nTdm / (nTdm + 2);
  const mapClRatio = Math.exp(
    (1 - shrinkWeight) * Math.log(stanMult)
    + shrinkWeight * Math.log(Math.max(observedClRatio, 1e-9))
  );

  const stanRestoreDose = roundUpToIncrement(preDose * stanMult, increment, cap);
  const stanCutoffDose = roundUpToIncrement(preDose * stanMult * cutoff, increment, cap);
  const goalRtc = highRisk ? 0.90 : cutoff;
  const mapGoalRaw = preDose * mapClRatio * goalRtc;
  let candidateDose;
  let candidateCapped;
  let action;

  if (currentRtc >= goalRtc) {
    candidateDose = currentDose;
    candidateCapped = currentDose > cap;
    action = "Maintain current dose and repeat TDM.";
  } else {
    const rounded = roundUpToIncrement(Math.max(currentDose, mapGoalRaw), increment, cap);
    candidateDose = rounded.value;
    candidateCapped = rounded.capped;
    action = "Increase to the next available dose step and repeat TDM after steady state.";
  }

  const predictedRtc = (candidateDose / preDose) / Math.max(mapClRatio, 1e-9);
  const predictedConc = predictedRtc * targetConc;
  const currentRisk = estimateRisk(drug, highRisk, currentRtc);
  const candidateRisk = estimateRisk(drug, highRisk, predictedRtc);

  const warnings = [];
  if (targetConc < minGate) {
    warnings.push(`Preconception trough is below the cohort minimum gate (${minGate.toFixed(2)} µg/mL).`);
  }
  if (currentRtc < cutoff) {
    warnings.push(`Current RTC is below the drug-specific cut-off (${cutoff.toFixed(2)}).`);
  }
  if (candidateCapped && predictedRtc < goalRtc) {
    warnings.push("Dose cap reached before the selected RTC goal; specialist review is required.");
  }

  return {
    drug, stage, highRisk, cutoff, minGate, stan, stanMult,
    stanRestoreDose, stanCutoffDose, currentRtc, observedClRatio,
    shrinkWeight, mapClRatio, goalRtc, candidateDose, predictedRtc,
    predictedConc, candidateChangeCurrent: (candidateDose / currentDose - 1) * 100,
    candidateChangePre: (candidateDose / preDose - 1) * 100,
    currentRisk, candidateRisk, riskReduction: currentRisk - candidateRisk,
    action, warnings
  };
}

function fmt(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function setText(id, text) {
  $(id).textContent = text;
}

function renderResults() {
  try {
    const res = calculate();
    const badge = $("risk-badge");
    badge.textContent = res.highRisk ? "Higher baseline risk" : "Lower baseline risk";
    badge.className = res.highRisk ? "badge high" : "badge";
    setText("candidate_dose", `${fmt(res.candidateDose, 0)} mg/day`);
    setText("predicted_rtc", fmt(res.predictedRtc, 2));
    setText("predicted_conc", `${fmt(res.predictedConc, 2)} µg/mL`);
    setText("candidate_change", `${res.candidateChangeCurrent >= 0 ? "+" : ""}${fmt(res.candidateChangeCurrent, 0)}%`);
    setText("action", res.action);
    setText("stan_prior", `${fmt(res.stanMult, 2)} (${fmt(res.stan.multiplier_q5, 2)}-${fmt(res.stan.multiplier_q95, 2)})`);
    setText("observed_cl", fmt(res.observedClRatio, 2));
    setText("map_cl", fmt(res.mapClRatio, 2));
    setText("shrinkage", fmt(res.shrinkWeight, 2));
    setText(
      "trace_text",
      `Current RTC ${fmt(res.currentRtc, 2)}; MAP goal ${fmt(res.goalRtc, 2)}; ` +
      `risk display ${fmt(100 * res.currentRisk, 1)}% to ${fmt(100 * res.candidateRisk, 1)}%.`
    );
    setText("min_gate", `${fmt(res.minGate, 2)} µg/mL`);
    setText("rtc_cutoff", fmt(res.cutoff, 2));
    setText("goal_rtc", fmt(res.goalRtc, 2));
    setText("model_version", CONFIG.model_version);

    const warnings = $("warnings");
    warnings.innerHTML = "";
    if (res.warnings.length === 0) {
      const ok = document.createElement("div");
      ok.className = "ok";
      ok.textContent = "No automated warning triggered by the prototype thresholds.";
      warnings.appendChild(ok);
    } else {
      res.warnings.forEach((message) => {
        const div = document.createElement("div");
        div.className = "warning";
        div.textContent = message;
        warnings.appendChild(div);
      });
    }
  } catch (error) {
    setText("candidate_dose", "-");
    setText("predicted_rtc", "-");
    setText("predicted_conc", "-");
    setText("candidate_change", "-");
    setText("action", error.message);
  }
}

function applyExample(id) {
  const row = EXAMPLES.find((item) => item.example_id === id);
  if (!row) return;
  $("drug").value = row.drug;
  $("stage").value = row.stage;
  $("pre_seizure_free").value = row.preconception_seizure_free_9m.toLowerCase() === "yes" ? "yes" : "no";
  $("pre_dose").value = row.preconception_daily_dose_mg;
  $("target_conc").value = row.preconception_target_trough_ug_ml;
  $("current_dose").value = row.current_daily_dose_mg;
  $("current_conc").value = row.current_trough_ug_ml;
  $("n_tdm").value = row.n_prior_tdm;
  renderResults();
}

async function init() {
  const [configResponse, examplesResponse] = await Promise.all([
    fetch("data/model_config.json"),
    fetch("data/deidentified_examples.csv")
  ]);
  CONFIG = await configResponse.json();
  EXAMPLES = parseCsv(await examplesResponse.text());

  const exampleSelect = $("example");
  EXAMPLES.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.example_id;
    option.textContent = `${row.example_id}: ${row.display_label}`;
    exampleSelect.appendChild(option);
  });

  exampleSelect.addEventListener("change", () => applyExample(exampleSelect.value));
  ids.filter((id) => id !== "example").forEach((id) => {
    $(id).addEventListener("input", renderResults);
    $(id).addEventListener("change", renderResults);
  });
  applyExample(EXAMPLES[0].example_id);
}

init().catch((error) => {
  document.body.innerHTML = `<main class="layout"><section class="panel"><h1>Could not load demo</h1><p>${error.message}</p></section></main>`;
});
