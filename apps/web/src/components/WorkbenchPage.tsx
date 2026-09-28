import { useEffect, useMemo, useState } from "react";

import type { ProposalView, QualityEngineeringView, QualityView, WorkbenchApi } from "../api.js";
import { readStoredUiLocale, storeUiLocale, translate, type UiLocale } from "../i18n.js";
import { WorkbenchShell } from "./WorkbenchShell.js";
import { readWorkbenchView, type WorkbenchView } from "./WorkbenchView.js";

export function WorkbenchPage(props: { api: WorkbenchApi; initialUiLocale?: UiLocale }) {
  const [locale, setLocale] = useState<UiLocale>(props.initialUiLocale ?? readStoredUiLocale());
  const [outputLocale, setOutputLocale] = useState<UiLocale>("en");
  const [projectName, setProjectName] = useState("");
  const [quality, setQuality] = useState<QualityView | undefined>();
  const [qualityEngineering, setQualityEngineering] = useState<
    QualityEngineeringView | undefined
  >();
  const [proposal, setProposal] = useState<ProposalView | undefined>();
  const [requirementId, setRequirementId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [view, setView] = useState<WorkbenchView>(readWorkbenchView);

  const t = useMemo(
    () => (key: Parameters<typeof translate>[1]) => translate(locale, key),
    [locale],
  );

  useEffect(() => {
    storeUiLocale(locale);
  }, [locale]);

  useEffect(() => {
    function handlePopState() {
      setView(readWorkbenchView());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([props.api.getProject(), props.api.getQuality(), props.api.getQualityEngineering()])
      .then(([projectResult, qualityResult, qualityEngineeringResult]) => {
        if (!active) return;
        setProjectName(projectResult.project.name);
        setQuality(qualityResult.quality);
        setRequirementId(String(qualityResult.quality.requirements[0]?.id ?? ""));
        setQualityEngineering(qualityEngineeringResult);
      })
      .catch(() => {
        if (active) setError(t("failed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.api, t]);

  async function analyze(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!requirementId) return;
    const result = await props.api.analyze({ requirementId, outputLocale });
    setProposal(result.proposal);
  }

  async function decide(decision: "approve" | "reject", reviewer: string): Promise<void> {
    if (!proposal) return;
    const result = await props.api.decide(proposal.id, { reviewer, decision });
    setProposal(result.proposal);
    if (result.applied) {
      const refreshed = await props.api.getQuality();
      setQuality(refreshed.quality);
    }
  }

  async function refreshQualityEngineering(): Promise<void> {
    const result = await props.api.getQualityEngineering();
    setQualityEngineering(result);
  }

  async function evaluateQuality(
    target: Parameters<WorkbenchApi["evaluateQuality"]>[0]["target"],
  ): Promise<void> {
    try {
      const result = await props.api.evaluateQuality({ target });
      if (!result.processed) throw new Error(t("qualityEngineeringFailed"));
      await refreshQualityEngineering();
    } catch {
      try {
        await refreshQualityEngineering();
      } catch {
        // Keep the operation error visible even when the status refresh also fails.
      }
      setError(t("qualityEngineeringFailed"));
    }
  }

  async function decideQualityGate(
    gateId: string,
    input: Parameters<WorkbenchApi["decideQualityGate"]>[1],
  ): Promise<void> {
    try {
      const result = await props.api.decideQualityGate(gateId, input);
      if (!result.written) throw new Error(t("qualityEngineeringFailed"));
      await refreshQualityEngineering();
    } catch {
      setError(t("qualityEngineeringFailed"));
    }
  }

  function changeView(nextView: WorkbenchView): void {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.delete("variant");
    url.searchParams.set("view", nextView);
    window.history.replaceState({}, "", url);
  }

  return (
    <WorkbenchShell
      locale={locale}
      projectName={projectName}
      quality={quality}
      qualityEngineering={qualityEngineering}
      proposal={proposal}
      requirementId={requirementId}
      outputLocale={outputLocale}
      view={view}
      loading={loading}
      error={error}
      t={t}
      onLocaleChange={setLocale}
      onRequirementIdChange={setRequirementId}
      onOutputLocaleChange={setOutputLocale}
      onAnalyze={analyze}
      onDecision={decide}
      onEvaluateQuality={evaluateQuality}
      onQualityGateDecision={decideQualityGate}
      onViewChange={changeView}
    />
  );
}
