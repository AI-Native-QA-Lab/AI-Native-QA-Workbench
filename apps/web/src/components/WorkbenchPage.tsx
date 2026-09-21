import { useEffect, useMemo, useState } from "react";

import type { ProposalView, QualityView, WorkbenchApi } from "../api.js";
import { readStoredUiLocale, storeUiLocale, translate, type UiLocale } from "../i18n.js";
import { LocaleSwitcher } from "./LocaleSwitcher.js";
import { ProposalReview } from "./ProposalReview.js";

export function WorkbenchPage(props: { api: WorkbenchApi; initialUiLocale?: UiLocale }) {
  const [locale, setLocale] = useState<UiLocale>(props.initialUiLocale ?? readStoredUiLocale());
  const [outputLocale, setOutputLocale] = useState<UiLocale>("en");
  const [projectName, setProjectName] = useState("");
  const [quality, setQuality] = useState<QualityView | undefined>();
  const [proposal, setProposal] = useState<ProposalView | undefined>();
  const [requirementId, setRequirementId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const t = useMemo(
    () => (key: Parameters<typeof translate>[1]) => translate(locale, key),
    [locale],
  );

  useEffect(() => {
    storeUiLocale(locale);
  }, [locale]);

  useEffect(() => {
    let active = true;
    Promise.all([props.api.getProject(), props.api.getQuality()])
      .then(([projectResult, qualityResult]) => {
        if (!active) return;
        setProjectName(projectResult.project.name);
        setQuality(qualityResult.quality);
        setRequirementId(String(qualityResult.quality.requirements[0]?.id ?? ""));
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

  return (
    <main className="workbench-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{projectName || t("brand")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <LocaleSwitcher locale={locale} onChange={setLocale} />
      </header>

      {loading && <p role="status">{t("loading")}</p>}
      {error && <p role="alert">{error}</p>}
      {quality && (
        <>
          <section className="quality-overview" aria-labelledby="quality-heading">
            <h2 id="quality-heading">{t("quality")}</h2>
            <div className="metric-grid">
              <p>
                {t("requirements")}: {quality.requirements.length}
              </p>
              <p>
                {t("acceptanceCriteria")}: {quality.acceptanceCriteria.length}
              </p>
              <p>
                {t("qualityRisks")}: {quality.qualityRisks.length}
              </p>
              <p>
                {t("testObligations")}: {quality.testObligations.length}
              </p>
              <p>
                {t("testCases")}: {quality.testCases.length}
              </p>
              <p>
                {t("traceLinks")}: {quality.traceLinks.length}
              </p>
            </div>
          </section>
          <section className="analysis-panel" aria-labelledby="analysis-heading">
            <h2 id="analysis-heading">{t("analyze")}</h2>
            <form onSubmit={analyze}>
              <label>
                {t("requirementId")}
                <input
                  aria-label={t("requirementId")}
                  value={requirementId}
                  onChange={(event) => setRequirementId(event.target.value)}
                />
              </label>
              <label>
                {t("outputLocale")}
                <select
                  aria-label={t("outputLocale")}
                  value={outputLocale}
                  onChange={(event) => setOutputLocale(event.target.value as UiLocale)}
                >
                  <option value="en">{t("english")}</option>
                  <option value="zh-CN">{t("chinese")}</option>
                </select>
              </label>
              <button type="submit">{t("analyze")}</button>
            </form>
          </section>
        </>
      )}
      {proposal && <ProposalReview proposal={proposal} locale={locale} onDecision={decide} />}
    </main>
  );
}
