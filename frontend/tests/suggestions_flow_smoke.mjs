import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto("http://127.0.0.1:5173/suggestions/new");
await page.waitForLoadState("networkidle");
await page.getByRole("heading", { name: "Share what the community should know about." }).waitFor();
await page.getByLabel("Vendor name *").waitFor();
await page.getByLabel("Melaka area or address *").waitFor();
await page.getByLabel("Source video URL *").waitFor();
await page.getByRole("button", { name: "An influencer or channel" }).click();
await page.getByLabel("Influencer or channel name *").waitFor();
await page.getByLabel("Profile URL *").waitFor();
await page.getByLabel("What do they usually share? *").waitFor();
if (await page.getByLabel("Vendor name *").isVisible()) throw new Error("Vendor fields should be hidden in creator mode");
if (await page.getByLabel("Melaka area or address *").isVisible()) throw new Error("Address should be hidden in creator mode");
if (await page.getByLabel("Source video URL *").isVisible()) throw new Error("Vendor source field should be hidden in creator mode");
await page.screenshot({ path: "/tmp/truebites-creator-form.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "An influencer or channel" }).click();
const mobileWidth = await page.evaluate(() => document.documentElement.scrollWidth);
if (mobileWidth > 390) throw new Error(`Mobile form overflows horizontally: ${mobileWidth}px`);

await page.goto("http://127.0.0.1:5173/suggestions");
await page.waitForLoadState("networkidle");
await page.getByRole("heading", { name: "My suggestions" }).waitFor();
if (await page.getByRole("button", { name: "Explore creators" }).count()) throw new Error("Standalone creator directory CTA should be removed");
if (await page.getByRole("link", { name: "Creators" }).count()) throw new Error("Standalone creator directory link should be removed");

await browser.close();
