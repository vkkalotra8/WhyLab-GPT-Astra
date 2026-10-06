import type { Metadata } from "next";
import InvestigationStudio from "../components/investigation-studio";
import CaseManager from "../components/case-manager";

export const metadata: Metadata = {
  title: "WhyLab Studio — Connected Investigation Workspace",
  description:
    "Enterprise machine learning failure investigation, counterfactual verification, and policy repair.",
};

export default function InvestigatePage() {
  return (
    <CaseManager>
      <InvestigationStudio />
    </CaseManager>
  );
}
