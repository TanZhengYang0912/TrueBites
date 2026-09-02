import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Match by API path rather than a localhost origin so VITE_API_BASE cannot
// accidentally send this synthetic write fixture to a configured backend.
const API = url => new URL(url).pathname.startsWith("/api/");

const vendor = (id, name, status, imageUrl = "https://images.example.test/storefront.jpg") => ({
  id,
  name,
  fullAddress: "12 Jalan Melaka, Melaka",
  category: "Cafe / Dessert",
  dishes: ["Cendol"],
  priceRange: "RM 10 - RM 20 per person",
  phone: "0612345678",
  latitude: 2.2,
  longitude: 102.25,
  operatingHours: "09:00 AM - 06:00 PM",
  status,
  sourcePlatform: "manual",
  sourceVideoUrl: "",
  locationPrecision: "exact",
  imageUrl,
  galleryUrls: [],
  coverLocked: false,
});

async function setup(page, width = 1440, { failPatchOnceFor, failDeleteOnceFor, deferPatchFor } = {}) {
  const writes = [];
  const vendors = [
    vendor("draft", "Draft Cafe", "draft"),
    vendor("active", "Active Cafe", "active"),
    vendor("missing", "Missing Photo Cafe", "draft", null),
    vendor("broken", "Broken Photo Cafe", "draft", "https://images.example.test/broken.jpg"),
    vendor("same-name", "Draft Cafe", "suspended"),
  ];
  const failedPatchIds = new Set(failPatchOnceFor ? [failPatchOnceFor] : []);
  const failedDeleteIds = new Set(failDeleteOnceFor ? [failDeleteOnceFor] : []);
  let releaseDeferredPatch;
  const deferredPatch = new Promise(resolve => { releaseDeferredPatch = resolve; });
  await page.setViewportSize({ width, height: 900 });
  await page.route(API, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/vendors" && request.method() === "GET") {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 10);
      await route.fulfill({ json: {
        items: vendors.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
        pagination: { page: pageNumber, pageSize, total: vendors.length, totalPages: 1 },
      } });
      return;
    }
    if (url.pathname === "/api/admin/vendors/duplicates") {
      await route.fulfill({ json: { groups: [{ a: { id: "draft", vendor_name: "Draft Cafe", address: "12 Jalan Melaka" }, b: { id: "same-name", vendor_name: "Draft Cafe", address: "13 Jalan Melaka" }, match_score: .9, match_type: "possible" }] } });
      return;
    }
    if (request.method() === "PATCH" && /^\/api\/admin\/vendors\//.test(url.pathname)) {
      const id = url.pathname.split("/").at(-1);
      const body = request.postDataJSON();
      writes.push({ method: "PATCH", id, body });
      if (id === deferPatchFor) await deferredPatch;
      if (failedPatchIds.delete(id)) {
        await route.fulfill({ status: 500, json: { error: "Retry this update" } });
        return;
      }
      const item = vendors.find(row => row.id === id);
      if (item) Object.assign(item, body.status ? { status: body.status } : {}, body.vendor_name ? { name: body.vendor_name } : {});
      await route.fulfill({ json: item || {} });
      return;
    }
    if (request.method() === "DELETE" && /^\/api\/admin\/vendors\//.test(url.pathname)) {
      const id = url.pathname.split("/").at(-1);
      writes.push({ method: "DELETE", id });
      if (failedDeleteIds.delete(id)) {
        await route.fulfill({ status: 500, json: { error: "Retry this deletion" } });
        return;
      }
      const index = vendors.findIndex(row => row.id === id);
      if (index >= 0) vendors.splice(index, 1);
      await route.fulfill({ json: {} });
      return;
    }
    if (url.pathname === "/api/admin/dashboard") return route.fulfill({ json: {} });
    if (url.pathname === "/api/admin/appeals/pending-count") return route.fulfill({ json: { count: 0 } });
    await route.fulfill({ json: {} });
  });
  await page.route("https://images.example.test/storefront.jpg", route => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLCRwAAAABJRU5ErkJggg==", "base64"),
  }));
  await page.route("https://images.example.test/broken.jpg", route => route.fulfill({ status: 404 }));
  await page.goto("/admin/vendors2");
  await expect(page.getByRole("button", { name: "Approve Draft Cafe", exact: true }).first()).toBeVisible();
  return { writes, releaseDeferredPatch };
}

