import { expect, test } from "@playwright/test";

test("Golden Path: load, analyze, review, apply, and refresh quality counts", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "QA Workbench" })).toBeVisible();
  await expect(page.getByText("Requirements: 1")).toBeVisible();
  await expect(page.getByText("Acceptance criteria: 0")).toBeVisible();

  await page.getByLabel("Requirement ID").fill("checkout");
  await page.getByLabel("AI output locale").selectOption("zh-CN");
  await page.getByRole("button", { name: "Analyze requirement" }).click();

  await expect(page.getByText(/Proposal proposal-/)).toBeVisible();
  await expect(page.getByText("Status: proposed")).toBeVisible();
  await page.getByLabel("Reviewer").fill("e2e-human");
  await page.getByRole("button", { name: "Approve proposal" }).click();

  await expect(page.getByText("Status: applied")).toBeVisible();
  await expect(page.getByText("Acceptance criteria: 1")).toBeVisible();
  await expect(page.getByText("Quality risks: 1")).toBeVisible();
  await expect(page.getByText("Test obligations: 1")).toBeVisible();
  await expect(page.getByText("Test cases: 1")).toBeVisible();
  await expect(page.getByText("Trace links: 4")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Quality engineering" })).toBeVisible();
  await page.getByRole("button", { name: "Evaluate project" }).click();
  await expect(
    page.locator(".qe-outcome").filter({ hasText: "Insufficient evidence" }),
  ).toBeVisible();
  await expect(
    page.locator(".qe-assessment-meta strong").filter({ hasText: "Insufficient evidence" }),
  ).toBeVisible();
  await expect(page.getByText("Pending human decision")).toBeVisible();

  const gateDecision = page.locator(".qe-decision-form");
  await gateDecision.getByLabel("Reviewer").fill("e2e-quality-reviewer");
  await gateDecision.getByLabel("Rationale").fill("I reviewed the current evidence boundary.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Approved")).toBeVisible();
});
