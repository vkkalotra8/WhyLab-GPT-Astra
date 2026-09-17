"use client";
import CaseStudies from './case-studies';
import RepairLab from './repair-lab';
import FlagshipMelanoma from './flagship-melanoma';
import { useEffect, useRef, useState } from "react";
import { filterFindings } from "../lib/evidence";
import { useCaseState, useNewCase } from "./case-manager";
import EvidenceImport from "./evidence-import";
import { runIngestion } from "../lib/ingestion-client";
import AstraInvestigation from './astra-investigation';
import DatasetLab from "./dataset-lab";
import EvidenceSummary from "./evidence-summary";
const sample = `[experiment] image_classifier_v3 / ResNet-18
[epoch 26/30] train_loss=0.14 val_loss=0.15 train_accuracy=0.95 val_accuracy=0.948
[epoch 27/30] train_loss=0.12 val_loss=0.16 train_accuracy=0.96 val_accuracy=0.946
[epoch 28/30] train_loss=0.10 val_loss=0.17 train_accuracy=0.97 val_accuracy=0.945
[epoch 29/30] train_loss=0.09 val_loss=0.18 train_accuracy=0.98 val_accuracy=0.943
[epoch 30/30] train_loss=0.084 val_loss=0.192 train_accuracy=0.985 val_accuracy=0.942
[validation] accuracy=0.942 samples=2400
[production] accuracy=0.618 samples=1800
[data] train=studio_images production=mobile_photos
[classes] majority=72% minority_recall=0.38
[audit] duplicate_check=pending`;
const tabs = ["Upload", "Paste logs", "Try an example"];
const stages = ["Inspecting evidence", "Testing hypotheses", "Building lesson"];