async function dialogGeometry(dialog) {
  return dialog.evaluate(element => {
    const card = getComputedStyle(element);
    const header = getComputedStyle(element.querySelector(".admin-modal-header"));
    const body = getComputedStyle(element.querySelector(".admin-modal-form"));
    const button = getComputedStyle(element.querySelector(".admin-primary-btn"));
    return {
      width: card.width, borderRadius: card.borderRadius,
      headerFont: header.fontSize, headerPadding: `${header.paddingTop}/${header.paddingLeft}`,
      bodyFont: body.fontSize, bodyPadding: `${body.paddingTop}/${body.paddingLeft}`,
      button: [button.height, button.fontSize, button.paddingLeft, button.paddingRight, button.borderRadius],
    };
  });
}

for (const width of [1440, 390]) {
  test(`vendor action confirmation is safe and matches Delete geometry at ${width}px`, async ({ page }) => {
    const { writes } = await setup(page, width);
    await page.getByRole("button", { name: "Approve Draft Cafe", exact: true }).first().click();
    const approveDialog = page.getByRole("dialog", { name: "Approve vendor?" });
    await expect(approveDialog).toBeVisible();
    const approveButton = approveDialog.getByRole("button", { name: "Approve", exact: true });
    const cancelButton = approveDialog.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(approveButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();
    const approveGeometry = await dialogGeometry(approveDialog);
    expect(writes).toEqual([]);
    if (width === 1440 || width === 390) {
      await mkdir(resolve("responsive-output/vendor-actions-confirmation"), { recursive: true });
      await page.screenshot({ path: resolve(`responsive-output/vendor-actions-confirmation/${width}.png`), fullPage: true, animations: "disabled" });
    }
    await approveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(writes).toEqual([]);
    await expect(page.getByRole("button", { name: "View Draft Cafe", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Suspend Active Cafe", exact: true }).click();
    const suspendDialog = page.getByRole("dialog", { name: "Suspend vendor?" });
    await expect(suspendDialog).toBeVisible();
    const suspendGeometry = await dialogGeometry(suspendDialog);
    await suspendDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "Edit Draft Cafe", exact: true }).first().click();
    await page.locator('input[name="vendor_name"]').fill("Draft Cafe Geometry");
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save changes?" });
    await expect(saveDialog).toBeVisible();
    const saveGeometry = await dialogGeometry(saveDialog);
    await saveDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    const missingPhotoRow = page.getByRole("row").filter({ hasText: "Missing Photo Cafe" });
    await expect(missingPhotoRow.getByText("No photo", { exact: true })).toBeVisible();
    const brokenPhotoRow = page.getByRole("row").filter({ hasText: "Broken Photo Cafe" });
    await expect(brokenPhotoRow.getByText("No photo", { exact: true })).toBeVisible();

    const actions = page.getByRole("row").filter({ hasText: "Draft Cafe" }).first();
    const approve = actions.getByRole("button", { name: "Approve Draft Cafe", exact: true });
    const deleteButton = actions.getByRole("button", { name: "Delete Draft Cafe", exact: true });
    expect(await approve.evaluate(el => {
      const s = getComputedStyle(el); return [s.width, s.height, s.fontSize, s.paddingLeft, s.paddingRight];
    })).toEqual(await deleteButton.evaluate(el => {
      const s = getComputedStyle(el); return [s.width, s.height, s.fontSize, s.paddingLeft, s.paddingRight];
    }));
    await deleteButton.click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete vendor?" });
    await expect(deleteDialog).toBeVisible();
    const deleteGeometry = await dialogGeometry(deleteDialog);
    expect(deleteGeometry).toEqual(approveGeometry);
    expect(deleteGeometry).toEqual(suspendGeometry);
    expect(deleteGeometry).toEqual(saveGeometry);
    await deleteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
}

test("row and bulk action snapshots only write after confirmation", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "Suspend Active Cafe", exact: true }).click();
  await page.getByRole("dialog", { name: "Suspend vendor?" }).getByRole("button", { name: "Suspend", exact: true }).click();
  await expect.poll(() => writes).toEqual([{ method: "PATCH", id: "active", body: { status: "suspended" } }]);

  await page.getByRole("checkbox", { name: "Select Draft Cafe", exact: true }).first().check();
  await page.getByRole("checkbox", { name: "Select Draft Cafe", exact: true }).nth(1).check();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Approve 2 vendors?" })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => writes.filter(write => write.method === "PATCH").length).toBe(3);
});

test("editing saves only after confirmation and Escape preserves the draft", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "Edit Draft Cafe", exact: true }).first().click();
  const name = page.locator('input[name="vendor_name"]');
  await name.fill("Draft Cafe Updated");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save changes?" })).toBeVisible();
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(name).toHaveValue("Draft Cafe Updated");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await page.getByRole("dialog", { name: "Save changes?" }).getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect.poll(() => writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "PATCH", id: "draft", body: { vendor_name: "Draft Cafe Updated" } });
});

