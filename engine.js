/* Independent sparse-TDM MAP model and candidate rules; no absolute dose ceiling. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PWWE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function positive(value, name) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${name} must be numeric.`);
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a finite number greater than 0.`);
    return n;
  }
  function stageValue(stage) {
    if (!['T1', 'T2', 'T3'].includes(stage)) throw new Error('Stage must be T1, T2 or T3.');
    return stage;
  }
  function populationLog(config, drug, stage, high) {
    stageValue(stage);
    if (!['LEV','LTG'].includes(drug)) throw new Error('Drug must be LEV or LTG.');
    const ltg = Number(drug === 'LTG'), t2 = Number(stage === 'T2'), t3 = Number(stage === 'T3');
    const x = {intercept:1, drug_LTG:ltg, T2:t2, T3:t3, high_baseline_risk:Number(high),
      LTG_T2:ltg*t2, LTG_T3:ltg*t3, high_T2:Number(high)*t2, high_T3:Number(high)*t3};
    return Object.entries(x).reduce((s,[key,value]) => s+config.map_model.coefficients[key]*value,0);
  }
  function updateMap(config, drug, high, stage, baselineDose, target, observations) {
    const omega2 = positive(config.map_model.omega2,'MAP between-pair variance');
    const sigma2 = positive(config.map_model.sigma2,'MAP residual variance');
    if (!Array.isArray(observations) || observations.length === 0) throw new Error('At least one TDM observation is required.');
    let residualSum = 0;
    for (const row of observations) {
      const rtc = positive(row.concentration,'TDM concentration')/target;
      const observed = (positive(row.dose,'TDM daily dose')/baselineDose)/rtc;
      residualSum += Math.log(Math.max(observed,1e-6))-populationLog(config,drug,row.stage,high);
    }
    const posteriorVariance=1/(1/omega2+observations.length/sigma2);
    const eta=(residualSum/sigma2)*posteriorVariance;
    const popLog=populationLog(config,drug,stage,high);
    return {population_cl_ratio:Math.exp(popLog),map_cl_ratio:Math.exp(popLog+eta),eta_map:eta,
      posterior_sd:Math.sqrt(posteriorVariance),n_tdm:observations.length,
      shrink_weight:observations.length*omega2/(sigma2+observations.length*omega2)};
  }
  function chooseCandidate(config, drug, high, current, rtc, margin) {
    const step=config.drug_settings[drug].dose_increment_mg_day;
    const cutoff=config.drug_settings[drug].rtc_cutoff;
    const rules=config.candidate_rules;
    let r=0,k=0,branch='maintain';
    if (high && rtc<cutoff) {r=rules.high_risk_relative_increase;k=rules.high_risk_steps;branch='high_below_threshold';}
    else if (high && rtc<rules.high_risk_no_increase) {r=rules.warning_relative_increase;k=rules.warning_steps;branch='high_warning';}
    else if (!high && rtc<rules.low_risk_floor) {r=rules.warning_relative_increase;k=rules.warning_steps;branch='low_warning';}
    const up=x=>Math.ceil(x/step)*step;
    const candidate=r ? Math.min(up(Math.max(current,margin)),up(Math.min(current*(1+r),current+k*step))) : current;
    return {candidate_dose:candidate,relative_parameter:r,max_steps:k,decision_branch:branch};
  }
  function calculate(config, payload) {
    if ('n_tdm' in payload) throw new Error('Provide actual TDM history instead of a measurement count.');
    const drug=payload.drug,stage=stageValue(payload.stage);
    if (!['LEV','LTG'].includes(drug)) throw new Error('Drug must be LEV or LTG.');
    if (!['yes','no'].includes(payload.pre_seizure_free)) throw new Error('Select yes or no for preconception seizure freedom.');
    const high=payload.pre_seizure_free==='no';
    const pre=positive(payload.pre_dose,'Preconception daily dose'),target=positive(payload.target_conc,'Target trough');
    const current=positive(payload.current_dose,'Current daily dose'),conc=positive(payload.current_conc,'Current trough');
    const history=payload.history===undefined ? [] : payload.history;
    if (!Array.isArray(history)) throw new Error('TDM history must be a list of measurements.');
    const observations=[...history,{stage,dose:current,concentration:conc}];
    const map=updateMap(config,drug,high,stage,pre,target,observations);
    const rtc=conc/target,cutoff=config.drug_settings[drug].rtc_cutoff;
    const factor=high ? cutoff : config.candidate_rules.low_risk_floor;
    const restore=pre*map.map_cl_ratio,margin=restore*factor;
    const decision=chooseCandidate(config,drug,high,current,rtc,margin);
    const candidate=decision.candidate_dose;
    const result={drug,stage,high_risk:high,...map,...decision,current_rtc:rtc,
      observed_cl_ratio:(current/pre)/rtc,lower_rtc_factor:factor,cutoff,
      restore_raw:restore,margin_raw:margin,increment_mg_day:candidate-current,
      candidate_change_current:(candidate/current-1)*100,predicted_rtc:rtc*candidate/current,
      predicted_conc:conc*candidate/current,model_version:config.model_version};
    for (const [key,value] of Object.entries(result)) {
      if (typeof value==='number' && !Number.isFinite(value)) throw new Error(`Inputs exceed the numeric range for ${key}.`);
    }
    if (candidate<current) throw new Error('Candidate calculation unexpectedly reduced the dose.');
    result.action=candidate>current ? 'Candidate increase under the study rules; confirm with clinical review and repeat TDM.' : 'No candidate increase under the study rules; reassess with repeat TDM.';
    result.warnings=[];
    if (decision.relative_parameter>0 && result.candidate_change_current>100*decision.relative_parameter+1e-9)
      result.warnings.push(`Upward rounding makes the final increase exceed the ${100*decision.relative_parameter}% pre-rounding parameter.`);
    if (rtc<cutoff) result.warnings.push(`Observed RTC is below the drug-specific threshold (${cutoff.toFixed(2)}).`);
    if (result.predicted_rtc<factor) result.warnings.push('Predicted RTC remains below the selected exposure boundary after this candidate step.');
    return result;
  }
  return {populationLog,updateMap,chooseCandidate,calculate};
});
