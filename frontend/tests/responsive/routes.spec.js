import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const routes = [
  ["landing", "/"],
  ["map", "/map?view=map"],
  ["ai", "/ai"],
  ["login", "/login"],
  ["saved", "/saved"],
  ["reviews", "/reviews"],
  ["suggestions", "/suggestions"],
  ["suggestions-new", "/suggestions/new"],
  ["admin-login", "/wsdasabi123&admin-login"],
  ["admin-overview", "/admin"],
  ["admin-set-password", "/admin-set-password"],
  ["admin-vendors", "/admin/vendors2"],
  ["admin-suggestions", "/admin/suggestions"],
  ["admin-audit-log", "/admin/audit-log"],
  ["admin-users", "/admin/users"],
  ["admin-notifications", "/admin/notifications"],
  ["profile", "/profile"],
  ["admin-ai", "/admin/ai"],
  ["reset-password", "/reset-password"],
  ["admin-reviews", "/admin/reviews"],
  ["onboarding", "/onboarding"],
  ["admin-settings", "/admin/settings"],
];

const viewports = [
  ["375", { width: 375, height: 812 }],
  ["768", { width: 768, height: 1024 }],
  ["1440", { width: 1440, height: 1000 }],
];

// Extra acceptance widths from the spec. These are asserted, not screenshotted:
// 320 is the narrowest supported phone, 844x390 is landscape, and both are the
// sizes most likely to overflow. Runs only on the assert pass.
const EXTRA_VIEWPORTS = [
  ["320", { width: 320, height: 568 }],
  ["390", { width: 390, height: 844 }],
  ["1024", { width: 1024, height: 768 }],
  ["844-landscape", { width: 844, height: 390 }],
];

// /profile and /onboarding call supabase.auth.getSession() directly, so
// VITE_DISABLE_AUTH does not reach them — without a stored session they redirect
// to /login and their screenshots prove nothing about those pages. Seeding a
// non-expiring fake session in localStorage exercises the real render path.
const SUPABASE_REF = "fpmopvxfohiosvjkfqtx";
const SESSION_ROUTES = new Set(["profile", "onboarding", "suggestions", "suggestions-new"]);

