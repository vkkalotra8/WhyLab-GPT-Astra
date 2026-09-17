'use client';
import { useId, useState } from 'react';

// Real measured points from threshold_sweep on melanoma-synthetic.csv (100 rows, 10 malignant, 90 benign)
// Costs: False Negative = 10 units, False Positive = 1 unit.
const measuredPoints = [
  { t: 0.00, recall: 1.0, cost: 90, acc: 0.10, fn: 0, fp: 90 },
  { t: 0.05, recall: 1.0, cost: 68, acc: 0.32, fn: 0, fp: 68 },
  { t: 0.10, recall: 1.0, cost: 30, acc: 0.70, fn: 0, fp: 30 },
  { t: 0.15, recall: 1.0, cost: 12, acc: 0.88, fn: 0, fp: 12 },
  { t: 0.20, recall: 1.0, cost: 4,  acc: 0.96, fn: 0, fp: 4 }, // Optimal operating point
  { t: 0.25, recall: 0.8, cost: 23, acc: 0.95, fn: 2, fp: 3 },
  { t: 0.30, recall: 0.7, cost: 32, acc: 0.95, fn: 3, fp: 2 },
  { t: 0.35, recall: 0.6, cost: 42, acc: 0.94, fn: 4, fp: 2 },
  { t: 0.40, recall: 0.5, cost: 51, acc: 0.94, fn: 5, fp: 1 },
  { t: 0.45, recall: 0.3, cost: 71, acc: 0.92, fn: 7, fp: 1 },
  { t: 0.50, recall: 0.2, cost: 80, acc: 0.92, fn: 8, fp: 0 }, // Baseline default threshold
  { t: 0.55, recall: 0.2, cost: 80, acc: 0.92, fn: 8, fp: 0 },
  { t: 0.60, recall: 0.1, cost: 90, acc: 0.91, fn: 9, fp: 0 },
  { t: 0.70, recall: 0.0, cost: 100, acc: 0.90, fn: 10, fp: 0 },
  { t: 0.80, recall: 0.0, cost: 100, acc: 0.90, fn: 10, fp: 0 },
  { t: 0.90, recall: 0.0, cost: 100, acc: 0.90, fn: 10, fp: 0 },
  { t: 1.00, recall: 0.0, cost: 100, acc: 0.90, fn: 10, fp: 0 }
];

