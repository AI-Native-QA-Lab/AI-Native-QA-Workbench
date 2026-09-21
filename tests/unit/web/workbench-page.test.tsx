// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkbenchPage, type WorkbenchApi } from "@ai-native-qa-workbench/web";

function api(): WorkbenchApi {
  return {
    getProject: vi.fn().mockResolvedValue({
      valid: true,
      project: { id: "checkout", name: "Checkout", description: "Checkout flow" },
    }),
    getQuality: vi.fn().mockResolvedValue({
      valid: true,
      quality: {
        requirements: [
          { id: "checkout", title: "Checkout" },
          { id: "login", title: "Login" },
        ],
        acceptanceCriteria: [{ id: "checkout-behavior" }],
        qualityRisks: [{ id: "checkout-risk" }],
        testObligations: [{ id: "checkout-check" }],
        testCases: [{ id: "checkout-case" }],
        traceLinks: [{ id: "checkout-link" }],
      },
    }),
    analyze: vi.fn().mockResolvedValue({
      phase: "review",
      proposal: { id: "proposal-1", status: "proposed", operations: [] },
    }),
    decide: vi.fn(),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("WorkbenchPage", () => {
  it("defaults to English, switches to zh-CN, and renders quality counts", async () => {
    render(<WorkbenchPage api={api()} />);

    expect(await screen.findByRole("heading", { name: "QA Workbench" })).toBeTruthy();
    expect(screen.getByText("Requirements: 2")).toBeTruthy();
    expect(screen.getByText("Trace links: 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByRole("heading", { name: "QA 工作台" })).toBeTruthy();
    expect(window.localStorage.getItem("qaw.uiLocale")).toBe("zh-CN");
  });

  it("sends outputLocale independently from the UI locale", async () => {
    const client = api();
    render(<WorkbenchPage api={client} />);
    await screen.findByRole("heading", { name: "QA Workbench" });

    fireEvent.change(screen.getByLabelText("Requirement ID"), { target: { value: "checkout" } });
    fireEvent.change(screen.getByLabelText("AI output locale"), { target: { value: "zh-CN" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyze requirement" }));

    await waitFor(() =>
      expect(client.analyze).toHaveBeenCalledWith({
        requirementId: "checkout",
        outputLocale: "zh-CN",
      }),
    );
    expect(screen.getByRole("heading", { name: "QA Workbench" })).toBeTruthy();
  });

  it("renders the applied server status and refreshes quality after approval", async () => {
    const client = api();
    client.getQuality = vi
      .fn()
      .mockResolvedValueOnce({
        valid: true,
        quality: {
          requirements: [{ id: "checkout", title: "Checkout" }],
          acceptanceCriteria: [],
          qualityRisks: [],
          testObligations: [],
          testCases: [],
          traceLinks: [],
        },
      })
      .mockResolvedValueOnce({
        valid: true,
        quality: {
          requirements: [{ id: "checkout", title: "Checkout" }],
          acceptanceCriteria: [{ id: "checkout-behavior" }],
          qualityRisks: [],
          testObligations: [],
          testCases: [],
          traceLinks: [],
        },
      });
    client.decide = vi.fn().mockResolvedValue({
      applied: true,
      proposal: { id: "proposal-1", status: "applied", operations: [] },
    });
    render(<WorkbenchPage api={client} />);
    await screen.findByRole("heading", { name: "QA Workbench" });

    fireEvent.click(screen.getByRole("button", { name: "Analyze requirement" }));
    await screen.findByText("Status: proposed");
    fireEvent.click(screen.getByRole("button", { name: "Approve proposal" }));

    expect(await screen.findByText("Status: applied")).toBeTruthy();
    expect(await screen.findByText("Acceptance criteria: 1")).toBeTruthy();
    expect(client.getQuality).toHaveBeenCalledTimes(2);
  });
});
