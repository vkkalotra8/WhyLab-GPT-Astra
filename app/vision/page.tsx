import type { Metadata } from "next";
import Link from "next/link";
import VisionLab from "../components/vision-lab";
import { ArrowLeft, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "WhyLab — Vision Reliability Lab",
  description:
    "Computer vision failure auditing, near-duplicate leakage detection, slice evaluation, and concept falsification.",
};

export default function VisionPage() {
  return (
    <div className="site-shell vision-page-shell">
      <header className="topbar">
        <Link href="/" className="wordmark" title="WhyLab Home">
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
            <path d="M9 3h6M10 3v7L4 20h16l-6-10V3M7 15h10" />
          </svg>
          WhyLab
          <span className="version">
            <span className="status-dot" />
            Vision Lab
          </span>
        </Link>
        <nav aria-label="Vision navigation">
          <Link href="/investigate" className="studio-nav-link">
            <ArrowLeft size={14} /> Investigation Studio
          </Link>
          <Link href="/" className="studio-nav-link">
            <Home size={14} /> Home
          </Link>
        </nav>
        <Link href="/investigate" className="new-button">
          Open Studio
        </Link>
      </header>

      <main className="vision-main-container">
        <VisionLab />
      </main>

      <footer>
        <Link href="/" className="footer-brand">
          WhyLab
          <span>Stay curious. Investigate the why.</span>
        </Link>
        <span>
          Built with GPT-6 Astra <span className="footer-dot">·</span> Computer Vision Reliability
        </span>
      </footer>
    </div>
  );
}
