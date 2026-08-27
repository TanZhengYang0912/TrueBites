import { expect, test } from "@playwright/test";

const footerLinks = [
  ["About Us", "/about"],
  ["Terms and Conditions", "/terms"],
  ["Rules and Guidelines", "/guidelines"],
  ["Contact Us", "/contact"],
  ["Careers", "/careers"],
];

test("landing footer uses the shared user navigation routes", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  for (const [label, path] of footerLinks) {
    const link = page.locator("footer").getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto("/", { waitUntil: "networkidle" });
  }
});
