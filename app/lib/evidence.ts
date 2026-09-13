export type Finding = { title: string; evidence: string; experiment: string; strength: string; category: string };
export type EpochPoint = { epoch: number; metrics: Record<string, number>; sources: string[] };
export type Evidence = { source: string; format: string; metrics: { label: string; value: string; source: string }[]; warnings: string[]; findings: Finding[]; history: EpochPoint[]; rows?: number; columns?: number };
const MAX_CHARS = 10_000_000;

// CSV state machine: quoted commas, escaped quotes, CRLF, and multiline cells.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false, cells = 0;
  function field() { if (++cells > 1_000_000) throw new Error('CSV exceeds one million cells; export a smaller subset.'); row.push(cell.trim()); cell = ''; closed = false; }
  function record() { field(); if (row.length > 1 || row.some(Boolean)) rows.push(row); row = []; }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',' ) field();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; record(); }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"' || (closed && c.trim())) throw new Error('Malformed CSV: unexpected text or quote after a field.');
    else if (!closed) cell += c;
  }
  if (quoted) throw new Error('Malformed CSV: a quoted field was not closed.');
  if (cell || row.length || closed) record();
  if (rows.length < 2) throw new Error('CSV needs a header and at least one data row.');
  if (rows[0].some(h => !h) || new Set(rows[0]).size !== rows[0].length) throw new Error('CSV headers must be nonempty and unique.');
  if (rows.some(r => r.length !== rows[0].length)) throw new Error('CSV rows have inconsistent column counts. Check delimiters and quoted values.');
  return rows;
}