function Icon({ type = "flask" }: {
    type?: string;
}) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={type === "upload" ? "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" : type === "arrow" ? "M4 12h16m-6-6 6 6-6 6" : type === "spark" ? "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3" : "M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10"}/></svg>; }
function Chart() { return <div className="chart"><div className="chart-heading"><span>ACCURACY ACROSS ENVIRONMENTS</span><span>30 epochs</span></div><svg viewBox="0 0 440 125" role="img" aria-label="Illustrative accuracy curves: validation reaches 94.2 percent and production reaches 61.8 percent."><g stroke="#283443" strokeDasharray="3 5"><path d="M34 20H425M34 60H425M34 100H425"/></g><g fill="#94a1b4" fontSize="10" fontFamily="monospace"><text x="0" y="24">100</text><text x="7" y="64">70</text><text x="7" y="104">40</text></g><path d="M35 101 65 84 95 67 125 57 155 42 185 35 215 30 245 27 275 25 305 23 335 23 365 22 423 22" fill="none" stroke="#56dfce" strokeWidth="2.5"/><path d="M35 106 65 92 95 84 125 77 155 70 185 72 215 68 245 71 275 69 305 73 335 71 365 74 423 73" fill="none" stroke="#c1a2ff" strokeWidth="2.5" strokeDasharray="5 4"/><circle cx="423" cy="22" r="4" fill="#56dfce"/><circle cx="423" cy="73" r="4" fill="#c1a2ff"/></svg><div className="legend"><span className="cyan">● Validation</span><span className="violet">● Production</span><span>Illustrative data</span></div></div>; }
export default function InvestigationLab() {
    const newCase = useNewCase();
    const [astraKey,setAstraKey]=useState(0);
    const [deploymentToken, setDeploymentToken] = useState('');
    const [tab, setTab] = useCaseState("tab"), [logs, setLogs] = useCaseState("logs"), [file, setFile] = useState<File | null>(null), [analysis, setAnalysis] = useCaseState("analysis"), [drag, setDrag] = useState(false), [error, setError] = useState(""), [stage, setStage] = useState(-1), [complete, setComplete] = useCaseState("complete"), [expanded, setExpanded] = useState<number | null>(0);
    const input = useRef<HTMLInputElement>(null), result = useRef<HTMLElement>(null);
    const [evidence, setEvidence] = useCaseState("evidence");
    const [reading, setReading] = useState(false);
    const request = useRef(0);
    const parserController=useRef<AbortController|null>(null);
    const [extendedBusy,setExtendedBusy]=useState(false);
    const busy = stage >= 0 || reading || extendedBusy;
    const hypotheses = evidence ? filterFindings(evidence, analysis) : [];
    function invalidate() { parserController.current?.abort(); request.current++; setEvidence(null); setComplete(false); setError(""); setExpanded(0); }
    useEffect(() => () => { parserController.current?.abort(); request.current++; }, []);
    useEffect(() => { if (stage < 0)
        return; const timer = window.setTimeout(() => { if (stage < 2)
        setStage(stage + 1);
    else {
        setStage(-1);
        setComplete(true);
    } }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 850); return () => window.clearTimeout(timer); }, [stage, setComplete]);
    useEffect(() => { if (complete)
        result.current?.focus(); }, [complete]);
    function choose(next: number) { invalidate(); setTab(next); setError(""); if (next === 2) {
        setLogs(sample);
        setAnalysis("General diagnosis");
    } }
    function accept(next?: File) { invalidate(); setFile(null); setDrag(false); if (!next)
        return; if (!/\.(csv|txt|log|json)$/i.test(next.name)) {
        setError("Choose a CSV, TXT, LOG, or JSON file.");
        return;
    } if (next.size > 10 * 1024 * 1024) {
        setError("Please choose a file smaller than 10 MB.");
        return;
    } setFile(next); setError(""); }
    async function investigate() {
        if (tab === 0 ? !file : !logs.trim()) {
            setError(tab === 0 ? "Add an evidence file or try the example to begin." : "Paste your training logs to begin.");
            return;
        }
        invalidate();
        const current = request.current;
        setReading(true);
        const controller=new AbortController(); parserController.current=controller;
        try {
            const text = tab === 0 ? await file!.text() : logs;
            if (current !== request.current) return;
            const parsed = await runIngestion<import("../lib/evidence").Evidence>("analyze",[{text,name:tab === 0 ? file!.name : tab === 2 ? "Example logs" : "Pasted logs"}],controller.signal);
            if (current !== request.current) return;
            setEvidence(parsed);
            setStage(0);
        } catch (cause) {
            if (current === request.current) setError(cause instanceof Error ? cause.message : "Unable to read this file. Try exporting it as UTF-8 text.");
        } finally {
            if (current === request.current) setReading(false);
        }
    }
    const [activeNav, setActiveNav] = useState("workspace");
    const isNavClicking = useRef(false);
    const navClickTimeout = useRef<number | null>(null);

    useEffect(() => {
        function checkHash() {
            const h = window.location.hash.replace("#", "");
            if (["workspace", "flagship", "astra-lab", "repair-lab"].includes(h)) {
                setActiveNav(h);
            }
        }
        checkHash();
        window.addEventListener("hashchange", checkHash);

        const ids = ["workspace", "flagship", "astra-lab", "repair-lab"];
        const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
            if (isNavClicking.current) return;
            const visible = entries.filter(e => e.isIntersecting);
            if (visible.length > 0) {
                visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                setActiveNav(visible[0].target.id);
            }
        }, {
            rootMargin: "-90px 0px -50% 0px",
            threshold: [0.15, 0.4, 0.7]
        }) : null;

        if (observer) {
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) observer.observe(el);
            });
        }

        return () => {
            window.removeEventListener("hashchange", checkHash);
            observer?.disconnect();
            if (navClickTimeout.current) window.clearTimeout(navClickTimeout.current);
        };
    }, []);

    function handleNavClick(navId: string) {
        setActiveNav(navId);
        isNavClicking.current = true;
        if (navClickTimeout.current) window.clearTimeout(navClickTimeout.current);
        navClickTimeout.current = window.setTimeout(() => {
            isNavClicking.current = false;
        }, 800);
    }

    async function example(autoRun: boolean | React.MouseEvent = true) {
        const shouldRun = typeof autoRun === "boolean" ? autoRun : true;
        handleNavClick("examples");
        choose(2);
        document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });
        if (shouldRun) {
            invalidate();
            const current = request.current;
            setReading(true);
            const controller = new AbortController();
            parserController.current = controller;
            try {
                const parsed = await runIngestion<import("../lib/evidence").Evidence>("analyze", [{ text: sample, name: "Example logs" }], controller.signal);
                if (current !== request.current) return;
                setEvidence(parsed);
                setStage(0);
            } catch (cause) {
                if (current === request.current) setError(cause instanceof Error ? cause.message : "Unable to read this file. Try exporting it as UTF-8 text.");
            } finally {
                if (current === request.current) setReading(false);
            }
        }
    }

    function reset() {
        setAstraKey(k => k + 1);
        newCase();
        invalidate();
        handleNavClick("workspace");
        if (typeof window !== "undefined") {
            if (window.location.hash) {
                history.replaceState(null, "", window.location.pathname);
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }

    return <div className="site-shell">
      <header className="topbar">
        <a href="#" className="wordmark" onClick={() => handleNavClick("workspace")}>
          <Icon />WhyLab<span className="version">BETA 0.1</span>
        </a>
        <nav aria-label="Main navigation">
          <a
            className={activeNav === "workspace" ? "nav-active" : undefined}
            href="#workspace"
            onClick={() => handleNavClick("workspace")}
          >
            Investigation Lab
          </a>
          <a
            className={activeNav === "flagship" ? "nav-active" : undefined}
            href="#flagship"
            onClick={() => handleNavClick("flagship")}
          >
            Flagship Case
          </a>
          <a
            className={activeNav === "astra-lab" ? "nav-active" : undefined}
            href="#astra-lab"
            onClick={() => handleNavClick("astra-lab")}
          >
            Astra Investigator
          </a>
          <a
            className={activeNav === "repair-lab" ? "nav-active" : undefined}
            href="#repair-lab"
            onClick={() => handleNavClick("repair-lab")}
          >
            Repair Lab
          </a>
          <button
            type="button"
            className={activeNav === "examples" ? "nav-active" : undefined}
            disabled={busy}
            onClick={() => void example(true)}
          >
            Examples
          </button>
        </nav>
        <button className="new-button" onClick={reset}>
          <span>+</span> New investigation
        </button>
      </header>

      <main>
        <section className="hero">
          <div>
            <div className="eyebrow cyan">
              <span className="status-dot" /> AI ML Reliability Investigator
            </div>
            <h1>Every failed model is trying<br className="desktop-break" /> to tell you <span>something.</span></h1>
            <p>Turn failed experiments into evidence-backed diagnoses.<br className="desktop-break" /> Find the why, test your hypotheses, and learn what to do next.</p>
            <div className="hero-tags">
              <span>Evidence, not guesswork</span>
              <span>Scientific clarity</span>
              <span>Built for curious engineers</span>
            </div>
            <div className="hero-distinction-banner" role="note">
              <span className="distinction-item">
                <strong className="distinction-tag tag-local">Local deterministic analysis</strong>
                <span className="distinction-copy">Free, instant, runs completely in your browser without API keys.</span>
              </span>
              <span className="distinction-divider" aria-hidden="true">·</span>
              <span className="distinction-item">
                <strong className="distinction-tag tag-astra">Astra-powered investigation</strong>
                <span className="distinction-copy">Autonomous AI diagnostics requiring your own API/deployment token.</span>
              </span>
            </div>
            <div className="hero-actions">
              <a className="hero-primary" href="#astra-lab">
                Start an Astra investigation <span aria-hidden="true">→</span>
              </a>
              <a className="hero-secondary" href="#workspace">
                Explore the workbench
              </a>
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
              <div className="orbit-center"><Icon /></div>

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

        <ol className="workbench-flow" aria-label="WhyLab investigation workflow">
          <li><strong>01</strong><span>Observe<br /><small>the failure signal</small></span></li>
          <li><strong>02</strong><span>Investigate<br /><small>with measured evidence</small></span></li>
          <li><strong>03</strong><span>Test<br /><small>the strongest hypothesis</small></span></li>
          <li><strong>04</strong><span>Repair<br /><small>and re-evaluate</small></span></li>
        </ol>

        <FlagshipMelanoma key={`flagship-${astraKey}`} />
        <CaseStudies key={`cases-${astraKey}`} />
        <AstraInvestigation
          key={astraKey}
          sharedToken={deploymentToken}
          onSharedTokenChange={setDeploymentToken}
        />
        <RepairLab
          key={`repair-${astraKey}`}
          sharedToken={deploymentToken}
          onSharedTokenChange={setDeploymentToken}
        />

        <section id="workspace">
          <div className="section-heading">
            <h2><span className="section-number">02 /</span> Investigation workspace</h2>
            <span className="local-note"><span className="status-dot" /> LOCAL PROTOTYPE · IN-BROWSER EXECUTION</span>
          </div>
          <div className="workspace-grid">
            <section className="panel input-panel" aria-labelledby="evidence-heading">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">START WITH THE EVIDENCE</span>
                  <h3 id="evidence-heading">What went wrong?</h3>
                </div>
                <span className="step-number">01</span>
              </div>
              <p className="description">Bring your logs, metrics, or dataset. Let’s connect the dots.</p>
              <div role="tablist" aria-label="Evidence source" className="tabs">
                {tabs.map((item, i) => (
                  <button
                    key={item}
                    id={`tab-${i}`}
                    role="tab"
                    aria-selected={tab === i}
                    aria-controls="evidence-panel"
                    tabIndex={tab === i ? 0 : -1}
                    disabled={busy}
                    onClick={() => choose(i)}
                    onKeyDown={e => {
                      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
                        e.preventDefault();
                        const next = e.key === "Home" ? 0 : e.key === "End" ? 2 : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                        choose(next);
                        document.getElementById(`tab-${next}`)?.focus();
                      }
                    }}
                  >
                    <span aria-hidden="true">{i === 0 ? "\u21a5" : i === 1 ? "\u2261" : "\u2727"}</span>
                    {item}
                  </button>
                ))}
              </div>
              <div id="evidence-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                {tab === 0 ? (
                  <>
                    <input
                      ref={input}
                      className="sr-only"
                      type="file"
                      tabIndex={-1}
                      aria-label="Evidence file"
                      accept=".csv,.txt,.log,.json"
                      disabled={busy}
                      onChange={e => accept(e.target.files?.[0])}
                    />
                    <button
                      className={`dropzone ${drag ? "dragging" : ""}`}
                      disabled={busy}
                      onClick={() => input.current?.click()}
                      onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={e => { e.preventDefault(); if (!busy) accept(e.dataTransfer.files[0]); }}
                    >
                      <Icon type="upload" />
                      <strong>{file ? file.name : "Drop your evidence here"}</strong>
                      <span>{file ? `${(file.size / 1024).toFixed(1)} KB · Click to replace file` : <>or <em>browse files</em> to get started</>}</span>
                      <small>CSV, TXT, LOG, JSON · Up to 10 MB</small>
                    </button>
                  </>
                ) : (
                  <div className="logs-wrap">
                    <div className="logs-label-row">
                      <label htmlFor="logs">{tab === 2 ? "IMAGE CLASSIFIER · SAMPLE LOGS" : "TRAINING LOGS & METRICS"}</label>
                      {tab === 2 && (
                        <button
                          type="button"
                          className="btn-text-run"
                          disabled={busy}
                          onClick={() => void example(true)}
                        >
                          ⚡ Run sample diagnosis (1-click)
                        </button>
                      )}
                    </div>
                    <textarea
                      id="logs"
                      value={logs}
                      disabled={busy}
                      onChange={e => { invalidate(); setLogs(e.target.value); }}
                      placeholder="Paste epoch logs, metrics, or experiment notes..."
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>
              <label className="select-label" htmlFor="analysis">
                Analysis type <span>Choose your investigation lens</span>
              </label>
              <select id="analysis" value={analysis} disabled={busy} onChange={e => { invalidate(); setAnalysis(e.target.value); }}>
                <option>General diagnosis</option>
                <option>Data quality & distribution</option>
                <option>Training & optimization</option>
                <option>Evaluation & leakage</option>
              </select>
              <p className="error" role="alert">{error}</p>
              <button className="investigate-button" disabled={busy} onClick={investigate}>
                <Icon type="spark" />
                {reading ? "Reading evidence…" : stage >= 0 ? stages[stage] : "Investigate failure"}
                <Icon type="arrow" />
              </button>
              <div className="input-footnote" role="status">
                {busy ? (
                  <span className="stages">
                    {stages.map((label, i) => (
                      <span key={label} className={i <= stage ? "cyan" : ""}>
                        {i < stage ? "\u2713" : `0${i + 1}`} {label}
                      </span>
                    ))}
                  </span>
                ) : (
                  "Frontend demo · Your evidence stays in your browser"
                )}
              </div>
            </section>

            <section className="panel preview-panel" aria-labelledby="case-heading">
              <div className="case-top">
                <span className="eyebrow">· CASE FILE / 001</span>
                <span className="badge">SAMPLE INVESTIGATION</span>
              </div>
              <h3 id="case-heading">Great in validation.<br />Lost in production.</h3>
              <p className="description">An image classifier with a real-world reality check.</p>
              <div className="model-tags">
                <span>Computer vision</span>
                <span>ResNet-18</span>
                <span>30 epochs</span>
              </div>
              <div className="metrics">
                <div>
                  <span>Validation accuracy</span>
                  <strong className="cyan">94.2<small>%</small></strong>
                  <span>Looking good in the lab</span>
                </div>
                <div>
                  <span>Production accuracy</span>
                  <strong className="violet">61.8<small>%</small></strong>
                  <span>A different story outside</span>
                </div>
              </div>
              <Chart />
              <div className="gap-note">
                <span>↘</span>
                <p>
                  <strong>32.4 percentage points. One important question.</strong><br />
                  What changed between validation and the real world?
                </p>
              </div>
              <div className="case-bottom">
                <span>3 hypotheses. A path to understanding.</span>
                <button disabled={busy} onClick={() => void example(true)}>
                  Run sample diagnosis (1-click) <Icon type="arrow" />
                </button>
              </div>
            </section>
          </div>
        </section>

        {complete && (
          <section className="results panel" ref={result} tabIndex={-1} aria-labelledby="results-heading">
            <div className="section-heading">
              <div>
                <span className="eyebrow cyan">INVESTIGATION COMPLETE / LOCAL EVIDENCE</span>
                <h2 id="results-heading">Follow the evidence.</h2>
              </div>
              <span className="badge">{analysis}</span>
            </div>
            <p className="description">Rule-based suggestions from your evidence, not confirmed causes. Evidence strength describes the supporting signal; it is not a probability.</p>
            {evidence && <EvidenceSummary evidence={evidence} />}
            {hypotheses.length === 0 && (
              <p className="empty-findings">No supported hypotheses for this analysis lens. This does not mean the experiment is healthy. Add comparable train, validation, and production metrics, or choose General diagnosis.</p>
            )}
            {hypotheses.map((h, i) => (
              <article className={`hypothesis tone-${i}`} key={h.title}>
                <button
                  className="hypothesis-toggle"
                  aria-expanded={expanded === i}
                  aria-controls={`hypothesis-${i}`}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="rank">0{i + 1}</span>
                  <span className="hypothesis-title">{h.title}</span>
                  <span className="confidence">
                    {h.strength}<small>evidence strength</small>
                  </span>
                  <span>{expanded === i ? "−" : "+"}</span>
                </button>
                {expanded === i && (
                  <div id={`hypothesis-${i}`} className="hypothesis-detail">
                    <div>
                      <span className="eyebrow">EVIDENCE EXCERPT</span>
                      <p>{h.evidence}</p>
                    </div>
                    <div>
                      <span className="eyebrow">VERIFICATION EXPERIMENT</span>
                      <p>{h.experiment}</p>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        <EvidenceImport disabled={stage >= 0 || reading} onBusyChange={setExtendedBusy} />
        <DatasetLab evidence={complete ? evidence : null} />

        <section className="learning" aria-labelledby="learning-heading">
          <div className="learning-intro">
            <span className="eyebrow">FAILURE IS A STARTING POINT</span>
            <h2 id="learning-heading">What you’ll learn.</h2>
            <p>A diagnosis is useful.<br />Understanding it changes everything.</p>
          </div>
          {[
            { n: "01", title: "Read the signals", text: "See what loss curves, metrics, and data patterns are really telling you.", icon: "\u224b" },
            { n: "02", title: "Think in hypotheses", text: "Connect evidence to likely causes. Learn why one explanation fits better.", icon: "\u22c8" },
            { n: "03", title: "Test. Learn. Iterate.", text: "Turn a diagnosis into a focused experiment and a better next model.", icon: "\u2197" },
          ].map(item => (
            <div className="lesson" key={item.n}>
              <div className="lesson-top">
                <span>{item.icon}</span>
                <span>{item.n}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer>
        <a href="#" className="footer-brand">
          <Icon />WhyLab
          <span>Stay curious. Investigate the why.</span>
        </a>
        <span>Built with GPT-6 Astra <span className="footer-dot">·</span> ML Incident Investigation Platform</span>
      </footer>
    </div>;
}
