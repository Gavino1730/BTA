import { expect, test } from "@playwright/test";

const OPERATOR_BASE = "http://localhost:5174";

test("iOS WebKit pregame connection input and gating hints behave correctly", async ({ page }) => {
  await page.goto(`${OPERATOR_BASE}/?schoolId=webkit-ios-check`, { waitUntil: "domcontentloaded" });

  const codeInput = page.getByPlaceholder("Enter 6-digit coach code");
  await expect(codeInput).toBeVisible({ timeout: 15000 });
  await expect(codeInput).toHaveAttribute("inputmode", "numeric");
  await expect(codeInput).toHaveAttribute("maxlength", "6");

  const startButton = page.getByRole("button", { name: "Start Game" });
  await expect(startButton).toBeDisabled();
  await expect(page.getByText("Enter the 6-digit connection code to begin setup.")).toBeVisible();

  await codeInput.fill("AB 12-34 xyz");

  const sanitizedValue = await codeInput.inputValue();
  expect(sanitizedValue.length).toBeGreaterThan(0);
  expect(sanitizedValue.length).toBeLessThanOrEqual(6);
  expect(/^[a-z0-9_-]+$/.test(sanitizedValue)).toBe(true);

  await expect(page.getByText("Tap Sync Now to pull team, roster, and game setup from coach.")).toBeVisible();
  await expect(startButton).toBeDisabled();
});
