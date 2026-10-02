"use client";

import Link from "next/link";
import { useState } from "react";
import { useInvestigation } from "./investigation-context";
import { ShieldCheck, Key, FolderOpen, Plus, Home } from "lucide-react";

export default function StudioHeader({
  caseName,
  dirty,
  onToggleCaseManager,
}: {
  caseName?: string;
  dirty?: boolean;
  onToggleCaseManager?: () => void;
}) {
  const {
    deploymentToken,
    setDeploymentToken,
    sessionId,
    resetInvestigation,
    setShowReadinessModal,
  } = useInvestigation();

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(deploymentToken);

  const handleSaveToken = () => {
    setDeploymentToken(tokenDraft.trim());
    setShowTokenInput(false);
  };

  return (
    <header className="studio-topbar" role="banner">
      <div className="studio-topbar-left">
        <Link href="/" className="studio-wordmark" title="Return to WhyLab Home">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10" />
          </svg>
          <span className="studio-brand-title">WhyLab</span>
          <span className="studio-badge-env">Studio</span>
        </Link>

        <div className="studio-case-pill" onClick={onToggleCaseManager} role="button" tabIndex={0} title="Open Case Library">
          <FolderOpen size={13} className="studio-pill-icon" />
          <span className="studio-case-name">{caseName || "Untitled investigation"}</span>
          {dirty && <span className="studio-dirty-dot" title="Unsaved changes" />}
        </div>

        {sessionId && (
          <span className="studio-session-badge" title="24-hour retention session ID">
            ID: <code>{sessionId.slice(0, 8)}...</code>
          </span>
        )}
      </div>

      <div className="studio-topbar-right">
        <div className="studio-token-wrapper">
          <button
            type="button"
            className={`studio-token-btn ${deploymentToken ? "token-active" : ""}`}
            onClick={() => {
              setTokenDraft(deploymentToken);
              setShowTokenInput(!showTokenInput);
            }}
            title="Configure OpenAI API / Deployment Token"
          >
            <Key size={13} />
            <span>{deploymentToken ? "AI Configured" : "Enter Token"}</span>
          </button>

          {showTokenInput && (
            <div className="studio-token-popover" role="dialog" aria-label="Deployment Token Settings">
              <label htmlFor="studio-token-input">OpenAI Deployment Access Token</label>
              <input
                id="studio-token-input"
                type="password"
                placeholder="sk-..."
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <div className="studio-token-actions">
                <button type="button" className="btn-token-save" onClick={handleSaveToken}>
                  Save in Memory
                </button>
                <button
                  type="button"
                  className="btn-token-cancel"
                  onClick={() => setShowTokenInput(false)}
                >
                  Cancel
                </button>
              </div>
              <small className="token-help-note">
                Held in memory only. Never stored in localStorage or shared across origins.
              </small>
            </div>
          )}
        </div>

        <button
          type="button"
          className="studio-audit-btn"
          onClick={() => setShowReadinessModal(true)}
          title="Open 11-point submission readiness & compliance audit"
        >
          <ShieldCheck size={14} />
          <span className="audit-btn-text">Governance Gate</span>
        </button>

        <Link href="/" className="studio-nav-link" title="Return to WhyLab Landing Page">
          <Home size={14} />
          <span className="home-link-text">Home</span>
        </Link>

        <button
          type="button"
          className="new-button studio-new-btn"
          onClick={() => resetInvestigation(true)}
          title="Start a new investigation session"
        >
          <Plus size={14} />
          <span>New</span>
        </button>
      </div>
    </header>
  );
}