export function normalizeLogs(text: string): string {
  // Keras epoch headers and common slash/dot-separated tracker metric names.
  return text.replace(/\[(validation|production|train|training|test)\]\s*(accuracy|loss|mae|mse|rmse|r2|precision|recall|f1|auc)/gi, '$1_$2').replace(/Epoch\s+(\d+)\s*\/\s*\d+\s*\r?\n([^\r\n]+)/gi, '[epoch $1] $2')
    .replace(/\b(train|training|val|validation|test|production)[/.](accuracy|acc|loss|mae|mse|rmse|r2|precision|recall|f1|auc)\b/gi, '$1_$2')
    .replace(/\b(loss|accuracy|acc):/gi, (whole, key, offset, original) => /[a-z_]/i.test(original[offset - 1] ?? '') ? whole : 'train_' + key + ':');
}
export function analyzeEvidence(raw: string, source = 'Pasted logs'): Evidence {
  if (raw.length > MAX_CHARS) throw new Error('Evidence exceeds the 10 million character analysis limit. Export a smaller excerpt.');
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('The evidence is empty. Add logs or a dataset with data rows.');
  if (text.includes('\0') || text.includes('\uFFFD')) throw new Error('This file is not readable UTF-8 text. Export it as UTF-8 CSV, JSON, or logs.');
  const result: Evidence = { source, format: 'Training logs', metrics: [], warnings: [], findings: [], history: [] };
  let lines: string[] = [];
  const add = (title: string, evidence: string, experiment: string, strength: string, category: string) => result.findings.push({ title, evidence, experiment, strength, category });
  if (/\.csv$/i.test(source)) {
    result.format = 'CSV dataset';
    const [headers, ...rows] = parseCsv(text);
    result.rows = rows.length; result.columns = headers.length;
    let missing = 0;
    for (const row of rows) for (const value of row) if (!value || /^(null|na|nan|n\/a)$/i.test(value)) missing++;
    const duplicates = rows.length - new Set(rows.map(row => JSON.stringify(row))).size;
    result.metrics.push({ label: 'Missing cells', value: `${missing} / ${rows.length * headers.length}`, source: 'All data rows' }, { label: 'Repeated rows', value: String(duplicates), source: 'Exact full-row comparison' });
    if (missing) add('Missing feature values', `${missing} cells are empty or marked NA, NaN, N/A, or null.`, 'Inspect missingness by column and split. Fit imputation only on the training split, then compare held-out performance.', 'Observed', 'data');
    if (duplicates) add('Repeated observations', `${duplicates} data rows repeat an earlier row. This alone does not establish leakage.`, 'Check whether duplicates represent valid repeated measurements. Audit overlap across train and validation before splitting by entity.', 'Observed', 'evaluation');
    const labelIndex = headers.findIndex(h => /^(label|class|target)$/i.test(h));
    if (labelIndex >= 0) {
      const counts = new Map<string, number>();
      for (const row of rows) if (row[labelIndex] && !/^(null|na|nan|n\/a)$/i.test(row[labelIndex])) counts.set(row[labelIndex], (counts.get(row[labelIndex]) ?? 0) + 1);
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      if (counts.size >= 2 && counts.size <= 50) {
        const [label, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
        const share = count / total;
        result.metrics.push({ label: `Largest class (${headers[labelIndex]})`, value: `${label}: ${(share * 100).toFixed(1)}%`, source: `${total} nonmissing labels; categorical target assumed` });
        if (share >= .7) add('Possible class imbalance', `Class "${label}" accounts for ${(share * 100).toFixed(1)}% of nonmissing labels in column "${headers[labelIndex]}".`, 'Confirm this is a classification target. Compare class counts across splits and inspect macro F1 and per-class recall before trying class weights.', 'Supported', 'data');
      } else result.warnings.push('Class balance was not inferred: the target has fewer than two or more than 50 distinct values.');
    } else result.warnings.push('No label, class, or target column found. Class balance was not evaluated.');
    // Metric tables are supported only when headers explicitly name metrics.
    lines = rows.map((row, i) => `row ${i + 2}: ` + headers.flatMap((h, j) => /^(?:(?:val|validation|prod|production|train|training|test)_(?:accuracy|acc|loss|mae|mse|rmse|r2|precision|recall|f1|auc)|majority|minority_recall|epoch)$/i.test(h) && /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?%?$/i.test(row[j]) ? [`${h}=${row[j]}`] : []).join(' '));
  } else if (/\.json$/i.test(source) || /^\{/.test(text) || /^\[\s*[\{\["]/.test(text)) {
    result.format = 'JSON metrics';
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON. Check commas, quotes, and brackets.'); }
    function flatten(value: unknown, path: string, depth: number) {
      if (depth > 15) throw new Error('JSON is nested too deeply. Export a flatter metrics object.');
      if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) flatten(item, path ? `${path}_${key}` : key, depth + 1);
      else if (typeof value === 'number' || typeof value === 'string') lines.push(`${path}=${value}`);
    }
    const records = Array.isArray(data) ? data : data && typeof data === 'object' && 'history' in data && Array.isArray(data.history) ? data.history : null;
    if (records) {
      for (const record of records) {
        const start = lines.length;
        flatten(record, '', 0);
        const fields = lines.splice(start);
        lines.push(fields.join(' '));
      }
    } else flatten(data, '', 0);
  } else lines = normalizeLogs(text).split(/\r?\n/);
  const values = new Map<string, { value: number; source: string }>();
  const aliases: Record<string, string> = { val_accuracy: 'Validation accuracy', validation_accuracy: 'Validation accuracy', val_acc: 'Validation accuracy', production_accuracy: 'Production accuracy', prod_accuracy: 'Production accuracy', train_accuracy: 'Training accuracy', training_accuracy: 'Training accuracy', train_acc: 'Training accuracy', train_loss: 'Training loss', training_loss: 'Training loss', val_loss: 'Validation loss', validation_loss: 'Validation loss', majority: 'Majority share', minority_recall: 'Minority recall' };
  for (const [prefix, label] of Object.entries({train:'Training',training:'Training',val:'Validation',validation:'Validation',test:'Test',production:'Production',prod:'Production'})) {
    for (const metric of ['accuracy','acc','loss','mae','mse','rmse','r2','precision','recall','f1','auc']) aliases[prefix+'_'+metric]=label+' '+(metric==='acc'?'accuracy':metric==='accuracy'||metric==='loss'?metric:metric.toUpperCase());
  }
  const rate = (label: string) => /accuracy|share|recall|precision|f1|auc/i.test(label);
  const epochs = new Map<number, EpochPoint>();
  let lastEpoch = -1, ambiguousHistory = false;
  for (const [index, original] of lines.entries()) {
    const epochMatch = original.match(/\bepoch(?:\s*[:=]\s*|\s+)(\d+)(?=\s|\/|\]|$)/i);
    const epoch = epochMatch ? Number(epochMatch[1]) : undefined;
    const point: EpochPoint | undefined = epoch !== undefined && Number.isSafeInteger(epoch) ? { epoch, metrics: {}, sources: [original.slice(0, 240)] } : undefined;
    const line = normalizeLogs(original);
    for (const match of line.matchAll(/\b([a-z_][a-z_0-9]*)\s*[:=]\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?|nan|inf(?:inity)?)\s*(%?)/gi)) {
      const key = match[1].toLowerCase();
      const label = Object.hasOwn(aliases, key) ? aliases[key] : undefined; if (!label) continue;
      let value = Number(match[2]);
      const bounded = rate(label);
      if (match[3] && bounded) value /= 100;
      if (!Number.isFinite(value) || (value < 0 && !label.endsWith('R2')) || (label.endsWith('R2') && value > 1) || (bounded && value > 1) || (!bounded && match[3])) { result.warnings.push(`Invalid or ambiguous ${label.toLowerCase()} at record ${index + 1}; use 0-1 or explicit % for rates, finite nonnegative errors, and R2 at most 1 (negative is valid).`); continue; }
      values.set(label, { value, source: original.slice(0, 240) });
      if (point && /^(Training|Validation) (accuracy|loss)$/.test(label)) point.metrics[label] = value;
    }
    if (point && Object.keys(point.metrics).length) {
      if (point.epoch < lastEpoch) ambiguousHistory = true;
      lastEpoch = point.epoch;
      const previous = epochs.get(point.epoch);
      if (previous) {
        if (Object.keys(point.metrics).some(key => key in previous.metrics)) ambiguousHistory = true;
        Object.assign(previous.metrics, point.metrics);
        previous.sources.push(...point.sources);
      } else epochs.set(point.epoch, point);
    }
  }
  result.history = ambiguousHistory ? [] : [...epochs.values()].sort((a, b) => a.epoch - b.epoch);
  if (ambiguousHistory) result.warnings.push('Repeated metric epochs or restarted/out-of-order epochs detected. Curves and trend checks were skipped to avoid merging runs; provide one ordered run.');
  result.findings.push(...analyzeTrends(result.history));
  for (const [label, entry] of values) result.metrics.push({ label, value: !rate(label) ? String(entry.value) : `${(entry.value * 100).toFixed(1)}%`, source: entry.source });
  const val = values.get('Validation accuracy'), prod = values.get('Production accuracy'), train = values.get('Training accuracy'), majority = values.get('Majority share');
  if (val && prod && val.value - prod.value >= .1) add('Possible distribution shift', `Validation accuracy exceeds production accuracy by ${((val.value - prod.value) * 100).toFixed(1)} percentage points. A gap alone cannot identify the cause.`, 'Compare source, time period, preprocessing, and class mix across environments. Evaluate a labeled production holdout with the same metric.', 'Suggested', 'data');
  if (!result.findings.some(f => f.title === 'Possible overfitting') && train && val && train.value - val.value >= .1) add('Possible overfitting', `Training accuracy exceeds validation accuracy by ${((train.value - val.value) * 100).toFixed(1)} percentage points.`, 'Plot train and validation metrics by epoch. Check split comparability, then compare early stopping or regularization on a fixed holdout.', 'Suggested', 'training');
  if (majority && majority.value >= .7) add('Possible class imbalance', `Reported majority-class share is ${(majority.value * 100).toFixed(1)}%.`, 'Inspect class counts and per-class recall. Compare macro F1 against a majority-class baseline before testing class-weighted loss.', 'Supported', 'data');
  if (!result.metrics.length) result.warnings.push('No supported metrics detected. Use keys such as val_accuracy=0.94, production_accuracy=61.8%, train_loss=0.08, or nested JSON like {"validation":{"accuracy":0.94}}.');
  result.warnings.push('Metrics use the last valid occurrence in source order; splits, epoch alignment, and experiment identity are not verified.');
  result.findings.sort((a, b) => ['Observed','Supported','Suggested'].indexOf(a.strength) - ['Observed','Supported','Suggested'].indexOf(b.strength));
  if (result.history.length > 1000) { result.history = result.history.slice(-1000); result.warnings.push('Chart history is limited to the last 1,000 recorded epochs; summary metrics still use the full input.'); }
  if (result.warnings.length > 200) { const count=result.warnings.length; result.warnings=result.warnings.slice(0,200); result.warnings.push('Showing 200 of '+count+' parsing warnings.'); }
  return result;
}
export function filterFindings(evidence: Evidence, lens: string): Finding[] {
  const category = lens === 'Data quality & distribution' ? 'data' : lens === 'Training & optimization' ? 'training' : lens === 'Evaluation & leakage' ? 'evaluation' : null;
  return evidence.findings.filter(f => !category || f.category === category);
}

// Educational heuristics operate on consecutive, explicitly numbered epochs only.
export function analyzeTrends(history: EpochPoint[]): Finding[] {
  const findings: Finding[] = [];
  const window = history.slice(-5);
  if (window.length < 4 || window.some((p, i) => i > 0 && p.epoch !== window[i - 1].epoch + 1)) return findings;
  const span = `epochs ${window[0].epoch}-${window.at(-1)!.epoch}`;
  const series = (key: string) => window.every(p => p.metrics[key] !== undefined) ? window.map(p => p.metrics[key]) : [];
  const train = series('Training loss'), val = series('Validation loss');
  const add = (title: string, evidence: string, experiment: string) => findings.push({ title, evidence, experiment, strength: 'Suggested', category: 'training' });
  if (train.length && val.length && train[0] > 0 && val[0] > 0 && train.at(-1)! <= train[0] * .9 && val.at(-1)! >= val[0] * 1.1) {
    add('Possible overfitting', `Across ${span}, training loss fell from ${train[0]} to ${train.at(-1)}, while validation loss rose from ${val[0]} to ${val.at(-1)} (at least 10% each).`, 'Training fit improved while held-out fit worsened. Check that both losses use the same definition and split. Compare early stopping at the best validation epoch against the full run on an untouched test set.');
  }
  for (const key of ['Training loss', 'Validation loss']) {
    const values = series(key);
    if (!values.length) continue;
    const scale = Math.max(...values);
    if (scale > 0 && Math.min(...values) > 0 && (scale - Math.min(...values)) / scale <= .01) {
      add('Possible stalled learning', `${key} varies by at most 1% of its maximum across ${span} (${Math.min(...values)}-${scale}). A plateau can also mean convergence.`, 'Check gradient norms, learning rate, and whether parameters update. Try fitting a small batch. Compare a controlled learning-rate change; do not assume a flat curve means failure.');
      break;
    }
  }
  for (const key of ['Training loss', 'Validation loss']) {
    const values = series(key);
    if (!values.length) continue;
    const scale = Math.max(...values);
    const steps = values.slice(1).map((v, i) => v - values[i]);
    const reversals = steps.slice(1).filter((v, i) => v * steps[i] < 0 && Math.abs(v) >= scale * .1 && Math.abs(steps[i]) >= scale * .1).length;
    if (scale > 0 && reversals >= 2) {
      add('Possible unstable training', `${key} reverses direction ${reversals} times with adjacent changes of at least 10% of its maximum across ${span}. Values: ${values.join(', ')}.`, 'Large oscillations can come from noisy batches or an aggressive learning rate. Repeat with a fixed seed and compare a lower learning rate, keeping data and batch size constant.');
      break;
    }
  }
  return findings;
}

export const metricColumns = ['epoch','train_loss','val_loss','train_accuracy','val_accuracy','production_accuracy','train_mae','val_mae','train_mse','val_mse','train_rmse','val_rmse','train_r2','val_r2','val_precision','val_recall','val_f1','val_auc'];
export function mapMetricCsv(text: string, mapping: Record<string,string>): string {
  const [headers,...rows]=parseCsv(text.replace(/^\uFEFF/,''));
  const mapped=headers.map(h=>Object.hasOwn(mapping,h)?mapping[h]:h);
  if(new Set(mapped).size!==mapped.length)throw new Error('Two columns map to the same name. Choose unique metric mappings.');
  for(const [header,destination] of Object.entries(mapping))if(!headers.includes(header)||!metricColumns.includes(destination))throw new Error('Invalid CSV column mapping.');
  const quote=(v:string)=>'"'+v.replace(/"/g,'""')+'"';
  return [mapped,...rows].map(row=>row.map(quote).join(',')).join('\n');
}
export function combineEvidence(items: Evidence[]): Evidence {
  if(!items.length)throw new Error('Select at least one evidence file.');
  if(items.length===1)return items[0];
  const findings=new Map<string,Finding>();
  for(const item of items)for(const f of item.findings){const previous=findings.get(f.title);const excerpt=`${item.source}: ${f.evidence}`;findings.set(f.title,previous?{...previous,evidence:previous.evidence+' | '+excerpt}:{...f,evidence:excerpt});}
  const primary=items.find(item=>item.history.length);
  return {source:items.map(item=>item.source).join(' + '),format:'Evidence bundle',metrics:items.flatMap(item=>item.metrics.map(m=>({...m,label:`${item.source} / ${m.label}`,source:`${item.source}: ${m.source}`}))),warnings:[...items.flatMap(item=>item.warnings.map(w=>`${item.source}: ${w}`)),'Files are analyzed independently; cross-file metric gaps are not inferred. Verify that these files describe the same experiment.',primary?`Epoch chart uses ${primary.source} only; histories from other files are not merged.`:'No epoch history found.'],findings:[...findings.values()],history:primary?.history??[]};
}