function fakeSession() {
  const farFuture = 4102444800; // 2100-01-01
  const claims = { sub: "00000000-0000-0000-0000-000000000001", exp: farFuture, role: "authenticated" };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.signature-not-verified-client-side`;
  return {
    access_token: token,
    refresh_token: "fake-refresh-token",
    token_type: "bearer",
    expires_in: 999999999,
    expires_at: farFuture,
    user: {
      id: claims.sub,
      aud: "authenticated",
      role: "authenticated",
      email: "user@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email", id: claims.sub }],
      user_metadata: {
        first_name: "Test",
        last_name: "Reviewer",
        date_of_birth: "1995-06-15",
        gender: "Prefer not to say",
      },
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

const output = process.env.RESPONSIVE_OUTPUT || "responsive-output";
const assertResponsive = process.env.ASSERT_RESPONSIVE === "1";
const fixtures = "tests/responsive/fixtures";
mkdirSync(output, { recursive: true });
mkdirSync(fixtures, { recursive: true });

// Record/replay for every backend call (:4000 main API and :8000 AI service).
// First run with the backends up writes a fixture per URL; every later run
// replays it. Without this the migration compares live Supabase data captured
// days apart, and content drift drowns out the layout changes we are checking.
// Backend origins only. A "**/api/**" glob also matches Vite's own module URLs
// (/src/api/admin.js), which would be replayed as application/json — the module
// then fails to load and the whole page renders blank.
const BACKEND = /^https?:\/\/(localhost|127\.0\.0\.1):(4000|8000)\//;

function fixturePath(url) {
  const { pathname, search } = new URL(url);
  const key = (pathname + search).replace(/[^a-z0-9]+/gi, "_").slice(0, 120) + ".json";
  return join(fixtures, key);
}

async function stubApi(page) {
  await page.route((url) => BACKEND.test(url.href), async (route) => {
    const file = fixturePath(route.request().url());
    if (existsSync(file)) {
      const { status, body } = JSON.parse(readFileSync(file, "utf8"));
      return route.fulfill({ status, contentType: "application/json", body });
    }
    try {
      const response = await route.fetch();
      const body = await response.text();
      writeFileSync(file, JSON.stringify({ status: response.status(), body }));
      return route.fulfill({ status: response.status(), contentType: "application/json", body });
    } catch {
      // Backend not running and no fixture recorded yet.
      writeFileSync(file, JSON.stringify({ status: 503, body: "[]" }));
      return route.fulfill({ status: 503, contentType: "application/json", body: "[]" });
    }
  });
}

for (const [routeName, route] of routes) {
  for (const [viewportName, viewport] of viewports) {
    test(`${routeName} at ${viewportName}px`, async ({ page }) => {
      await stubApi(page);
      if (SESSION_ROUTES.has(routeName)) {
        const session = JSON.stringify(fakeSession());
        await page.addInitScript(
          ([key, value]) => window.localStorage.setItem(key, value),
          [`sb-${SUPABASE_REF}-auth-token`, session]
        );
      }
      await page.setViewportSize(viewport);
      await page.goto(route, { waitUntil: "domcontentloaded" });
      // Inter loads over the network; screenshotting before it
      // settles captures fallback metrics and shifts every text box.
      await page.evaluate(() => document.fonts.ready);
      // Landing photography comes from Wikimedia Commons at 1600px wide. Without
      // waiting for decode, image-heavy routes screenshot half-empty and the
      // before/after comparison turns into noise.
      await page.evaluate(() => Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }))
      ));
      await page.waitForTimeout(routeName === "map" ? 2500 : 800);

      await page.screenshot({
        path: join(output, `${routeName}-${viewportName}.png`),
        fullPage: true,
        animations: "disabled",
      });

      if (!assertResponsive) return;

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect.soft(overflow, "document must not overflow horizontally").toBeLessThanOrEqual(1);

      // Touch-target rule applies to the touch viewport only. Enforcing 44px at
      // 1440 would contradict "desktop matches the original product" — today's
      // pagination controls are deliberately 32px. Inline text links are exempt
      // at every width (WCAG 2.5.5).
      if (viewportName !== "375") return;

      // Controls Google Maps injects into its own container (.gm-style) are
      // third-party DOM we cannot restyle — excluded rather than left as a
      // permanent failure that trains everyone to ignore this assertion.
      const undersized = await page.locator("#root button, #root [role=button], #root input, #root select, #root textarea")
        .evaluateAll((elements) => elements
          .filter((element) => {
            if (element.closest(".gm-style, .gmnoprint, .gm-err-container, .dismissButton, gmp-internal-google-attribution")) return false;
            // Checkboxes are exempt: a 44px checkbox reads as a broken control,
            // and WCAG 2.5.5 lets the associated label carry the target. They
            // are still enlarged to 24px on phones.
            if (element.matches('input[type="checkbox"]')) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none"
              && style.visibility !== "hidden"
              && rect.width > 0
              && rect.height > 0
              && (rect.width < 44 || rect.height < 44);
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              element: element.outerHTML.slice(0, 160),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          }));
      expect.soft(undersized, "touch targets must be at least 44×44px at 375px").toEqual([]);

      // A wide admin table is only usable if something between it and the body
      // scrolls. Page-level overflow does not catch this: the table overflows
      // inside a clipped panel, so the document stays exactly 375px wide while
      // the Actions column sits off-screen with no way to reach it.
      const trappedTables = await page.locator("#root table.admin-table").evaluateAll((tables) =>
        tables
          .filter((table) => {
            // Compare against the viewport, not the table's own scrollWidth: the
            // table is forced to 900px by min-width, so it never overflows
            // *itself* and that test would silently never run.
            if (table.getBoundingClientRect().width <= document.documentElement.clientWidth) return false;
            for (let node = table.parentElement; node && node !== document.body; node = node.parentElement) {
              const overflowX = getComputedStyle(node).overflowX;
              if (overflowX === "auto" || overflowX === "scroll") return false;
            }
            return true;
          })
          .map((table) => table.className));
      expect.soft(trappedTables, "wide admin tables need a scrollable ancestor").toEqual([]);
    });
  }
}

if (assertResponsive) {
  for (const [routeName, route] of routes) {
    for (const [viewportName, viewport] of EXTRA_VIEWPORTS) {
      test(`${routeName} has no overflow at ${viewportName}`, async ({ page }) => {
        await stubApi(page);
        if (SESSION_ROUTES.has(routeName)) {
          const session = JSON.stringify(fakeSession());
          await page.addInitScript(
            ([key, value]) => window.localStorage.setItem(key, value),
            [`sb-${SUPABASE_REF}-auth-token`, session]
          );
        }
        await page.setViewportSize(viewport);
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(routeName === "map" ? 2000 : 600);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow, `${routeName} must not overflow at ${viewportName}`).toBeLessThanOrEqual(1);
      });
    }
  }
}

if (assertResponsive) {
  test("admin drawer nav is a single column at 375", async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.click(".admin-drawer-toggle");
    const nav = page.locator(".admin-nav");
    await expect(nav).toBeVisible();
    const { direction, wrap } = await nav.evaluate((element) => {
      const style = getComputedStyle(element);
      return { direction: style.flexDirection, wrap: style.flexWrap };
    });
    expect(direction, "drawer nav must stack").toBe("column");
    expect(wrap, "drawer nav must not wrap").toBe("nowrap");
  });
}
