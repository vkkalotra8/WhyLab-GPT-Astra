'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, ChevronRight, ChevronLeft, X, Sparkles, Target, Activity, ShieldAlert, Cpu, Award } from 'lucide-react';

interface TourStep {
  id: number;
  timeRange: string;
  title: string;
  headline: string;
  narrative: string;
  targetSelector: string;
  highlightText: string;
  icon: typeof Play;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    timeRange: '0:00 - 0:08',
    title: 'Immediate Tension',
    headline: '94.2% Accuracy Hides High-Risk Failure',
    narrative: 'Top-line accuracy appears healthy at 94.2%, but malignant recall is only 22.4% — missing 3 out of 4 cancers. WhyLab detects the accuracy paradox immediately.',
    targetSelector: '.hero-tension-card',
    highlightText: 'Notice the immediate tension: 94.2% accuracy vs high-risk minority failure.',
    icon: ShieldAlert,
  },
  {
    id: 2,
    timeRange: '0:08 - 0:15',
    title: 'Evaluation Data',
    headline: 'Ingest Real Multi-Split Evaluation Data',
    narrative: 'WhyLab accepts raw evaluation outputs (y_true, y_pred, y_probability, metadata). It profiles class imbalance, calibration, and slice distributions without sending private data to LLMs.',
    targetSelector: '#dataset-heading',
    highlightText: 'Multi-split presets and drag-and-drop CSV validation.',
    icon: Target,
  },
  {
    id: 3,
    timeRange: '0:15 - 0:30',
    title: 'Astra Investigation',
    headline: 'Astra Calls Real Diagnostic Tools',
    narrative: 'GPT-6 Astra acts as an active investigator orchestrating statistical tools — prevalence sweeps, calibration, drift tests, and leakage scanners in an auditable activity log.',
    targetSelector: '#astra-lab',
    highlightText: 'Astra decides missing evidence and orchestrates diagnostic tool execution.',
    icon: Cpu,
  },
  {
    id: 4,
    timeRange: '0:30 - 0:43',
    title: 'Evidence Graph',
    headline: 'Auditable Causal Evidence Graph',
    narrative: 'Instead of hallucinated prose, WhyLab constructs a directed evidence graph linking raw statistical observations to ranked hypotheses with strict mathematical provenance.',
    targetSelector: '.evidence-graph',
    highlightText: 'Every diagnosis claim is anchored to a measured statistical test.',
    icon: Activity,
  },
  {
    id: 5,
    timeRange: '0:43 - 0:58',
    title: 'Falsification Engine',
    headline: 'WhyLab Tries to Disprove Itself',
    narrative: 'The falsification engine runs deterministic counterfactual experiments to test whether the accuracy paradox hypothesis holds under controlled stratification.',
    targetSelector: '#flagship',
    highlightText: 'Hypotheses are tested with counterfactuals before being accepted.',
    icon: Sparkles,
  },
  {
    id: 6,
    timeRange: '0:58 - 1:12',
    title: 'Repair Lab',
    headline: 'Cost-Sensitive Operating Policy Optimization',
    narrative: 'In high-stakes domains, false negatives are far more costly than false alarms. Astra recalculates the optimal operating threshold (τ = 0.19) for clinical cost asymmetry.',
    targetSelector: '#repair-lab',
    highlightText: 'Astra translates real-world clinical priorities into optimal decision thresholds.',
    icon: Target,
  },
  {
    id: 7,
    timeRange: '1:12 - 1:22',
    title: 'Measured Delta',
    headline: 'False Negatives Drop 776 → 148 (-81%)',
    narrative: 'The interactive 2x2 confusion matrix heatmap and reliability score recalculate live: False Negatives fall from 776 to 148, and reliability jumps from 38 to 81 (LOW RISK).',
    targetSelector: '.confusion-matrix-comparison',
    highlightText: 'Proven before-vs-after delta: 628 critical misses prevented.',
    icon: Award,
  },
  {
    id: 8,
    timeRange: '1:22 - 1:30',
    title: 'Engineering Artifacts',
    headline: 'Export CI Gates, GitHub Issues & Alert Rules',
    narrative: 'WhyLab concludes by generating exportable engineering artifacts: a complete ML Incident Report, automated CI Gate JSON, GitHub issue markdown, and Prometheus alert policies.',
    targetSelector: '.incident-export-section',
    highlightText: 'Production-ready engineering artifacts for engineering and MLOps teams.',
    icon: Cpu,
  },
];

