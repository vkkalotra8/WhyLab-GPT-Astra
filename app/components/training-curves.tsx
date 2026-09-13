"use client";
import { useState } from 'react';
import type { EpochPoint } from '../lib/evidence';

export default function TrainingCurves({ history }: { history: EpochPoint[] }) {
  const [metric, setMetric] = useState<'loss' | 'accuracy'>('loss');
  const [selected, setSelected] = useState(0);
  const keys = [`Training ${metric}`, `Validation ${metric}`];
  const points = history.filter(p => keys.some(key => p.metrics[key] !== undefined));
  const active = points[Math.min(selected, Math.max(0, points.length - 1))];
  const max = metric === 'accuracy' ? 1 : points.reduce((largest, point) => Math.max(largest, ...keys.map(key => point.metrics[key] ?? 0)), .001);
  const first = points[0]?.epoch ?? 0, last = points.at(-1)?.epoch ?? 1;
  const x = (epoch: number) => 48 + (epoch - first) / Math.max(1, last - first) * 584;
  const y = (value: number) => 190 - value / max * 166;
  const format = (value: number) => metric === 'accuracy' ? `${(value * 100).toFixed(1)}%` : Number(value.toPrecision(4)).toString();
  return <section className="training-curves" aria-labelledby="curves-title">
    <div className="section-heading"><h3 id="curves-title">Training across epochs</h3><div className="curve-controls" role="group" aria-label="Chart metric">{(['loss', 'accuracy'] as const).map(value => <button key={value} aria-pressed={metric === value} onClick={() => { setMetric(value); setSelected(0); }}>{value === 'loss' ? 'Loss' : 'Accuracy'}</button>)}</div></div>
    {points.length < 2 ? <p className="description">At least two explicitly numbered epochs with {metric} are needed for a curve. Use one row per epoch, such as <code>[epoch 1] train_loss=0.8 val_loss=0.9</code>.</p> : <>
      <svg className="epoch-chart" viewBox="0 0 660 225" role="img" aria-label={`${metric} by epoch, ${first} through ${last}. Training is solid cyan; validation is dashed violet. Exact values are available below.`}>
        {[0, .5, 1].map(t => <g key={t}><line x1="48" x2="632" y1={y(t * max)} y2={y(t * max)} stroke="#344050" strokeDasharray="3 5"/><text x="40" y={y(t * max) + 4} textAnchor="end">{format(t * max)}</text></g>)}
        {keys.map((key, i) => <g key={key} stroke={i === 0 ? '#56dfce' : '#c1a2ff'} fill="none">{points.map((point, j) => {
          const previous = points[j - 1], value = point.metrics[key];
          if (value === undefined) return null;
          return <g key={point.epoch}>{previous && previous.metrics[key] !== undefined && point.epoch === previous.epoch + 1 && <line x1={x(previous.epoch)} y1={y(previous.metrics[key])} x2={x(point.epoch)} y2={y(value)} strokeWidth="2" strokeDasharray={i ? '5 4' : undefined}/>}<circle cx={x(point.epoch)} cy={y(value)} r="3"/></g>;
        })}</g>)}
        {active && <line x1={x(active.epoch)} x2={x(active.epoch)} y1="20" y2="195" stroke="#e9b769" strokeDasharray="2 5"/>}
        <text x="48" y="215">Epoch {first}</text><text x="632" y="215" textAnchor="end">Epoch {last}</text>
      </svg>
      <div className="legend"><span className="cyan">Training / solid</span><span className="violet">Validation / dashed</span></div>
      <label className="epoch-selector">Inspect epoch {active?.epoch}<input aria-label="Inspect recorded epoch" type="range" min="0" max={points.length - 1} value={Math.min(selected, points.length - 1)} onChange={event => setSelected(Number(event.target.value))}/></label>
      <p className="epoch-readout" aria-live="polite">{keys.map(key => `${key}: ${active?.metrics[key] === undefined ? 'not recorded' : format(active.metrics[key])}`).join(' / ')}</p>
      <details><summary>View exact epoch values and source evidence</summary><div className="epoch-table"><table><caption>{metric} by recorded epoch</caption><thead><tr><th scope="col">Epoch</th>{keys.map(key => <th scope="col" key={key}>{key}</th>)}<th scope="col">Source</th></tr></thead><tbody>{points.map(point => <tr key={point.epoch}><th scope="row">{point.epoch}</th>{keys.map(key => <td key={key}>{point.metrics[key] === undefined ? 'Not recorded' : String(point.metrics[key])}</td>)}<td>{point.sources.join(' | ')}</td></tr>)}</tbody></table></div></details>
    </>}
    <p className="description">Missing epochs are not interpolated. Trend checks need 4-5 consecutive recorded epochs and are educational heuristics, not confirmed causes.</p>
  </section>;
}
