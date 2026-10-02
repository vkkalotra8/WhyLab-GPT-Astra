"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Root Route Template: Handles the motion of page landing while moving
 * from one page to another throughout the WhyLab hybrid multi-page application.
 *
 * Ensures:
 * 1. The viewport cleanly lands at the top (scrollTop: 0) on every route navigation.
 * 2. An ultra-smooth, scientific entrance motion (fade + vertical settle) plays on route landing.
 * 3. A luminous top landing beam provides immediate visual confirmation of route completion.
 * 4. Full accessibility and immediate collapse under prefers-reduced-motion: reduce.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Reset window scroll position to the top immediately upon landing on the new route
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [pathname]);

  return (
    <div key={pathname} className="page-transition-wrapper">
      <div className="page-landing-beam" aria-hidden="true" />
      {children}
    </div>
  );
}
