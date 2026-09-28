import type { FormEvent } from "react";

import type { ProposalView, QualityEngineeringView, QualityView, WorkbenchApi } from "../api.js";
import type { QualityTarget } from "@ai-native-qa-workbench/domain";
import { LocaleSwitcher } from "./LocaleSwitcher.js";
import { ProposalReview } from "./ProposalReview.js";
import { QualityEngineeringPanel } from "./QualityEngineeringPanel.js";
import type { MessageKey, UiLocale } from "../i18n.js";
import type { WorkbenchView } from "./WorkbenchView.js";

type Translate = (key: MessageKey) => string;

export interface WorkbenchShellProps {
  locale: UiLocale;
  projectName: string;
  quality: QualityView | undefined;
  qualityEngineering: QualityEngineeringView | undefined;
  proposal: ProposalView | undefined;
  requirementId: string;
  outputLocale: UiLocale;
  view: WorkbenchView;
  loading: boolean;
  error: string | undefined;
  t: Translate;
  onLocaleChange: (locale: UiLocale) => void;
  onRequirementIdChange: (value: string) => void;
  onOutputLocaleChange: (locale: UiLocale) => void;
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onDecision: (decision: "approve" | "reject", reviewer: string) => void;
  onEvaluateQuality: (target: QualityTarget) => void | Promise<void>;
  onQualityGateDecision: (
    gateId: string,
    input: Parameters<WorkbenchApi["decideQualityGate"]>[1],
  ) => void | Promise<void>;
  onViewChange: (view: WorkbenchView) => void;
}