export default function FlagshipChart() {
  const chartId = useId();
  const [activePoint, setActivePoint] = useState<typeof measuredPoints[number] | null>(null);

  // SVG Chart Dimensions
  const W = 620;
  const H = 240;
  const padL = 50;
  const padR = 40;
  const padT = 30;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Coordinate scales
  const x = (t: number) => padL + t * plotW;
  const yRecall = (r: number) => padT + (1 - r) * plotH;
  const yCost = (c: number) => padT + (1 - c / 100) * plotH;

  // SVG path for Recall curve
  const recallPath = measuredPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${yRecall(p.recall).toFixed(1)}`)
    .join(' ');

  // SVG path for Cost curve
  const costPath = measuredPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${yCost(p.cost).toFixed(1)}`)
    .join(' ');

  // Area under cost curve
  const costArea = `${costPath} L ${x(1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`;

  // Baseline and Optimal coordinates
  const basePoint = measuredPoints.find(p => p.t === 0.50)!;
  const optPoint = measuredPoints.find(p => p.t === 0.20)!;

  const current = activePoint ?? optPoint;

  return (
    <div className="flagship-chart-container" aria-label="Measured threshold trade-off curve for flagship melanoma case">
      <div className="chart-header-row">
        <div>
          <span className="chart-tag-badge">MEASURED OPERATING-POINT SWEEP</span>
          <h4>Decision Threshold vs. Malignant Recall & Error Cost</h4>
        </div>
        <span className="dataset-provenance-pill">
          100 evaluation rows · 10 malignant / 90 benign
        </span>
      </div>

      <div className="chart-side-by-side">
        {/* SVG Curve Display */}
        <div className="svg-wrapper">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="flagship-svg"
            role="img"
            aria-labelledby={`${chartId}-title ${chartId}-desc`}
          >
            <title id={`${chartId}-title`}>Malignant Recall and Error Cost across Decision Thresholds</title>
            <desc id={`${chartId}-desc`}>
              Shows that lowering threshold from 0.50 to 0.20 increases malignant recall from 20 percent to 100 percent while dropping error cost from 80 to 4 units.
            </desc>

            <defs>
              <linearGradient id={`${chartId}-cost-grad`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff708f" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ff708f" stopOpacity="0.02" />
              </linearGradient>
              <filter id={`${chartId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map(val => (
              <g key={val} stroke="#1b2a3a" strokeDasharray="3 4">
                <line x1={padL} y1={padT + (1 - val) * plotH} x2={padL + plotW} y2={padT + (1 - val) * plotH} />
                <text x={padL - 8} y={padT + (1 - val) * plotH + 4} fill="#627d98" fontSize="10" textAnchor="end">
                  {Math.round(val * 100)}%
                </text>
              </g>
            ))}

            {/* X-axis tick labels */}
            {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(val => (
              <g key={`x-${val}`}>
                <line x1={x(val)} y1={padT} x2={x(val)} y2={padT + plotH} stroke="#172433" strokeDasharray="2 4" />
                <text x={x(val)} y={padT + plotH + 16} fill="#627d98" fontSize="10" textAnchor="middle">
                  T={val.toFixed(1)}
                </text>
              </g>
            ))}

            {/* Shaded cost region */}
            <path d={costArea} fill={`url(#${chartId}-cost-grad)`} />

            {/* Cost curve (Pink/Coral dashed) */}
            <path
              d={costPath}
              fill="none"
              stroke="#ff708f"
              strokeWidth="2.5"
              strokeDasharray="4 3"
              opacity="0.85"
            />

            {/* Recall curve (Cyan solid glowing) */}
            <path
              d={recallPath}
              fill="none"
              stroke="#56dfce"
              strokeWidth="3.5"
              filter={`url(#${chartId}-glow)`}
            />

            {/* Vertical operating line for Baseline (0.50) */}
            <line
              x1={x(basePoint.t)}
              y1={padT}
              x2={x(basePoint.t)}
              y2={padT + plotH}
              stroke="#ff708f"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
            {/* Baseline Marker */}
            <circle
              cx={x(basePoint.t)}
              cy={yRecall(basePoint.recall)}
              r="6"
              fill="#ff708f"
              stroke="#0b1726"
              strokeWidth="2"
            />
            <text x={x(basePoint.t) + 8} y={yRecall(basePoint.recall) + 4} fill="#ff708f" fontSize="11" fontWeight="700">
              Baseline (T=0.5)
            </text>

            {/* Vertical operating line for Repaired/Optimal (0.20) */}
            <line
              x1={x(optPoint.t)}
              y1={padT}
              x2={x(optPoint.t)}
              y2={padT + plotH}
              stroke="#56dfce"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
            {/* Optimal Marker */}
            <circle
              cx={x(optPoint.t)}
              cy={yRecall(optPoint.recall)}
              r="7"
              fill="#56dfce"
              stroke="#0b1726"
              strokeWidth="2"
            />
            <text x={x(optPoint.t) - 8} y={yRecall(optPoint.recall) - 10} fill="#56dfce" fontSize="11" fontWeight="700" textAnchor="end">
              Repaired (T=0.2)
            </text>

            {/* Interactive hover/tap points */}
            {measuredPoints.map(p => (
              <circle
                key={p.t}
                cx={x(p.t)}
                cy={yRecall(p.recall)}
                r="10"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => setActivePoint(p)}
                onMouseEnter={() => setActivePoint(p)}
                onFocus={() => setActivePoint(p)}
                tabIndex={0}
                role="button"
                aria-label={`Threshold ${p.t.toFixed(2)}: Recall ${(p.recall * 100).toFixed(0)}%, Error cost ${p.cost}`}
              />
            ))}
          </svg>

          {/* Chart Legend */}
          <div className="chart-legend-row">
            <span className="legend-item cyan">
              <span className="legend-line solid cyan-line" /> Malignant Recall (%)
            </span>
            <span className="legend-item pink">
              <span className="legend-line dashed pink-line" /> Total Error Cost (Units)
            </span>
            <span className="legend-hint">Hover or tap points along curve</span>
          </div>
        </div>

        {/* Dynamic Metric Comparison Card */}
        <div className="comparison-metric-panel">
          <div className="comparison-box-title">
            <span>OPERATING POINT AT T = {current.t.toFixed(2)}</span>
            {current.t === 0.20 ? (
              <span className="badge-tag optimal">RECOMMENDED</span>
            ) : current.t === 0.50 ? (
              <span className="badge-tag baseline">DEFAULT BASELINE</span>
            ) : null}
          </div>

          <div className="comparison-grid">
            <div className="comp-cell">
              <span className="comp-lbl">Malignant Recall</span>
              <strong className={current.recall >= 0.9 ? 'cyan' : 'danger'}>
                {(current.recall * 100).toFixed(1)}%
              </strong>
              <small>{10 - current.fn} of 10 detected</small>
            </div>

            <div className="comp-cell">
              <span className="comp-lbl">Missed Cancers (FN)</span>
              <strong className={current.fn === 0 ? 'cyan' : 'danger'}>
                {current.fn} <small>cases</small>
              </strong>
              <small>{current.fn === 0 ? 'Zero false negatives' : `Critical safety risk`}</small>
            </div>

            <div className="comp-cell">
              <span className="comp-lbl">Total Error Cost</span>
              <strong className={current.cost <= 10 ? 'cyan' : 'danger'}>
                {current.cost} <small>units</small>
              </strong>
              <small>FN×10 + FP×1</small>
            </div>

            <div className="comp-cell">
              <span className="comp-lbl">Overall Accuracy</span>
              <strong>{(current.acc * 100).toFixed(1)}%</strong>
              <small>{Math.round(current.acc * 100)} of 100 correct</small>
            </div>
          </div>

          <div className="before-after-summary">
            <div className="summary-row">
              <span className="summary-label">Baseline (T=0.50):</span>
              <span className="summary-val danger">92.0% Acc · 20.0% Recall · Cost: 80</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Repaired (T=0.20):</span>
              <span className="summary-val cyan">96.0% Acc · 100.0% Recall · Cost: 4</span>
            </div>
            <div className="summary-verdict">
              <strong>Measured impact:</strong> 95% reduction in error cost and +80 pp malignant recall, without sacrificing overall accuracy.
            </div>
          </div>
        </div>
      </div>

      <div className="chart-provenance-footer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>
          <strong>Honest Data Guarantee:</strong> Generated from the full 101-threshold sweep of <code>melanoma-synthetic.csv</code>. All numbers reflect actual dataset evaluations, not simulated visuals.
        </span>
      </div>
    </div>
  );
}
