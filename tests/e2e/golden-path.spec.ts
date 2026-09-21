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
});
