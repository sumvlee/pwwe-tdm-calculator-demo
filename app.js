'use strict';
let CONFIG=null, EXAMPLES=[], historyCounter=0;
const $=id=>document.getElementById(id);
const fields=['drug','stage','pre_seizure_free','pre_dose','target_conc','current_dose','current_conc'];
const outputs=['candidate_dose','increment','candidate_change','predicted_rtc','population_cl','observed_cl','map_cl','n_tdm_used','rtc_cutoff','goal_rtc','predicted_conc','model_version'];
const fmt=(n,d=2)=>Number(n).toFixed(d);
const dose=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;else cell+=ch;
    } else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
    else if(ch!=='\r')cell+=ch;
  }
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length)return [];
  const headers=rows.shift();return rows.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]??''])));
}
function payload() {
  const data=Object.fromEntries(fields.map(id=>[id,$(id).value]));
  data.history=Array.from($('history').children).map(row=>({
    stage:row.querySelector('[data-field="stage"]').value,
    dose:row.querySelector('[data-field="dose"]').value,
    concentration:row.querySelector('[data-field="concentration"]').value
  }));
  if(data.history.some(row=>row.stage>data.stage))throw new Error('An earlier measurement cannot be in a later trimester than the current visit.');
  return data;
}
function clearResults(message) {
  outputs.forEach(id=>$(id).textContent='—');
  ['trace_text','stan_context','action'].forEach(id=>$(id).textContent='');
  $('warnings').replaceChildren();$('risk-badge').textContent='Input incomplete';$('risk-badge').className='badge';
  $('input-error').textContent=message;
}
function renderResults() {
  if(!CONFIG)return;
  try {
    const input=payload(),res=PWWE.calculate(CONFIG,input);
    $('input-error').textContent='';
    const values={candidate_dose:`${dose(res.candidate_dose)} mg/day`,increment:`+${dose(res.increment_mg_day)} mg/day`,
      candidate_change:`+${fmt(res.candidate_change_current)}%`,predicted_rtc:fmt(res.predicted_rtc,3),
      population_cl:fmt(res.population_cl_ratio,3),observed_cl:fmt(res.observed_cl_ratio,3),map_cl:fmt(res.map_cl_ratio,3),
      n_tdm_used:String(res.n_tdm),rtc_cutoff:fmt(res.cutoff),goal_rtc:fmt(res.lower_rtc_factor),
      predicted_conc:`${fmt(res.predicted_conc)} µg/mL`,model_version:res.model_version};
    Object.entries(values).forEach(([id,value])=>$(id).textContent=value);
    $('risk-badge').textContent=res.high_risk?'Higher baseline risk':'Lower baseline risk';
    $('risk-badge').className=res.high_risk?'badge high':'badge';
    $('action').textContent=res.action;
    $('trace_text').textContent=`Current RTC ${fmt(res.current_rtc,3)}; data weight ${fmt(res.shrink_weight,3)}. MAP uses the current measurement plus ${input.history.length} supplied earlier measurement(s).`;
    $('warnings').replaceChildren();
    res.warnings.forEach(text=>{const p=document.createElement('p');p.className='warning';p.textContent=text;$('warnings').append(p);});
    const stan=CONFIG.stan_stage_multipliers[input.drug][input.stage];
    $('stan_context').textContent=`${input.drug} ${input.stage}: ${fmt(stan.multiplier)} (90% CrI ${fmt(stan.multiplier_q5)}–${fmt(stan.multiplier_q95)}).`;
  }catch(error){clearResults(error.message);}
}
function addHistory() {
  const id=++historyCounter,row=document.createElement('div');row.className='history-row';
  // Template contains only fixed UI text and an internal numeric ID, not user input.
  row.innerHTML=`<div class="grid two"><label>Earlier stage<select data-field="stage" aria-label="Earlier stage ${id}"><option>T1</option><option>T2</option><option>T3</option></select></label><label>Daily dose (mg/day)<input data-field="dose" aria-label="Earlier dose ${id}" type="number" min="0" step="any"></label><label>Trough (µg/mL)<input data-field="concentration" aria-label="Earlier trough ${id}" type="number" min="0" step="any"></label></div><button type="button">Remove measurement</button>`;
  row.querySelector('select').value=$('stage').value;
  row.querySelector('button').addEventListener('click',()=>{row.remove();renderResults();});
  row.addEventListener('input',renderResults);row.addEventListener('change',renderResults);
  $('history').append(row);$('history-note').textContent='';renderResults();
}
function applyExample() {
  const row=EXAMPLES.find(x=>x.example_id===$('example').value);if(!row)return;
  const values={drug:row.drug,stage:row.stage,pre_seizure_free:row.preconception_seizure_free_9m.toLowerCase(),
    pre_dose:row.preconception_daily_dose_mg,target_conc:row.preconception_target_trough_ug_ml,
    current_dose:row.current_daily_dose_mg,current_conc:row.current_trough_ug_ml};
  Object.entries(values).forEach(([id,value])=>$(id).value=value);
  $('history').replaceChildren();$('history-note').textContent='Example loaded with one current measurement; no earlier measurements have been invented.';
  renderResults();
}
async function init() {
  const responses=await Promise.all([fetch('data/model_config.json',{cache:'no-store'}),fetch('data/deidentified_examples.csv',{cache:'no-store'})]);
  if(responses.some(r=>!r.ok))throw new Error('Unable to load the model configuration or examples.');
  CONFIG=await responses[0].json();EXAMPLES=parseCsv(await responses[1].text());
  if(!EXAMPLES.length)throw new Error('No examples were loaded.');
  $('example').replaceChildren();
  for(const row of EXAMPLES){const option=document.createElement('option');option.value=row.example_id;option.textContent=`${row.example_id}: ${row.display_label}`;$('example').append(option);}
  $('example').disabled=false;$('example').addEventListener('change',applyExample);
  fields.forEach(id=>{
    $(id).addEventListener('input',renderResults);
    $(id).addEventListener('change',()=>{
      if(id==='drug'&&$('history').children.length){$('history').replaceChildren();$('history-note').textContent='Earlier measurements cleared because the selected drug changed.';}
      renderResults();
    });
  });
  $('add-history').addEventListener('click',addHistory);applyExample();
}
init().catch(error=>clearResults(error.message));
