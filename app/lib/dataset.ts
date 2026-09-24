import { isMissing, summarizeColumn } from './column-profile.ts';
export { isMissing } from './column-profile.ts';
export type Dataset = { name: string; headers: string[]; rows: string[][]; totalRows?: number; sampled?: boolean };

export function profileDataset(data: Dataset, target: string, task: string) {
  return data.headers.map((name, index) => {
    const values = data.rows.map(row => row[index]).filter(value => !isMissing(value));
    const { counts, numeric, mean, min, max } = summarizeColumn(values);
    const top = [...counts].sort((a,b) => b[1] - a[1]).slice(0,5);
    const warnings: string[] = [];
    if (counts.size === 1) warnings.push('Constant column: may add no predictive information.');
    if (name !== target && /(^id$|_id$|uuid)/i.test(name) && counts.size === values.length && values.length > 1) warnings.push('Unique identifier: review entity-based splitting and whether this feature belongs in the model.');
    const targetIndex = data.headers.indexOf(target);
    if (name !== target && targetIndex >= 0 && values.length >= 3 && data.rows.every(row => !isMissing(row[index]) && !isMissing(row[targetIndex]) && row[index] === row[targetIndex])) warnings.push('Exact target copy: review for possible leakage; confirm when this feature becomes available.');
    if (name === target && task === 'classification' && top.length && top[0][1] / values.length >= .7) warnings.push(`Largest class is ${(top[0][1] / values.length * 100).toFixed(1)}% of nonmissing labels. Check per-class recall and macro F1.`);
    if (name === target && task === 'regression' && !numeric) warnings.push('Regression target contains nonnumeric values or has no observations. Check task and target selection.');
    return { name, type: numeric ? 'Numeric' : values.length ? 'Categorical / text' : 'Empty', missing: data.rows.length - values.length, distinct: counts.size, mean, min, max, top, warnings };
  });
}
export function compareDatasets(train: Dataset, other: Dataset, target: string, task = 'classification') {
  const messages: string[] = [];
  const missing = train.headers.filter(h => !other.headers.includes(h));
  const extra = other.headers.filter(h => !train.headers.includes(h));
  if (missing.length) messages.push(`Missing columns: ${missing.join(', ')}. A production target may legitimately be unavailable.`);
  if (extra.length) messages.push(`Additional columns: ${extra.join(', ')}.`);
  const features = train.headers.filter(h => h !== target);
  if (features.length && features.every(h => other.headers.includes(h))) {
    const signature = (data: Dataset, row: string[]) => JSON.stringify(features.map(h => row[data.headers.indexOf(h)]));
    const known = new Set(train.rows.map(row => signature(train,row)));
    const overlap = other.rows.filter(row => known.has(signature(other,row))).length;
    messages.push(`${overlap} of ${other.rows.length} rows match training feature values exactly (target excluded). Overlap is a review signal, not proof of leakage.`);
  } else messages.push('Feature overlap was not checked because the feature schemas differ or no features were selected.');
  for (const h of train.headers.filter(h => other.headers.includes(h))) {
    const ti=train.headers.indexOf(h), oi=other.headers.indexOf(h);
    const a=train.rows.map(r=>r[ti]), b=other.rows.map(r=>r[oi]);
    const delta = b.filter(isMissing).length / b.length - a.filter(isMissing).length / a.length;
    if (Math.abs(delta) >= .1) messages.push(`${h}: missingness changes by ${(delta*100).toFixed(1)} percentage points relative to training.`);
    const known = new Set(a.filter(v=>!isMissing(v)));
    const observed = b.filter(v=>!isMissing(v));
    const unseen = observed.filter(v=>!known.has(v)).length;
    if (known.size <= 50 && known.size > 0 && !a.filter(v=>!isMissing(v)).every(v=>Number.isFinite(Number(v))) && unseen) messages.push(`${h}: ${unseen} of ${observed.length} nonmissing values were not observed in training.`);
  }
  const pa=profileDataset(train,target,'comparison'), pb=profileDataset(other,target,'comparison');
  for(const a of pa) {
    const b=pb.find(p=>p.name===a.name);
    if(a.mean!==undefined && b?.mean!==undefined && a.min!==undefined && a.max!==undefined) {
      const range=a.max-a.min;
      if(Math.abs(b.mean-a.mean)>Math.max(range*.2,1e-12)) messages.push(`${a.name}: mean changes from ${a.mean.toPrecision(4)} to ${b.mean.toPrecision(4)} (more than 20% of the training range). Compare distributions before inferring shift.`);
    }
  }
  if (task === 'classification' && target && train.headers.includes(target) && other.headers.includes(target)) {
    const a = train.rows.map(r => r[train.headers.indexOf(target)]).filter(v => !isMissing(v));
    const b = other.rows.map(r => r[other.headers.indexOf(target)]).filter(v => !isMissing(v));
    if (a.length && b.length) {
      const counts = (values: string[]) => { const map = new Map<string,number>(); for (const value of values) map.set(value,(map.get(value) ?? 0)+1); return map; };
      const ac = counts(a), bc = counts(b);
      const changed = [...new Set([...ac.keys(), ...bc.keys()])].map(label => ({label, delta:(bc.get(label) ?? 0)/b.length-(ac.get(label) ?? 0)/a.length})).filter(p => Math.abs(p.delta)>=.1).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));
      for (const item of changed.slice(0,10)) messages.push('Target class "'+item.label+'": share changes by '+(item.delta*100).toFixed(1)+' percentage points among nonmissing labels.');
      if(changed.length>10) messages.push('Showing the ten largest target-share changes.');
    }
  }
  return messages;
}

