"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCsv } from '../lib/evidence';
import { compareDatasets, profileDataset } from '../lib/dataset';
import { useCaseState } from './case-manager';
import DiagnosisPanel from './diagnosis-panel';
import type { Evidence } from '../lib/evidence';

const roles = ['Training', 'Validation', 'Production'] as const;

const roleDescriptions: Record<typeof roles[number], string> = {
  Training: 'Baseline reference for column types, class distribution, and data profiling.',
  Validation: 'Hold-out dataset to evaluate generalizability and detect distribution shift.',
  Production: 'Live inference stream to monitor real-world drift and novel anomalies.'
};

export default function DatasetLab({ evidence }: { evidence: Evidence | null }) {
  const [datasets, setDatasets] = useCaseState('datasets');
  const [target, setTarget] = useCaseState('target');
  const [task, setTask] = useCaseState('task');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [previousEvidence, setPreviousEvidence] = useState(evidence);

  if (previousEvidence !== evidence) {
    setPreviousEvidence(evidence);
    setRevision(r => r + 1);
  }

  useEffect(() => () => { generation.current++; }, []);

  const training = datasets.Training;
  const profiles = useMemo(() => training ? profileDataset(training, target, task) : [], [training, target, task]);

  async function upload(role: typeof roles[number], file?: File) {
    if (!file) return;
    const request = ++generation.current;
    setError('');
    setReading(true);
    try {
      if (!/\.csv$/i.test(file.name) || file.size > 2_000_000) {
        throw new Error('Choose a UTF-8 CSV no larger than 2 MB.');
      }
      const text = await file.text();
      if (request !== generation.current) return;
      if (text.includes('\uFFFD') || text.includes('\0')) {
        throw new Error('Export this file as UTF-8 text.');
      }
      const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
      if (headers.length > 100 || rows.length > 10000) {
        throw new Error('Use at most 100 columns and 10,000 rows for interactive profiling.');
      }
      setRevision(r => r + 1);
      setDatasets(previous => ({ ...previous, [role]: { name: file.name, headers, rows } }));
      if (role === 'Training') setTarget('');
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Unable to read CSV.');
    } finally {
      if (request === generation.current) setReading(false);
    }
  }

  return (
    <section className="panel dataset-lab" aria-labelledby="dataset-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow cyan">03 / DATASET INVESTIGATION</span>
          <h2 id="dataset-heading">Look inside your data.</h2>
        </div>
        <button
          className="new-button"
          onClick={() => {
            generation.current++;
            setReading(false);
            setRevision(r => r + 1);
            setDatasets({});
            setTarget('');
            setError('');
          }}
        >
          Clear datasets
        </button>
      </div>

      <p className="description">
        Profile a training CSV, then add validation or production data to compare. All analysis stays in your browser.
        Up to 2 MB, 10,000 rows, and 100 columns per file.
      </p>

      {/* 3 Upload Cards */}
      <div className="dataset-uploads">
        {roles.map((role, idx) => {
          const currentDataset = datasets[role];
          const isUploaded = Boolean(currentDataset);
          return (
            <div key={role} className={`dataset-card ${isUploaded ? 'uploaded' : 'empty'}`}>
              <div className="dataset-card-header">
                <div>
                  <span className="role-num">0{idx + 1}</span>
                  <h3>{role} dataset</h3>
                </div>
                <span className={`status-pill ${isUploaded ? 'status-ready' : 'status-empty'}`}>
                  {isUploaded ? '✓ Analyzed' : 'Empty'}
                </span>
              </div>

              <p className="dataset-role-desc">{roleDescriptions[role]}</p>

              {isUploaded ? (
                <div className="dataset-file-info">
                  <div className="file-meta">
                    <strong title={currentDataset!.name}>{currentDataset!.name}</strong>
                    <span>{currentDataset!.rows.length.toLocaleString()} rows · {currentDataset!.headers.length} cols</span>
                  </div>
                  <button
                    type="button"
                    className="remove-dataset-btn"
                    disabled={reading}
                    onClick={event => {
                      event.preventDefault();
                      setDatasets(previous => {
                        const next = { ...previous };
                        delete next[role];
                        return next;
                      });
                      if (role === 'Training') setTarget('');
                    }}
                  >
                    Remove {role.toLowerCase()} data
                  </button>
                </div>
              ) : (
                <label className="dataset-drop-area">
                  <input
                    type="file"
                    accept=".csv"
                    disabled={reading}
                    onChange={event => {
                      void upload(role, event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                  <span className="upload-trigger-text">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    Choose {role} CSV
                  </span>
                  <small>Drag & drop or browse</small>
                </label>
              )}
            </div>
          );
        })}
      </div>

      <p role="status" className="description dataset-status-indicator">
        {reading ? 'Reading and parsing CSV in browser...' : ''}
      </p>

      {error && (
        <div role="alert" className="dataset-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {training ? (
        <>
          <div className="dataset-options">
            <label>
              <span className="option-title">Task type</span>
              <select
                value={task}
                onChange={e => {
                  setTask(e.target.value);
                  setRevision(r => r + 1);
                }}
              >
                <option value="classification">Classification</option>
                <option value="regression">Regression</option>
              </select>
            </label>
            <label>
              <span className="option-title">Target column</span>
              <select
                value={target}
                onChange={e => {
                  setTarget(e.target.value);
                  setRevision(r => r + 1);
                }}
              >
                <option value="">Select a target (optional)</option>
                {training.headers.map(h => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="dataset-helper-note">
            Types are inferred from nonmissing values. Numeric class codes are valid classification labels. Select a
            target to check balance and exact target copies.
          </p>

          <div className="epoch-table dataset-table">
            <table>
              <caption>Training column profiles ({profiles.length} columns inspected)</caption>
              <thead>
                <tr>
                  {['Column', 'Inferred type', 'Missing', 'Distinct', 'Distribution / numeric range', 'Review signals'].map(h => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => (
                  <tr key={p.name}>
                    <th scope="row" className="col-name-cell">
                      <span>{p.name}</span>
                      {p.name === target && <span className="target-pill">Target</span>}
                    </th>
                    <td>
                      <span className="type-badge">{p.type}</span>
                    </td>
                    <td className="mono-cell">
                      {p.missing} ({(p.missing / training.rows.length * 100).toFixed(1)}%)
                    </td>
                    <td className="mono-cell">{p.distinct}</td>
                    <td>
                      {p.mean !== undefined && (
                        <div className="numeric-range">
                          <span>Min {p.min?.toPrecision(4)}</span>
                          <span className="range-divider">/</span>
                          <span className="mean-val">Mean {p.mean.toPrecision(4)}</span>
                          <span className="range-divider">/</span>
                          <span>Max {p.max?.toPrecision(4)}</span>
                        </div>
                      )}
                      {(p.mean === undefined || (p.name === target && task === 'classification')) &&
                        p.top.map(([value, count]) => (
                          <div key={value} className="class-frequency">
                            <div className="freq-labels">
                              <span className="freq-val">{value}</span>
                              <span className="freq-count">{count}</span>
                            </div>
                            <meter min={0} max={training.rows.length - p.missing} value={count}>
                              {count}
                            </meter>
                          </div>
                        ))}
                    </td>
                    <td>
                      {p.warnings.length ? (
                        <div className="signal-warning">
                          <span className="warning-dot" />
                          <span>{p.warnings.join(' ')}</span>
                        </div>
                      ) : (
                        <span className="signal-ok">No rule triggered</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {roles.slice(1).map(
            role =>
              datasets[role] && (
                <section key={role} className="dataset-comparison">
                  <div className="comparison-header">
                    <span className="eyebrow cyan">DISTRIBUTION COMPARISON</span>
                    <h3>{role} compared with training</h3>
                  </div>
                  <ul>
                    {compareDatasets(training, datasets[role]!, target, task).map((message, i) => (
                      <li key={i}>{message}</li>
                    ))}
                  </ul>
                </section>
              )
          )}
        </>
      ) : (
        <div className="dataset-empty-callout">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <div>
            <strong>No training dataset uploaded</strong>
            <p>Add a training CSV to begin profiling. Validation and production files are optional for comparative drift checks.</p>
          </div>
        </div>
      )}

      <DiagnosisPanel key={revision} evidence={evidence} datasets={datasets} target={target} task={task} />
    </section>
  );
}

