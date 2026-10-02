"use client";

import { ReactNode } from "react";
import { InvestigationProvider } from "./investigation-context";

export default function AppProviders({ children }: { children: ReactNode }) {
  return <InvestigationProvider>{children}</InvestigationProvider>;
}
