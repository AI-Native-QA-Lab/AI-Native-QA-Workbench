import { useState } from "react";

import type {
  AssessmentVerdict,
  HumanDecisionType,
  QualityTarget,
} from "@ai-native-qa-workbench/domain";

import type { QualityEngineeringView } from "../api.js";
import type { MessageKey, UiLocale } from "../i18n.js";

type Translate = (key: MessageKey) => string;

type QualityDecision = {
  decision: HumanDecisionType;
  reviewer: string;
  rationale: string;
  expectedRevision: string | null;
};

export interface QualityEngineeringPanelProps {
  locale: UiLocale;
  state: QualityEngineeringView | undefined;
  t: Translate;
  onEvaluate: (target: QualityTarget) => void | Promise<void>;
  onDecision: (gateId: string, input: QualityDecision) => void | Promise<void>;
}

const statusKeys: Record<QualityEngineeringView["resolvedGateStatuses"][string], MessageKey> = {
  pending: "pendingDecision",
  approved: "approved",
  rejected: "rejected",
  waived: "waived",
};

const outcomeKeys: Record<string, MessageKey> = {
  pass: "gateOutcomePass",
  warn: "gateOutcomeWarn",
  block: "gateOutcomeBlock",
  "insufficient-evidence": "gateOutcomeInsufficientEvidence",
};

const targetTypeKeys: Record<Exclude<QualityTarget["type"], "project">, MessageKey> = {
  requirement: "requirementTarget",
  "test-run": "testRunTarget",
};

const verdictKeys: Record<AssessmentVerdict, MessageKey> = {
  pass: "assessmentVerdictPass",
  warn: "assessmentVerdictWarn",
  fail: "assessmentVerdictFail",
  "insufficient-evidence": "assessmentVerdictInsufficientEvidence",
};

const workflowStatusKeys: Record<
  QualityEngineeringView["workflowStatuses"][number]["status"],
  MessageKey
> = {
  pending: "workflowPending",
  running: "workflowRunning",
  completed: "workflowCompleted",
  failed: "workflowFailed",
};

function targetLabel(target: QualityTarget, t: Translate): string {
  if (target.type === "project") return t("projectTarget");
  return `${t(targetTypeKeys[target.type])}: ${target.id}`;
}

function GateDecisionForm(props: {
  gateId: string;
  revision: string | null;
  t: Translate;
  onDecision: QualityEngineeringPanelProps["onDecision"];
}) {
  const [reviewer, setReviewer] = useState("");
  const [rationale, setRationale] = useState("");

  function submit(decision: HumanDecisionType): void {
    if (!reviewer.trim() || !rationale.trim()) return;
    void props.onDecision(props.gateId, {
      decision,
      reviewer,
      rationale,
      expectedRevision: props.revision,
    });
  }

  return (
    <div className="qe-decision-form">
      <label>
        {props.t("reviewer")}
        <input
          aria-label={props.t("reviewer")}
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        {props.t("rationale")}
        <textarea
          aria-label={props.t("rationale")}
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          rows={3}
        />
      </label>
      <div className="qe-decision-actions">
        <button
          className="button-primary"
          type="button"
          disabled={!reviewer.trim() || !rationale.trim()}
          onClick={() => submit("approve")}
        >
          {props.t("approveDecision")}
        </button>
        <button
          className="button-secondary"
          type="button"
          disabled={!reviewer.trim() || !rationale.trim()}
          onClick={() => submit("reject")}
        >
          {props.t("rejectDecision")}
        </button>
        <button
          className="button-quiet"
          type="button"
          disabled={!reviewer.trim() || !rationale.trim()}
          onClick={() => submit("waive")}
        >
          {props.t("waiveDecision")}
        </button>
      </div>
    </div>
  );
}

export function QualityEngineeringPanel(props: QualityEngineeringPanelProps) {
  const snapshot = props.state?.qualityEngineering;
  const gates = snapshot?.gates ?? [];
  const latestWorkflowStatus = props.state?.workflowStatuses[0];

  return (
    <section className="panel qe-panel" aria-labelledby="quality-engineering-heading">
      <div className="panel-heading qe-panel-heading">
        <div>
          <p className="section-kicker">{props.t("qualityEngineeringKicker")}</p>
          <h2 id="quality-engineering-heading">{props.t("qualityEngineering")}</h2>
          <p className="panel-description">{props.t("qualityEngineeringSubtitle")}</p>
        </div>
        <button
          className="qe-evaluate-button"
          type="button"
          onClick={() => void props.onEvaluate({ type: "project" })}
        >
          {props.t("evaluateQuality")}
        </button>
      </div>

      {latestWorkflowStatus && (
        <div className={`qe-workflow-status qe-workflow-${latestWorkflowStatus.status}`}>
          <span>{props.t("workflowStatus")}</span>
          <strong>{props.t(workflowStatusKeys[latestWorkflowStatus.status])}</strong>
          {latestWorkflowStatus.error && <p>{latestWorkflowStatus.error}</p>}
        </div>
      )}

      {!snapshot || gates.length === 0 ? (
        <div className="qe-empty-state">
          <span className="qe-empty-mark" aria-hidden="true">
            0.3
          </span>
          <p>{props.t("qualityEngineeringEmpty")}</p>
        </div>
      ) : (
        <div className="qe-gate-list">
          {gates.map((gate) => {
            const assessment = snapshot.assessments.find((item) => item.id === gate.assessmentId);
            const resolvedStatus = props.state?.resolvedGateStatuses[gate.id] ?? "pending";
            const statusKey = statusKeys[resolvedStatus];
            const outcomeKey = outcomeKeys[gate.outcome] ?? "gateOutcomeUnknown";
            return (
              <article className={`qe-gate-card qe-status-${resolvedStatus}`} key={gate.id}>
                <div className="qe-gate-card-header">
                  <div>
                    <span className="qe-gate-id">{gate.id}</span>
                    <h3>{targetLabel(gate.target, props.t)}</h3>
                  </div>
                  <div className="qe-status-stack">
                    <span className="qe-outcome">{props.t(outcomeKey)}</span>
                    <span className="qe-resolved-status">{props.t(statusKey)}</span>
                  </div>
                </div>
                {assessment && (
                  <div className="qe-assessment-copy">
                    <div className="qe-assessment-meta">
                      <span>{props.t("assessment")}</span>
                      <strong>{props.t(verdictKeys[assessment.verdict])}</strong>
                    </div>
                    <p>{assessment.summary}</p>
                    <div className="qe-reference-row">
                      <span>
                        {props.t("reasonCodes")}:{" "}
                        {assessment.reasonCodes.join(", ") || props.t("notAvailable")}
                      </span>
                      <span>
                        {props.t("evidenceRefs")}:{" "}
                        {assessment.evidenceIds.join(", ") || props.t("notAvailable")}
                      </span>
                    </div>
                  </div>
                )}
                {resolvedStatus === "pending" && (
                  <GateDecisionForm
                    gateId={gate.id}
                    revision={props.state?.revision ?? null}
                    t={props.t}
                    onDecision={props.onDecision}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
