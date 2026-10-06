"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Investigation } from "../lib/investigation/types";
import type { EvaluationDataset } from "../lib/investigation/evaluation-ingestion";

export interface SharedEvaluationData {
  name: string;
  csv: string;
  positive?: string;
  negative?: string;
}

export interface InvestigationContextType {
  activeStage: number;
  setActiveStage: (stage: number) => void;
  activeNav: string;
  setActiveNav: (nav: string) => void;
  deploymentToken: string;
  setDeploymentToken: (token: string) => void;
  sharedEvaluationData: SharedEvaluationData | null;
  setSharedEvaluationData: (data: SharedEvaluationData | null) => void;
  activeInvestigation: Investigation | null;
  setActiveInvestigation: (inv: Investigation | null) => void;
  boundRepairDatasets: EvaluationDataset[];
  setBoundRepairDatasets: (datasets: EvaluationDataset[]) => void;
  isStale: boolean;
  setIsStale: (stale: boolean) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  showReadinessModal: boolean;
  setShowReadinessModal: (show: boolean) => void;
  stagesCompleted: Record<number, boolean>;
  stagesAvailable: Record<number, boolean>;
  handleStageSelect: (stageId: number) => void;
  handleTransferToAstra: (data: SharedEvaluationData) => void;
  handleInvestigationComplete: (
    inv: Investigation,
    bound: EvaluationDataset[]
  ) => void;
  handleFlagshipComplete: (inv: Investigation) => void;
  resetInvestigation: (confirmPrompt?: boolean) => boolean;
  astraKey: number;
}

const InvestigationContext = createContext<InvestigationContextType | null>(null);

export function useInvestigation() {
  const context = useContext(InvestigationContext);
  if (!context) {
    throw new Error(
      "useInvestigation must be used within an InvestigationProvider"
    );
  }
  return context;
}

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const [activeStage, setActiveStage] = useState(1);
  const [activeNav, setActiveNav] = useState("workspace");
  const [astraKey, setAstraKey] = useState(0);
  const [deploymentToken, setDeploymentToken] = useState("");
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [sharedEvaluationData, setSharedEvaluationData] =
    useState<SharedEvaluationData | null>(null);
  const [activeInvestigation, setActiveInvestigation] =
    useState<Investigation | null>(null);
  const [boundRepairDatasets, setBoundRepairDatasets] = useState<
    EvaluationDataset[]
  >([]);
  const [isStale, setIsStale] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Sync stage with URL query parameter when available
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const stageParam = params.get("stage");
      if (stageParam) {
        const stageMap: Record<string, number> = {
          ingest: 1,
          profile: 2,
          investigate: 3,
          verify: 4,
          repair: 5,
          report: 6,
          "1": 1,
          "2": 2,
          "3": 3,
          "4": 4,
          "5": 5,
          "6": 6,
        };
        const targetStage = stageMap[stageParam.toLowerCase()];
        if (targetStage && targetStage >= 1 && targetStage <= 6) {
          setActiveStage(targetStage);
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          if (document.documentElement) document.documentElement.scrollTop = 0;
          if (document.body) document.body.scrollTop = 0;
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    const timer = setTimeout(handlePopState, 0);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      clearTimeout(timer);
    };
  }, []);

  const stagesCompleted: Record<number, boolean> = {
    1: Boolean(sharedEvaluationData),
    2: Boolean(sharedEvaluationData && sharedEvaluationData.csv.length > 0),
    3: Boolean(activeInvestigation !== null),
    4: Boolean(
      activeInvestigation &&
        activeInvestigation.hypotheses &&
        activeInvestigation.hypotheses.some(
          (h) =>
            h.status === "supported" ||
            h.status === "confirmed" ||
            h.status === "rejected"
        )
    ),
    5: Boolean(
      activeInvestigation &&
        activeInvestigation.comparisons &&
        activeInvestigation.comparisons.length > 0
    ),
    6: Boolean(activeInvestigation !== null),
  };

  const stagesAvailable: Record<number, boolean> = {
    1: true,
    2: true,
    3: Boolean(sharedEvaluationData || activeInvestigation),
    4: Boolean(
      activeInvestigation && activeInvestigation.hypotheses.length > 0
    ),
    5: Boolean(activeInvestigation || sharedEvaluationData),
    6: Boolean(activeInvestigation),
  };

  const handleStageSelect = useCallback((stageId: number) => {
    setActiveStage(stageId);
    if (typeof window !== "undefined") {
      const stageSlugMap: Record<number, string> = {
        1: "ingest",
        2: "profile",
        3: "investigate",
        4: "verify",
        5: "repair",
        6: "report",
      };
      const slug = stageSlugMap[stageId] || "ingest";
      const url = new URL(window.location.href);
      if (url.pathname.includes("/investigate")) {
        url.searchParams.set("stage", slug);
        window.history.pushState({ stage: stageId }, "", url.toString());
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  const handleTransferToAstra = useCallback((data: SharedEvaluationData) => {
    setSharedEvaluationData(data);
    setIsStale(true);
    setActiveStage(3);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.pathname.includes("/investigate")) {
        url.searchParams.set("stage", "investigate");
        window.history.pushState({ stage: 3 }, "", url.toString());
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  const handleInvestigationComplete = useCallback(
    (inv: Investigation, bound: EvaluationDataset[]) => {
      setActiveInvestigation(inv);
      setBoundRepairDatasets(bound);
      setIsStale(false);
    },
    []
  );

  const handleFlagshipComplete = useCallback((inv: Investigation) => {
    setActiveInvestigation(inv);
    setIsStale(false);
  }, []);

  const resetInvestigation = useCallback(
    (confirmPrompt: boolean = true): boolean => {
      const hasUnsaved = Boolean(
        activeInvestigation || sharedEvaluationData
      );
      if (
        confirmPrompt &&
        hasUnsaved &&
        typeof window !== "undefined" &&
        typeof window.confirm === "function"
      ) {
        if (
          !window.confirm(
            "Start a new investigation? Unsaved evidence, findings, and repair comparisons will be cleared."
          )
        ) {
          return false;
        }
      }
      setAstraKey((k) => k + 1);
      setActiveInvestigation(null);
      setBoundRepairDatasets([]);
      setSharedEvaluationData(null);
      setIsStale(false);
      setSessionId(null);
      setActiveStage(1);
      setActiveNav("workspace");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("stage");
        window.history.replaceState(null, "", url.toString());
      }
      return true;
    },
    [activeInvestigation, sharedEvaluationData]
  );

  return (
    <InvestigationContext.Provider
      value={{
        activeStage,
        setActiveStage,
        activeNav,
        setActiveNav,
        deploymentToken,
        setDeploymentToken,
        sharedEvaluationData,
        setSharedEvaluationData,
        activeInvestigation,
        setActiveInvestigation,
        boundRepairDatasets,
        setBoundRepairDatasets,
        isStale,
        setIsStale,
        sessionId,
        setSessionId,
        showReadinessModal,
        setShowReadinessModal,
        stagesCompleted,
        stagesAvailable,
        handleStageSelect,
        handleTransferToAstra,
        handleInvestigationComplete,
        handleFlagshipComplete,
        resetInvestigation,
        astraKey,
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}
