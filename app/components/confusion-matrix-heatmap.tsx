'use client';
import { useState } from 'react';

export type ConfusionCounts = {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
};

export interface ConfusionMatrixProps {
  baseline: {
    title?: string;
    threshold: number;
    confusion: ConfusionCounts;
  };
  repaired?: {
    title?: string;
    threshold: number;
    confusion: ConfusionCounts;
  } | null;
  labels?: {
    positive?: string;
    negative?: string;
  };
}

function MatrixGrid({
  title,
  threshold,
  confusion,
  labels,
  isRepaired
}: {
  title: string;
  threshold: number;
  confusion: ConfusionCounts;
  labels: { positive: string; negative: string };
  isRepaired?: boolean;
}) {
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = confusion;
  const total = tp + fp + tn + fn;
  const actualPositives = tp + fn;
  const actualNegatives = tn + fp;

  const pct = (n: number) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '0%';
  const rate = (n: number, denom: number) => denom > 0 ? ((n / denom) * 100).toFixed(1) + '%' : '—';

  return (
    <div className={`matrix-card ${isRepaired ? 'repaired-matrix' : 'baseline-matrix'}`}>
      <div className="matrix-header">
        <div>
          <span className="matrix-type-tag">{isRepaired ? 'Repaired Policy' : 'Current Baseline'}</span>
          <h4 className="matrix-title">{title}</h4>
        </div>
        <span className="matrix-threshold-pill">
          Boundary: <strong>{threshold.toFixed(2)}</strong>
        </span>
      </div>

      <div className="matrix-table-wrapper">
        <table className="confusion-matrix-table" aria-label={`2x2 Confusion Matrix for ${title}`}>
          <thead>
            <tr>
              <th scope="col" className="matrix-corner">
                <span className="pred-label">PRED ↓</span> / <span className="act-label">ACT →</span>
              </th>
              <th scope="col" className="matrix-act-col">
                Actual {labels.positive} (1)
                <small className="matrix-col-total">n={actualPositives.toLocaleString()}</small>
              </th>
              <th scope="col" className="matrix-act-col">
                Actual {labels.negative} (0)
                <small className="matrix-col-total">n={actualNegatives.toLocaleString()}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="matrix-pred-row">
                Predicted {labels.positive} (1)
              </th>
              <td className="matrix-cell cell-tp">
                <div className="cell-top">
                  <span className="cell-name">True Positive (TP)</span>
                  <span className="cell-pct">{pct(tp)}</span>
                </div>
                <strong className="cell-count">{tp.toLocaleString()}</strong>
                <span className="cell-rate">Recall: {rate(tp, actualPositives)}</span>
              </td>
              <td className="matrix-cell cell-fp">
                <div className="cell-top">
                  <span className="cell-name">False Positive (FP)</span>
                  <span className="cell-pct">{pct(fp)}</span>
                </div>
                <strong className="cell-count">{fp.toLocaleString()}</strong>
                <span className="cell-rate">False alarm: {rate(fp, actualNegatives)}</span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="matrix-pred-row">
                Predicted {labels.negative} (0)
              </th>
              <td className="matrix-cell cell-fn">
                <div className="cell-top">
                  <span className="cell-name">False Negative (FN)</span>
                  <span className="cell-pct">{pct(fn)}</span>
                </div>
                <strong className="cell-count">{fn.toLocaleString()}</strong>
                <div className="cell-footer">
                  <span className="cell-rate">Miss rate: {rate(fn, actualPositives)}</span>
                  {fn > 0 && <span className="cell-badge danger">CRITICAL MISS</span>}
                </div>
              </td>
              <td className="matrix-cell cell-tn">
                <div className="cell-top">
                  <span className="cell-name">True Negative (TN)</span>
                  <span className="cell-pct">{pct(tn)}</span>
                </div>
                <strong className="cell-count">{tn.toLocaleString()}</strong>
                <span className="cell-rate">Specificity: {rate(tn, actualNegatives)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ConfusionMatrixHeatmap({
  baseline,
  repaired,
  labels = { positive: 'Positive', negative: 'Negative' }
}: ConfusionMatrixProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'active'>(repaired ? 'side-by-side' : 'active');

  const resolvedLabels = {
    positive: labels.positive || 'Positive',
    negative: labels.negative || 'Negative'
  };

  const fnDiff = repaired ? repaired.confusion.falseNegative - baseline.confusion.falseNegative : 0;
  const fpDiff = repaired ? repaired.confusion.falsePositive - baseline.confusion.falsePositive : 0;
  const fnPercentDrop = repaired && baseline.confusion.falseNegative > 0
    ? ((Math.abs(fnDiff) / baseline.confusion.falseNegative) * 100).toFixed(1)
    : '0';

  return (
    <div className="confusion-matrix-heatmap-container" aria-label="Visual 2x2 Confusion Matrix Heatmap">
      <div className="matrix-section-header">
        <div>
          <span className="eyebrow cyan">VISUAL DECISION THEORY (§1, §9 & §150)</span>
          <h3 className="matrix-section-title">2×2 Operating Point Confusion Matrix</h3>
          <p className="matrix-section-desc">
            Visual inspection of True/False classifications at the chosen decision boundary. Compare baseline vs repaired operating points.
          </p>
        </div>

        {repaired && (
          <div className="matrix-view-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'side-by-side' ? 'active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
            >
              Side-by-Side Comparison
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
              onClick={() => setViewMode('active')}
            >
              Repaired Only
            </button>
          </div>
        )}
      </div>

      {repaired && fnDiff < 0 && (
        <div className="matrix-delta-highlight">
          <span className="delta-icon">⚡</span>
          <span className="delta-text">
            <strong>Critical Failure Remedy:</strong> False negatives dropped from <strong>{baseline.confusion.falseNegative.toLocaleString()}</strong> to <strong>{repaired.confusion.falseNegative.toLocaleString()}</strong> ({Math.abs(fnDiff).toLocaleString()} fewer critical misses, -{fnPercentDrop}%), in exchange for +{fpDiff.toLocaleString()} review burden.
          </span>
        </div>
      )}

      <div className={`matrix-display-grid ${viewMode === 'side-by-side' && repaired ? 'grid-dual' : 'grid-single'}`}>
        {(viewMode === 'side-by-side' || !repaired) && (
          <MatrixGrid
            title={baseline.title || 'Baseline Operating Policy'}
            threshold={baseline.threshold}
            confusion={baseline.confusion}
            labels={resolvedLabels}
            isRepaired={false}
          />
        )}
        {repaired && (
          <MatrixGrid
            title={repaired.title || 'Repaired Operating Policy'}
            threshold={repaired.threshold}
            confusion={repaired.confusion}
            labels={resolvedLabels}
            isRepaired={true}
          />
        )}
      </div>
    </div>
  );
}
