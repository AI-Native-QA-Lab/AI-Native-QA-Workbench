// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  QualityEngineeringPanel,
  translate,
  type QualityEngineeringView,
} from "@ai-native-qa-workbench/web";

const baseState: QualityEngineeringView = {
  valid: true,
  revision: "a".repeat(64),
  qualityEngineering: {
    schemaVersion: "0.3" as const,
    assessments: [
      {
        id: "assessment-project",
        target: { type: "project" as const },
        verdict: "warn" as const,
        summary: "Execution evidence is unverified.",
        reasonCodes: ["EVIDENCE_UNVERIFIED"],
        evidenceIds: ["evidence-checkout"],
        source: "deterministic" as const,
        basedOnRevision: null,
        createdAt: "2026-09-27T08:00:00Z",
      },
    ],
    gates: [
      {
        id: "gate-project",
        kind: "release-readiness" as const,
        target: { type: "project" as const },
        assessmentId: "assessment-project",
        outcome: "warn" as const,
        requiredHumanDecision: true as const,
        evaluatedAt: "2026-09-27T08:01:00Z",
      },
    ],
    humanDecisions: [],
  },
  resolvedGateStatuses: { "gate-project": "pending" as const },
  diagnostics: [],
};

describe("QualityEngineeringPanel", () => {
  it("renders assessment evidence and all resolved gate statuses", () => {
    const statuses = ["pending", "approved", "rejected", "waived"] as const;
    const onDecision = vi.fn();
    const { rerender } = render(
      <QualityEngineeringPanel
        locale="en"
        state={baseState}
        t={(key) => translate("en", key)}
        onEvaluate={vi.fn()}
        onDecision={onDecision}
      />,
    );

    expect(screen.getByRole("heading", { name: "Quality engineering" })).toBeTruthy();
    expect(screen.getByText("Execution evidence is unverified.")).toBeTruthy();
    expect(screen.getByText(/evidence-checkout/)).toBeTruthy();
    expect(screen.getByText("Pending human decision")).toBeTruthy();

    for (const status of statuses.slice(1)) {
      rerender(
        <QualityEngineeringPanel
          locale="en"
          state={{ ...baseState, resolvedGateStatuses: { "gate-project": status } }}
          t={(key) => translate("en", key)}
          onEvaluate={vi.fn()}
          onDecision={onDecision}
        />,
      );
      expect(
        screen.getByText(
          status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Waived",
        ),
      ).toBeTruthy();
    }
  });

  it("submits an explicit reviewer rationale and supports zh-CN labels", () => {
    const onDecision = vi.fn();
    render(
      <QualityEngineeringPanel
        locale="zh-CN"
        state={baseState}
        t={(key) => translate("zh-CN", key)}
        onEvaluate={vi.fn()}
        onDecision={onDecision}
      />,
    );

    expect(screen.getByRole("heading", { name: "质量工程" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("审查者"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("决策理由"), {
      target: { value: "我已审查当前证据。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "批准" }));

    expect(onDecision).toHaveBeenCalledWith("gate-project", {
      decision: "approve",
      reviewer: "alice",
      rationale: "我已审查当前证据。",
      expectedRevision: baseState.revision,
    });
    expect(screen.queryByRole("button", { name: "自动批准" })).toBeNull();
  });
});
