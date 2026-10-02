"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Activity, GitFork, Cpu } from "lucide-react";
import FlagshipMelanoma from "./flagship-melanoma";
import CaseStudies from "./case-studies";
import DemoTour from "./demo-tour";

function Icon({ type = "flask" }: { type?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          type === "upload"
            ? "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"
            : type === "arrow"
            ? "M4 12h16m-6-6 6 6-6 6"
            : type === "spark"
            ? "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3"
            : "M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"
        }
      />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="topbar">
        <Link href="/" className="wordmark" title="WhyLab Home">
          <Icon />
          WhyLab
          <span className="version">
            <span className="status-dot" />
            v1.0 Production
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/investigate">Studio</Link>
          <a href="#flagship">Flagship Demo</a>
          <a href="#case-studies">Case Studies</a>
          <Link href="/vision">Vision Lab</Link>
          <a href="#workflow">How It Works</a>
        </nav>
        <Link href="/investigate" className="new-button btn-launch-studio">
          Launch Studio <ArrowRight size={14} />
        </Link>
      </header>

      <main id="main-content">
        {/* =========================================================================
            HERO SECTION
            ========================================================================= */}
        <section className="hero">
          <div>
            <div className="eyebrow cyan">
              <span className="status-dot" /> AI ML RELIABILITY INVESTIGATOR
            </div>
            <h1>
              Every failed model is trying <br className="desktop-break" />
              to tell you <span>something.</span>
            </h1>
            <div className="mental-model-badge">
              <span>Sentry for software</span> · <span>Datadog for infra</span> ·{" "}
              <strong className="cyan-text">WhyLab for machine learning</strong>
            </div>
            <p className="hero-lead">
              Upload your evaluation data. WhyLab investigates why your model is failing,
              proves the root cause with counterfactual experiments, and repairs your
              operating policy.
            </p>

            <div
              className="hero-tension-card"
              role="region"
              aria-label="Incident Tension Callout"
            >
              <div className="tension-half tension-model">
                <span className="tension-speaker">YOUR MODEL SAYS</span>
                <strong className="tension-metric text-cyan">94.2% ACCURACY</strong>
                <span className="tension-sub">Looks excellent at first glance</span>
              </div>
              <div className="tension-divider" aria-hidden="true">
                VS
              </div>
              <div className="tension-half tension-whylab">
                <span className="tension-speaker">WHYLAB SAYS</span>
                <strong className="tension-metric text-danger">
                  HIGH-RISK FAILURE DETECTED
                </strong>
                <span className="tension-sub">
                  Malignant recall: 22.4% · Misses 3 out of 4 cancers
                </span>
              </div>
            </div>

            <div className="hero-tags">
              <span>Evidence, not guesswork</span>
              <span>Scientific provenance</span>
              <span>Falsification engine</span>
            </div>

            <div className="hero-distinction-banner" role="note">
              <span className="distinction-item">
                <strong className="distinction-tag tag-local">
                  Local deterministic analysis
                </strong>
                <span className="distinction-copy">
                  Free, instant, runs completely in your browser without API keys.
                </span>
              </span>
              <span className="distinction-divider" aria-hidden="true">
                ·
              </span>
              <span className="distinction-item">
                <strong className="distinction-tag tag-astra">
                  Astra-powered investigation
                </strong>
                <span className="distinction-copy">
                  Autonomous AI diagnostics requiring your own API/deployment token.
                </span>
              </span>
            </div>

            <div className="hero-actions">
              <Link className="hero-primary" href="/investigate">
                Launch Investigation Studio <ArrowRight size={14} />
              </Link>
              <a className="hero-secondary" href="#flagship">
                Run Flagship Melanoma Demo
              </a>
              <Link className="hero-secondary" href="/vision">
                Explore Vision Lab
              </Link>
            </div>
          </div>

          <div className="orbit-frame">
            <div className="orbit" aria-hidden="true">
              <div className="radar-sweep" />
              <div className="ring ring-outer-base" />
              <div className="ring ring-inner-base" />
              <div className="ring outer" />
              <div className="ring inner" />
              <div className="axis horizontal" />
              <div className="axis vertical" />
              <div className="orbit-center">
                <Icon />
              </div>

              <div className="satellite satellite-a">
                <div className="arm-a">
                  <i className="node node-a" />
                  <div className="anchor-a">
                    <span className="orbit-label label-a">OBSERVE</span>
                  </div>
                </div>
              </div>

              <div className="satellite satellite-b">
                <div className="arm-b">
                  <i className="node node-b" />
                  <div className="anchor-b">
                    <span className="orbit-label label-b">QUESTION</span>
                  </div>
                </div>
              </div>

              <div className="satellite satellite-c">
                <div className="arm-c">
                  <i className="node node-c" />
                  <div className="anchor-c">
                    <span className="orbit-label label-c">UNDERSTAND</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            FLAGSHIP MELANOMA DEMO SHOWCASE
            ========================================================================= */}
        <section id="flagship" className="landing-flagship-wrapper">
          <div className="landing-section-intro">
            <span className="eyebrow cyan">1-CLICK DETERMINISTIC BENCHMARK</span>
            <h2>Interactive Melanoma Failure Demonstration</h2>
            <p>
              Test the accuracy paradox deterministically. Follow the evidence, evaluate
              counterfactual tests, and inspect the measured threshold repair.
            </p>
          </div>
          <FlagshipMelanoma />
          <div className="landing-demo-bridge-callout">
            <p>
              Want to investigate your own evaluation dataset with autonomous tool calling?
            </p>
            <Link href="/investigate" className="hero-primary">
              Open Investigation Studio <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* =========================================================================
            CASE STUDIES SECTION
            ========================================================================= */}
        <section id="case-studies" className="landing-cases-wrapper">
          <div className="landing-section-intro">
            <span className="eyebrow cyan">REAL-WORLD INCIDENT BENCHMARKS</span>
            <h2>Proven Reliability Case Studies</h2>
            <p>
              Explore real-world failure patterns: probability calibration drift in clinical ICU
              predictions and covariate site shift in multi-hospital deployments.
            </p>
          </div>
          <CaseStudies />
        </section>

        {/* =========================================================================
            4-STEP WORKFLOW PIPELINE
            ========================================================================= */}
        <section id="workflow" className="landing-workflow-section">
          <div className="landing-section-intro">
            <span className="eyebrow cyan">SCIENTIFIC METHOD FOR ML</span>
            <h2>How WhyLab Investigates Failure</h2>
            <p>
              WhyLab replaces guesswork with a rigorous 4-step causal discovery pipeline.
            </p>
          </div>

          <div className="workflow-cards-grid">
            <div className="workflow-step-card">
              <div className="workflow-step-header">
                <span className="step-badge">STEP 01</span>
                <Activity size={20} className="step-icon text-cyan" />
              </div>
              <h3>1. Observe the Signal</h3>
              <p>
                Ingest evaluation outputs (y_true, y_pred, y_probability). Expose accuracy
                paradoxes and slice performance drop-offs across production environments.
              </p>
            </div>

            <div className="workflow-step-card">
              <div className="workflow-step-header">
                <span className="step-badge">STEP 02</span>
                <GitFork size={20} className="step-icon text-violet" />
              </div>
              <h3>2. Form Competing Hypotheses</h3>
              <p>
                Astra generates falsifiable explanations: class imbalance, covariate shift,
                calibration drift, or data leakage. Every hypothesis is tied to evidence.
              </p>
            </div>

            <div className="workflow-step-card">
              <div className="workflow-step-header">
                <span className="step-badge">STEP 03</span>
                <Cpu size={20} className="step-icon text-cyan" />
              </div>
              <h3>3. Falsification Testing</h3>
              <p>
                Autonomous diagnostic tool calls run statistical tests (Fisher&apos;s exact,
                Wilson intervals, stratified resampling) to actively attempt to disprove
                hypotheses.
              </p>
            </div>

            <div className="workflow-step-card">
              <div className="workflow-step-header">
                <span className="step-badge">STEP 04</span>
                <ShieldCheck size={20} className="step-icon text-green" />
              </div>
              <h3>4. Repair &amp; Re-Test</h3>
              <p>
                Sweep 101 operating boundaries under your domain cost model. Re-test the
                optimized policy on an unchanged holdout to mathematically prove recovery.
              </p>
            </div>
          </div>
        </section>

        {/* =========================================================================
            GLOBAL CALL TO ACTION BANNER
            ========================================================================= */}
        <section className="landing-cta-banner">
          <div className="cta-banner-content">
            <h2>Ready to investigate your model&apos;s failure?</h2>
            <p>
              Bring your own evaluation CSV, explore presets, or launch the autonomous Astra
              investigator in our connected 6-stage studio.
            </p>
            <div className="cta-banner-actions">
              <Link href="/investigate" className="hero-primary">
                Open Investigation Studio <ArrowRight size={16} />
              </Link>
              <Link href="/vision" className="hero-secondary">
                Explore Vision Reliability Lab
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <Link href="/" className="footer-brand">
          <Icon />
          WhyLab
          <span>Stay curious. Investigate the why.</span>
        </Link>
        <span>
          Built with GPT-6 Astra <span className="footer-dot">·</span> ML Incident Investigation Platform
        </span>
      </footer>

      <DemoTour />
    </div>
  );
}
