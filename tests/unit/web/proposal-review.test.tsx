// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProposalReview } from "@ai-native-qa-workbench/web";

describe("ProposalReview", () => {
  it("renders proposal status and sends explicit approve/reject decisions", () => {
    const onDecision = vi.fn();
    render(
      <ProposalReview
        proposal={{ id: "proposal-1", status: "proposed", operations: [{ kind: "create" }] }}
        onDecision={onDecision}
      />,
    );

    expect(screen.getByText("Proposal proposal-1")).toBeTruthy();
    expect(screen.getByText("Status: proposed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));

    expect(onDecision).toHaveBeenNthCalledWith(1, "approve");
    expect(onDecision).toHaveBeenNthCalledWith(2, "reject");
  });
});
