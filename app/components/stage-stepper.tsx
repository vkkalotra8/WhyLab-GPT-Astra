'use client';
import { useRef } from 'react';
import { Database, BarChart2, Search, CheckCircle2, Wrench, FileText } from 'lucide-react';

export interface StageInfo {
  id: number;
  code: string;
  name: string;
  desc: string;
  anchor: string;
  icon: typeof Database;
}

export const STAGES: StageInfo[] = [
  { id: 1, code: '01', name: 'INGEST', desc: 'CSV & logs', anchor: 'stage-ingest', icon: Database },
  { id: 2, code: '02', name: 'PROFILE', desc: 'Distributions & drift', anchor: 'stage-profile', icon: BarChart2 },
  { id: 3, code: '03', name: 'INVESTIGATE', desc: 'Astra & case diagnosis', anchor: 'stage-investigate', icon: Search },
  { id: 4, code: '04', name: 'VERIFY', desc: 'Evidence graph & tests', anchor: 'stage-verify', icon: CheckCircle2 },
  { id: 5, code: '05', name: 'REPAIR', desc: 'Threshold sweep & policy', anchor: 'stage-repair', icon: Wrench },
  { id: 6, code: '06', name: 'REPORT', desc: 'Audit JSON & summary', anchor: 'stage-report', icon: FileText }
];

export default function StageStepper({
  activeStage,
  onSelectStage,
  stagesCompleted,
  stagesAvailable,
  isStale
}: {
  activeStage: number;
  onSelectStage: (stage: number) => void;
  stagesCompleted: Record<number, boolean>;
  stagesAvailable?: Record<number, boolean>;
  isStale?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (index + 1) % STAGES.length;
      onSelectStage(STAGES[next].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (index - 1 + STAGES.length) % STAGES.length;
      onSelectStage(STAGES[prev].id);
    }
  }

  return (
    <div className="stage-stepper-wrapper">
      <nav
        ref={navRef}
        className="stage-stepper"
        aria-label="Investigation Workflow Stages"
        role="tablist"
      >
        <div className="stepper-track" role="presentation">
          {STAGES.map((s, index) => {
            const isActive = activeStage === s.id;
            const isDone = stagesCompleted[s.id];
            const isAvail = stagesAvailable ? stagesAvailable[s.id] : true;
            const Icon = s.icon;

            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`stage-tab-${s.id}`}
                aria-selected={isActive}
                aria-controls={s.anchor}
                tabIndex={isActive ? 0 : -1}
                className={`stepper-node ${isActive ? 'node-active' : ''} ${isDone ? 'node-done' : ''} ${!isAvail && !isActive && !isDone ? 'node-standby' : ''}`}
                onClick={() => onSelectStage(s.id)}
                onKeyDown={e => handleKeyDown(e, index)}
              >
                <div className="node-num-wrapper">
                  <span className="node-icon">
                    <Icon size={14} />
                  </span>
                  <span className="node-num">{s.code}</span>
                </div>
                <div className="node-content">
                  <span className="node-name">{s.name}</span>
                  <span className="node-desc">{s.desc}</span>
                </div>
                <div className="node-status">
                  {isActive ? (
                    <span className="node-pill pill-active">Active</span>
                  ) : isDone ? (
                    <span className="node-pill pill-done">✓ Done</span>
                  ) : isAvail ? (
                    <span className="node-pill pill-ready">Ready</span>
                  ) : (
                    <span className="node-pill pill-standby">Standby</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {isStale && (
        <div className="stale-indicator-banner" role="alert">
          <span className="stale-dot" aria-hidden="true" />
          <span>
            <strong>Upstream evidence modified:</strong> Downstream investigation findings and repair metrics reflect the previous dataset snapshot. Re-run investigation to update.
          </span>
        </div>
      )}
    </div>
  );
}