export type Diagnosis = { id: string; title: string; support: string[]; conflicts: string[]; missing: string[]; question: string; experiment: string; score: number; rationale: string };
export type ContextAnswers = { sameRun?: string; available?: string; comparable?: string };
export function diagnose(
  experiment: { source: string; findings: { title: string; evidence: string; experiment: string; strength: string }[] } | null,
  datasets: Partial<Record<'Training' | 'Validation' | 'Production', Dataset>>,
  target: string,
  task: string,
  answers: ContextAnswers = {},
): Diagnosis[] {
  const items = new Map<string, Diagnosis>();
  function add(id: string, title: string, support: string, score: number, experiment: string) {
    const item = items.get(id) ?? { id, title, support: [], conflicts: [], missing: [], question: '', experiment, score: 0, rationale: '' };
    if (!item.support.includes(support)) { item.support.push(support); item.score = Math.max(item.score, score); }
    items.set(id,item);
  }
  const key = (title: string) => /imbalance/i.test(title) ? 'imbalance' : /shift/i.test(title) ? 'shift' : /leakage|Repeated/i.test(title) ? 'leakage' : /missing/i.test(title) ? 'missing' : title.toLowerCase().replace(/\s+/g,'-');
  if (experiment) for (const f of experiment.findings) add(key(f.title), f.title, `${experiment.source}: ${f.evidence}`, f.strength === 'Observed' ? 3 : f.strength === 'Supported' ? 2 : 1, f.experiment);
  const train = datasets.Training;
  if (train) {
    const profiles = profileDataset(train,target,task);
    const missing = profiles.reduce((sum,p)=>sum+p.missing,0);
    if (missing) add('missing','Missing data needs review',`${train.name}: ${missing} missing cells across ${train.rows.length} rows.`,3,'Inspect missingness by split and fit any imputation only on training data.');
    const t = profiles.find(p=>p.name===target);
    if (task==='classification' && t && t.top.length && t.top[0][1]/(train.rows.length-t.missing)>=.7) add('imbalance','Possible class imbalance',`${train.name}: target ${target}, class "${t.top[0][0]}" has ${(100*t.top[0][1]/(train.rows.length-t.missing)).toFixed(1)}% of nonmissing labels.`,3,'Compare per-class recall and macro F1 to a majority-class baseline; test class weighting on an unchanged holdout.');
    if (task==='classification' && t && t.top.length && t.top[0][1]/(train.rows.length-t.missing)<.7 && items.has('imbalance')) items.get('imbalance')!.conflicts.push(`${train.name}: largest selected target class is below 70%; this does not corroborate the reported majority share.`);
    for (const p of profiles) if (p.warnings.some(w=>w.startsWith('Exact target copy'))) add('leakage','Possible data leakage',`${train.name}: column ${p.name} exactly copies target ${target} in all ${train.rows.length} rows.`,3,'Remove the suspect feature and retrain on the same split. Audit when the feature becomes available and whether entities overlap across splits.');
    const val=datasets.Validation;
    if(val && target) {
      const features=train.headers.filter(h=>h!==target);
      if(features.length && features.every(h=>val.headers.includes(h))) {
        const signature=(d:Dataset,r:string[])=>JSON.stringify(features.map(h=>r[d.headers.indexOf(h)]));
        const known=new Set(train.rows.map(r=>signature(train,r)));
        const count=val.rows.filter(r=>known.has(signature(val,r))).length;
        if(count) add('leakage','Possible data leakage',`${val.name}: ${count}/${val.rows.length} validation feature rows exactly match ${train.name}; target excluded. Repeated observations may be legitimate.`,3,'Audit duplicate entities and feature availability. Re-split by entity and compare held-out performance.');
        else if(items.has('leakage'))items.get('leakage')!.conflicts.push('No exact training/validation feature-row overlap detected. This does not rule out other leakage.');
      }
    }
    const prod=datasets.Production;
    if(prod) {
      for(const message of compareDatasets(train,prod,target,task).filter(m=>/mean changes|missingness changes|Target class|not observed in training/.test(m))) add('shift','Possible distribution shift',`${prod.name} vs ${train.name}: ${message}`,2,'Evaluate a labeled production holdout with identical preprocessing and metrics. Slice results by source and changed features.');
    }
  }
  for(const item of items.values()) {
    item.missing.push('A controlled verification experiment is still required.');
    if(experiment && train && answers.sameRun!=='yes') {
      item.missing.push('Confirm that uploaded datasets belong to the logged experiment.');
      if(answers.sameRun==='no')item.conflicts.push('You reported that logs and datasets belong to different experiments. Combined support must not be treated as corroboration.');
    }
    if(item.id==='leakage') {
      item.question='Was the suspect feature available before the prediction was made?';
      if(!target)item.missing.push('Select a target to audit feature overlap and target copies.');
      if(!datasets.Validation)item.missing.push('Add validation data to audit exact split overlap.');
      if(answers.available==='yes')item.conflicts.push('You report that the feature is available at prediction time; an exact target copy still requires a provenance audit.');
      if(answers.available==='no')item.support.push('User-reported: the suspect feature is unavailable at prediction time (not independently verified).');
    } else {
      item.question='Were metrics computed on comparable splits with the same preprocessing and metric definition?';
      if(answers.comparable==='no')item.conflicts.push('You reported noncomparable evaluation conditions; metric-based causal interpretation is weakened.');
      if(answers.comparable!=='yes')item.missing.push('Verify metric definitions and preprocessing comparability.');
    }
    // Review priority, not probability: strongest observation first, conflicts reduce priority.
    item.score=Math.max(0,item.score-(item.conflicts.length?1:0));
    item.rationale=`Strongest signal: ${['none','heuristic trend or metric gap','reported proportion or distribution change','direct dataset observation'][Math.min(3,item.score+(item.conflicts.length?1:0))]}. ${item.conflicts.length?'One priority level deducted for conflicting context.':'No priority deduction.'} Multiple related signals do not inflate the score.`;
  }
  return [...items.values()].sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
}