export default function DemoTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const step = TOUR_STEPS[currentStep];

  const scrollToStep = useCallback((stepIdx: number) => {
    const s = TOUR_STEPS[stepIdx];
    if (!s) return;
    const el = document.querySelector(s.targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('tour-spotlight-active');
      setTimeout(() => {
        el.classList.remove('tour-spotlight-active');
      }, 2500);
    }
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev < TOUR_STEPS.length - 1 ? prev + 1 : 0;
      scrollToStep(next);
      return next;
    });
    setSecondsRemaining(10);
  }, [scrollToStep]);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev > 0 ? prev - 1 : TOUR_STEPS.length - 1;
      scrollToStep(next);
      return next;
    });
    setSecondsRemaining(10);
  }, [scrollToStep]);

  const selectStep = (idx: number) => {
    setCurrentStep(idx);
    scrollToStep(idx);
    setSecondsRemaining(10);
  };

  // Timer loop when playing
  useEffect(() => {
    if (!isPlaying || !isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsRemaining(sec => {
        if (sec <= 1) {
          nextStep();
          return 10;
        }
        return sec - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, isOpen, nextStep]);

  const togglePlay = () => {
    setIsPlaying(p => !p);
  };

  const startTour = () => {
    setIsOpen(true);
    setCurrentStep(0);
    setIsPlaying(true);
    setSecondsRemaining(10);
    setTimeout(() => scrollToStep(0), 100);
  };

  const StepIcon = step.icon;

  return (
    <>
      {/* Floating launcher trigger */}
      {!isOpen && (
        <button
          type="button"
          className="demo-tour-launcher-btn"
          onClick={startTour}
          title="Start 60-90 Second Product Hunt Guided Tour (§16)"
        >
          <Play size={15} className="play-icon" />
          <span className="tour-btn-text">🎬 60s Demo Tour</span>
          <span className="tour-badge-pulse" />
        </button>
      )}

      {/* Floating tour widget */}
      {isOpen && (
        <aside className="demo-tour-dock" aria-label="WhyLab Guided Demo Tour">
          <div className="tour-dock-header">
            <div className="tour-header-left">
              <span className="tour-live-dot" />
              <strong className="tour-tagline">PRODUCT HUNT 60s DEMO TOUR</strong>
              <span className="tour-step-counter">Step {step.id} of 8</span>
            </div>
            <div className="tour-header-controls">
              <span className="tour-step-timer">{step.timeRange}</span>
              <button
                type="button"
                className="tour-close-btn"
                onClick={() => {
                  setIsOpen(false);
                  setIsPlaying(false);
                }}
                aria-label="Close tour"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="tour-timeline-bar" role="progressbar" aria-valuenow={step.id} aria-valuemin={1} aria-valuemax={8}>
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                className={`timeline-segment ${idx === currentStep ? 'segment-active' : idx < currentStep ? 'segment-done' : ''}`}
                onClick={() => selectStep(idx)}
                title={`${s.id}. ${s.title}`}
              >
                <span className="sr-only">{s.title}</span>
              </button>
            ))}
          </div>

          <div className="tour-dock-body">
            <div className="tour-body-top">
              <div className="tour-icon-wrap">
                <StepIcon size={18} />
              </div>
              <div>
                <span className="tour-step-title">{step.title}</span>
                <h4 className="tour-step-headline">{step.headline}</h4>
              </div>
            </div>

            <p className="tour-step-narrative">{step.narrative}</p>

            <div className="tour-highlight-pill">
              <span className="highlight-tag">PROVENANCE:</span> {step.highlightText}
            </div>
          </div>

          <div className="tour-dock-footer">
            <div className="tour-footer-nav">
              <button
                type="button"
                className="tour-nav-btn"
                onClick={prevStep}
                title="Previous step"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                type="button"
                className={`tour-play-pause-btn ${isPlaying ? 'playing' : 'paused'}`}
                onClick={togglePlay}
                title={isPlaying ? 'Pause auto-play' : 'Play auto-play'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{isPlaying ? `Auto (${secondsRemaining}s)` : 'Resume'}</span>
              </button>
              <button
                type="button"
                className="tour-nav-btn primary"
                onClick={nextStep}
                title="Next step"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