test("invalid and unchanged edits do not open a save confirmation", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Edit Draft Cafe", exact: true }).first().click();
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save changes?" })).toHaveCount(0);
  await page.locator('input[name="vendor_name"]').fill("");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByText("Vendor name is required.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Save changes?" })).toHaveCount(0);
});

test("delete entry points confirm captured targets and retry a failed deletion", async ({ page }) => {
  const { writes } = await setup(page, 1440, { failDeleteOnceFor: "active" });
  await page.getByRole("button", { name: "Delete Active Cafe", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete vendor?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => writes).toEqual([{ method: "DELETE", id: "active" }]);
  await expect(page.getByRole("dialog", { name: "Delete vendor?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => writes).toEqual([{ method: "DELETE", id: "active" }, { method: "DELETE", id: "active" }]);
  await expect(page.getByRole("dialog", { name: "Delete vendor?" })).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Select Draft Cafe", exact: true }).first().check();
  await page.getByRole("checkbox", { name: "Select Missing Photo Cafe", exact: true }).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Delete 2 vendors?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => writes.filter(write => write.method === "DELETE").length).toBe(4);

  await page.getByRole("button", { name: /1 possible duplicate/i }).click();
  await page.locator(".admin-duplicate-pair").getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Delete vendor?" })).toBeVisible();
  await page.getByRole("dialog", { name: "Delete vendor?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => writes.filter(write => write.method === "DELETE").length).toBe(5);
});

test("a failed status confirmation can retry", async ({ page }) => {
  const { writes } = await setup(page, 1440, { failPatchOnceFor: "active" });
  await page.getByRole("button", { name: "Suspend Active Cafe", exact: true }).click();
  await page.getByRole("dialog", { name: "Suspend vendor?" }).getByRole("button", { name: "Suspend", exact: true }).click();
  await expect.poll(() => writes).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Suspend Active Cafe", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Suspend Active Cafe", exact: true }).click();
  await page.getByRole("dialog", { name: "Suspend vendor?" }).getByRole("button", { name: "Suspend", exact: true }).click();
  await expect.poll(() => writes).toHaveLength(2);
  expect(writes.filter(write => write.id === "active")).toHaveLength(2);
});

test("a busy confirmation ignores a second pointer click", async ({ page }) => {
  const { writes, releaseDeferredPatch } = await setup(page, 1440, { deferPatchFor: "draft" });
  await page.getByRole("button", { name: "Approve Draft Cafe", exact: true }).first().click();
  const confirm = page.getByRole("dialog", { name: "Approve vendor?" }).getByRole("button", { name: "Approve", exact: true });
  await confirm.click();
  await expect.poll(() => writes).toHaveLength(1);
  const busyConfirm = page.getByRole("dialog", { name: "Approve vendor?" }).locator(".admin-primary-btn");
  await expect(busyConfirm).toBeDisabled();
  const box = await busyConfirm.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  expect(writes).toHaveLength(1);
  releaseDeferredPatch();
  await expect(page.getByRole("dialog", { name: "Approve vendor?" })).toHaveCount(0);
});