function entityTitle(entity: Record<string, unknown>, fallback: string): string {
  if (typeof entity.title === "string" && entity.title.trim()) return entity.title;
  if (typeof entity.statement === "string" && entity.statement.trim()) return entity.statement;
  if (typeof entity.id === "string" && entity.id.trim()) return entity.id;
  return fallback;
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <article className={`metric-card ${props.value === 0 ? "is-empty" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <span className="sr-only">
        {props.label}: {props.value}
      </span>
    </article>
  );
}

function QualitySnapshot(props: { quality: QualityView; t: Translate }) {
  const metrics = [
    [props.t("requirements"), props.quality.requirements.length],
    [props.t("acceptanceCriteria"), props.quality.acceptanceCriteria.length],
    [props.t("qualityRisks"), props.quality.qualityRisks.length],
    [props.t("testObligations"), props.quality.testObligations.length],
    [props.t("testCases"), props.quality.testCases.length],
    [props.t("traceLinks"), props.quality.traceLinks.length],
  ] as const;

  return (
    <section className="panel snapshot-panel" aria-labelledby="quality-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{props.t("quality")}</p>
          <h2 id="quality-heading">{props.t("qualitySnapshot")}</h2>
        </div>
        <span className="status-badge status-neutral">{props.t("liveSnapshot")}</span>
      </div>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </div>
      <p className="panel-note">{props.t("snapshotSource")}</p>
    </section>
  );
}

function QualityRadar(props: { quality: QualityView; t: Translate }) {
  const signals = [
    {
      label: props.t("requirements"),
      ready: props.quality.requirements.length > 0,
      status:
        props.quality.requirements.length > 0 ? props.t("healthy") : props.t("needsAttention"),
    },
    {
      label: props.t("testCases"),
      ready: props.quality.testCases.length > 0,
      status: props.quality.testCases.length > 0 ? props.t("healthy") : props.t("needsAttention"),
    },
    {
      label: props.t("traceLinks"),
      ready: props.quality.traceLinks.length > 0,
      status: props.quality.traceLinks.length > 0 ? props.t("healthy") : props.t("needsAttention"),
    },
    {
      label: props.t("evidenceSurface"),
      ready: false,
      status: props.t("notShown"),
    },
  ];

  return (
    <aside className="panel radar-panel" aria-labelledby="radar-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{props.t("quality")}</p>
          <h2 id="radar-heading">{props.t("qualityRadar")}</h2>
        </div>
        <span className="radar-count">{signals.filter((signal) => signal.ready).length}/4</span>
      </div>
      <div className="radar-list">
        {signals.map((signal) => (
          <div className="radar-row" key={signal.label}>
            <span
              className={`radar-mark ${signal.ready ? "is-ready" : "is-pending"}`}
              aria-hidden="true"
            >
              {signal.ready ? "OK" : "--"}
            </span>
            <span className="radar-label">{signal.label}</span>
            <span className={`status-text ${signal.ready ? "is-ready" : "is-pending"}`}>
              {signal.status}
            </span>
          </div>
        ))}
      </div>
      <p className="panel-note">{props.t("radarBoundary")}</p>
    </aside>
  );
}

type FlowStage = {
  key: MessageKey;
  count: number | null;
  items: Record<string, unknown>[];
};

function flowStages(quality: QualityView): FlowStage[] {
  return [
    { key: "requirementsStage", count: quality.requirements.length, items: quality.requirements },
    {
      key: "testDesignStage",
      count: quality.testObligations.length,
      items: quality.testObligations,
    },
    { key: "caseReviewStage", count: quality.testCases.length, items: quality.testCases },
    { key: "executionStage", count: null, items: [] },
    { key: "regressionStage", count: null, items: [] },
    { key: "releasedStage", count: null, items: [] },
  ];
}

function WorkflowOverview(props: { quality: QualityView; t: Translate }) {
  const stages = flowStages(props.quality);
  return (
    <section className="panel workflow-panel" aria-labelledby="workflow-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{props.t("workspace")}</p>
          <h2 id="workflow-heading">{props.t("qualityFlow")}</h2>
        </div>
        <span className="status-badge status-neutral">{props.t("localProject")}</span>
      </div>
      <div className="workflow-strip">
        {stages.map((stage) => (
          <div className="workflow-stage" key={stage.key}>
            <span className="workflow-stage-name">{props.t(stage.key)}</span>
            <strong>{stage.count === null ? props.t("notConnected") : stage.count}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function RequirementAnalyzer(props: {
  quality: QualityView;
  proposal: ProposalView | undefined;
  requirementId: string;
  outputLocale: UiLocale;
  t: Translate;
  locale: UiLocale;
  onRequirementIdChange: (value: string) => void;
  onOutputLocaleChange: (locale: UiLocale) => void;
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onDecision: (decision: "approve" | "reject", reviewer: string) => void;
}) {
  return (
    <>
      <section className="panel analysis-panel" aria-labelledby="analysis-heading">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{props.t("assistant")}</p>
            <h2 id="analysis-heading">{props.t("analyze")}</h2>
            <p className="panel-description">{props.t("analysisHelper")}</p>
          </div>
          <span className="status-badge status-warning">{props.t("humanReviewRequired")}</span>
        </div>
        <form onSubmit={props.onAnalyze}>
          <label>
            {props.t("requirementId")}
            <input
              aria-label={props.t("requirementId")}
              value={props.requirementId}
              onChange={(event) => props.onRequirementIdChange(event.target.value)}
              list="requirement-options"
            />
            <datalist id="requirement-options">
              {props.quality.requirements.map((requirement) => (
                <option key={String(requirement.id)} value={String(requirement.id)}>
                  {entityTitle(requirement, props.t("untitled"))}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            {props.t("outputLocale")}
            <select
              aria-label={props.t("outputLocale")}
              value={props.outputLocale}
              onChange={(event) => props.onOutputLocaleChange(event.target.value as UiLocale)}
            >
              <option value="en">{props.t("english")}</option>
              <option value="zh-CN">{props.t("chinese")}</option>
            </select>
          </label>
          <button className="button-primary" type="submit">
            {props.t("analyze")}
          </button>
        </form>
      </section>
      {props.proposal && (
        <ProposalReview
          proposal={props.proposal}
          locale={props.locale}
          onDecision={props.onDecision}
        />
      )}
    </>
  );
}

function DashboardView(
  props: Omit<WorkbenchShellProps, "view" | "loading" | "error" | "onViewChange"> & {
    quality: QualityView;
  },
) {
  return (
    <div className="dashboard-grid">
      <div className="dashboard-primary">
        <QualitySnapshot quality={props.quality} t={props.t} />
        <WorkflowOverview quality={props.quality} t={props.t} />
        <QualityEngineeringPanel
          locale={props.locale}
          state={props.qualityEngineering}
          t={props.t}
          onEvaluate={props.onEvaluateQuality}
          onDecision={props.onQualityGateDecision}
        />
        <RequirementAnalyzer {...props} quality={props.quality} />
      </div>
      <QualityRadar quality={props.quality} t={props.t} />
    </div>
  );
}

function PipelineView(
  props: Omit<WorkbenchShellProps, "view" | "loading" | "error" | "onViewChange"> & {
    quality: QualityView;
  },
) {
  const stages = flowStages(props.quality);
  return (
    <div className="pipeline-layout">
      <section className="panel pipeline-panel" aria-labelledby="pipeline-heading">
        <div className="panel-heading pipeline-heading">
          <div>
            <p className="section-kicker">{props.t("workspace")}</p>
            <h2 id="pipeline-heading">{props.t("pipelineTitle")}</h2>
            <p className="panel-description">{props.t("pipelineSubtitle")}</p>
          </div>
          <span className="status-badge status-neutral">{props.t("localProject")}</span>
        </div>
        <div className="pipeline-board">
          {stages.map((stage) => (
            <article className="pipeline-column" key={stage.key}>
              <div className="pipeline-column-heading">
                <span>{props.t(stage.key)}</span>
                <strong>{stage.count === null ? "--" : stage.count}</strong>
              </div>
              <div className="pipeline-items">
                {stage.items.length > 0 ? (
                  stage.items.slice(0, 4).map((item) => (
                    <div className="pipeline-item" key={String(item.id)}>
                      <strong>{entityTitle(item, props.t("untitled"))}</strong>
                      <code>{String(item.id ?? props.t("untitled"))}</code>
                    </div>
                  ))
                ) : (
                  <p className="empty-stage">
                    {stage.count === null ? props.t("notConnected") : props.t("noItems")}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className="panel-note">{props.t("pipelineHint")}</p>
      </section>
      <QualityRadar quality={props.quality} t={props.t} />
      <div className="pipeline-analysis">
        <RequirementAnalyzer {...props} quality={props.quality} />
      </div>
    </div>
  );
}

function AssistantView(
  props: Omit<WorkbenchShellProps, "view" | "loading" | "error" | "onViewChange"> & {
    quality: QualityView;
  },
) {
  return (
    <div className="assistant-grid">
      <aside className="panel context-panel" aria-labelledby="context-heading">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">{props.t("assistant")}</p>
            <h2 id="context-heading">{props.t("assistantContext")}</h2>
          </div>
          <span className="status-badge status-neutral">{props.t("localMode")}</span>
        </div>
        <div className="context-project">
          <span className="context-project-mark">Q</span>
          <div>
            <strong>{props.projectName || props.t("project")}</strong>
            <span>{props.t("currentProject")}</span>
          </div>
        </div>
        <dl className="context-list">
          <div>
            <dt>{props.t("requirements")}</dt>
            <dd>{props.quality.requirements.length}</dd>
          </div>
          <div>
            <dt>{props.t("qualityRisks")}</dt>
            <dd>{props.quality.qualityRisks.length}</dd>
          </div>
          <div>
            <dt>{props.t("testCases")}</dt>
            <dd>{props.quality.testCases.length}</dd>
          </div>
        </dl>
        <p className="panel-note">{props.t("reviewBoundary")}</p>
      </aside>
      <div className="assistant-main">
        <section className="assistant-intro">
          <p className="section-kicker">{props.t("assistant")}</p>
          <h2>{props.t("assistantTitle")}</h2>
          <p>{props.t("assistantSubtitle")}</p>
        </section>
        <RequirementAnalyzer {...props} quality={props.quality} />
      </div>
      <QualityRadar quality={props.quality} t={props.t} />
    </div>
  );
}

function PrimaryRail(props: {
  current: WorkbenchView;
  t: Translate;
  onChange: (view: WorkbenchView) => void;
}) {
  const items: Array<{
    view?: WorkbenchView;
    key: MessageKey;
    code: string;
    connected: boolean;
  }> = [
    { view: "dashboard", key: "dashboard", code: "OV", connected: true },
    { view: "pipeline", key: "pipeline", code: "PL", connected: true },
    { view: "assistant", key: "assistant", code: "AI", connected: true },
    { key: "requirementsNav", code: "RQ", connected: false },
    { key: "testCasesNav", code: "TC", connected: false },
    { key: "evidenceNav", code: "EV", connected: false },
  ];

  return (
    <nav className="primary-rail" aria-label={props.t("workbenchNavigation")}>
      <div className="rail-section-label">{props.t("workspace")}</div>
      <div className="rail-links">
        {items.map((item, index) => {
          const isActive = item.connected && item.view === props.current;
          const className = `rail-link ${index === 3 ? "rail-link-spaced" : ""} ${
            isActive ? "is-active" : ""
          } ${item.connected ? "" : "rail-link-disabled"}`;

          return (
            <button
              type="button"
              className={className}
              key={`${item.key}-${item.code}`}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={item.connected ? undefined : "true"}
              disabled={!item.connected}
              title={item.connected ? undefined : props.t("notConnected")}
              onClick={() => {
                if (item.view) props.onChange(item.view);
              }}
            >
              <span className="nav-code" aria-hidden="true">
                {item.code}
              </span>
              <span>{props.t(item.key)}</span>
            </button>
          );
        })}
      </div>
      <div className="rail-footer">
        <span className="rail-footer-label">{props.t("localProject")}</span>
        <strong>{props.t("sourceOfTruth")}</strong>
      </div>
    </nav>
  );
}

export function WorkbenchShell(props: WorkbenchShellProps) {
  const variantProps = props.quality ? { ...props, quality: props.quality } : undefined;

  return (
    <div className={`workbench-app view-${props.view}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            Q
          </span>
          <strong>{props.t("brand")}</strong>
        </div>
        <div className="topbar-context">
          <span>{props.t("project")}</span>
          <strong>{props.projectName || props.t("currentProject")}</strong>
        </div>
        <div className="topbar-actions">
          <span className="status-badge status-local">{props.t("localMode")}</span>
          <LocaleSwitcher locale={props.locale} onChange={props.onLocaleChange} />
        </div>
      </header>
      <div className="workbench-layout">
        <PrimaryRail current={props.view} t={props.t} onChange={props.onViewChange} />
        <main className="workbench-main">
          <header className="main-heading">
            <div>
              <p className="section-kicker">{props.projectName || props.t("brand")}</p>
              <h1>{props.t("title")}</h1>
              <p>{props.t("subtitle")}</p>
            </div>
            <span className="snapshot-label">{props.t("liveSnapshot")}</span>
          </header>
          {props.loading && (
            <section className="panel loading-panel" role="status">
              <span className="loading-bar" aria-hidden="true" />
              <span>{props.t("loading")}</span>
            </section>
          )}
          {props.error && (
            <section className="panel error-panel" role="alert">
              {props.error}
            </section>
          )}
          {variantProps && props.view === "dashboard" && <DashboardView {...variantProps} />}
          {variantProps && props.view === "pipeline" && <PipelineView {...variantProps} />}
          {variantProps && props.view === "assistant" && <AssistantView {...variantProps} />}
        </main>
      </div>
    </div>
  );
}
