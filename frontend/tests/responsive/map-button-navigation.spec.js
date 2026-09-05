import { expect, test } from "@playwright/test";

test("Map opens immediately while browser geolocation is still pending", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("truebites:welcome-seen", "1");
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition() {} },
    });
  });

  await page.route("**/api/restaurants/nearby?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/map");

  await page.getByRole("button", { name: "Map", exact: true }).click();

  await expect(page).toHaveURL(/\/map\?view=map$/);
});
