import { expect, test } from "@playwright/test";

// The back arrow was shipped dead: a logo wrapper pulled left with a negative
// margin covered it, so every real click landed on the logo instead. Source-text
// assertions passed the whole time — only a real click catches this.
test("the login page's back arrow is clickable and returns to the previous page", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Fails with "intercepts pointer events" if anything covers the arrow.
  await page.getByRole("button", { name: "Go back" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/discover$/);
});

test("the back arrow falls back to /discover on a cold open", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Go back" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/discover$/);
});
