# Vendor Actions Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant view icons, show explicit missing photos, and require consistent Delete-sized confirmations before vendor status changes, Save Changes, and deletion.

**Architecture:** Keep the existing Vendors page and backend contracts. Extract its confirmation presentation into one small reusable component; the page retains operation-specific validation, immutable request snapshots and mutation handlers. Thumbnail rendering remains local to Vendors. One integration task owns the page and tests to avoid concurrent edits to its tightly coupled modal state.

**Tech Stack:** React 18, Tailwind 4, existing admin CSS, Lucide, Playwright, Node test runner.

## Global Constraints

- Scope: approved spec `docs/superpowers/specs/2026-09-03-vendor-actions-confirmation-design.md`; no backend/schema changes.
- Keep current `fix/user-navigation` checkout and all existing unrelated uncommitted changes; no push.
- All confirmations reuse `admin-modal-card admin-confirm-modal` (desktop width at most 420px) and existing header/body/actions classes. Same typography, padding and button geometry; long text may wrap naturally. Normal tone for Approve/Save, danger tone for Suspend/Delete.
- Use one confirmation after the initiating click, not two consecutive popups or typed-name gates. No native window.confirm.
- No real merchant mutations or private data/secrets in tests; intercept local API requests with synthetic fixtures.
- Preserve existing photo upload/automatic-cover commit and edit-cancel rollback semantics. Save confirmation does not turn photo operations into deferred uploads.
- Do not modify the previous Audit Log/Review Moderation changes or their tests. Do not commit scratch reports.
- Ask luna_worker for independent risk review at implementation start and before final verification.

### Task 1: Safe vendor actions and truthful thumbnail state

**Files:**
- Modify: `frontend/src/pages/admin/AdminVendorManagementPage.jsx` (thumbnail, row actions, status/save/delete dispatch and modal integration only).
- Create: `frontend/src/components/admin/ConfirmDialog.jsx` (existing deletion appearance plus focus and pending guards).
- Create: `frontend/tests/responsive/vendor-actions-confirmation.spec.js` (real UI, mocked API).
- If needed for directly testable immutable command preparation, create `frontend/src/lib/vendorActionConfirmation.js` and `frontend/src/lib/vendorActionConfirmation.test.mjs`; otherwise keep this logic in the page.

**Interfaces:**
- Component: `ConfirmDialog({title, message, confirmLabel='Delete', tone='danger', busy=false, onConfirm, onCancel})`; `onConfirm` returns the operation Promise, `onCancel` synchronously dismisses only this confirmation.
- Existing API interfaces remain `updateAdminVendor(id, payload)`, `deleteAdminVendor(id)`, `uploadVendorImage(id, file)`, `deleteVendorGalleryImage(id, url)`.
- Confirmation state owns the target identity/name, requested status or cloned selected IDs, and a shallow form snapshot plus copied gallery Sets for Save. React form objects/File references are not modified in place.

- [x] **Step 1: Write browser regressions before production edits.**

Build a synthetic paginated vendor API fixture containing a valid draft, active vendor, missing-photo vendor, broken-photo vendor and same-name/different-ID vendor. Each record supplies every field read by `makeForm`: ID/name/address/category/dishes/priceRange/phone/coordinates/operatingHours/status/source fields/imageUrl/galleryUrls/coverLocked. Stub dashboard, appeal count, duplicates and image failures. Record PATCH/DELETE requests without reaching the real backend.

Use the following assertions in tests (locators may be scoped to row/dialog):

```js
await page.getByRole('button', { name: 'Approve Draft Cafe', exact: true }).click();
await expect(page.getByRole('dialog', { name: 'Approve vendor?' })).toBeVisible();
expect(writes).toEqual([]);
await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
expect(writes).toEqual([]);
await expect(page.getByRole('button', { name: 'View Draft Cafe', exact: true })).toHaveCount(0);
await expect(missingPhotoRow.getByText('No photo', { exact: true })).toBeVisible();
```

Also cover Suspend; bulk Approve/Suspend fixed target sets; row/bulk/duplicate-panel Delete; valid edit Save; invalid/no-op edit; cancel/Escape retaining edits; async double-click guards and failure retry; normal/broken/replaced photos; keyboard details access. Compare computed width/font/padding/button sizes of Approve/Suspend/Save against Delete on desktop and mobile. Screenshots go in ignored `frontend/responsive-output/vendor-actions-confirmation/`.

- [x] **Step 2: Run the focused new tests and record expected failures.**

```bash
cd frontend
npm run test:responsive -- tests/responsive/vendor-actions-confirmation.spec.js
```

Expected RED: status click sends an immediate PATCH instead of opening a confirmation, Save similarly persists, eye icon remains, and missing/broken images have no explicit placeholder. Separate expected feature failures from fixture/selector errors.

- [x] **Step 3: Implement the shared confirmation boundary and thumbnail state.**

Move existing ConfirmDialog markup into the new component with its existing class names. Add dialog/aria-modal/name semantics, focus initial Cancel, trap Tab within the dialog, restore trigger focus when still connected, and handle Escape at capture phase so it cannot dismiss the underlying editor. Busy state disables both buttons and backdrop/Escape dismissal. Use a synchronous ref, not only React state, to guard repeated confirmation clicks:

```js
const inFlight = useRef(false);
const [submitting, setSubmitting] = useState(false);
async function confirm() {
  if (busy || inFlight.current) return;
  inFlight.current = true;
  setSubmitting(true);
  try { await onConfirm(); }
  finally { inFlight.current = false; setSubmitting(false); }
}
function cancel() {
  if (!busy && !inFlight.current) onCancel();
}
```

For thumbnails, track the failed source by vendor ID and resolved URL instead of an effect that could let a late error poison a replacement. Render the same-sized explicit placeholder if the URL is absent or failed:

```jsx
const [failedSource, setFailedSource] = useState(null);
const src = placeholderImage({ storefront_image_url: vendor.imageUrl });
const sourceKey = JSON.stringify([vendor.id, src]);
return !src || failedSource === sourceKey
  ? <span className={`${className || 'admin-table-thumb'} flex items-center justify-center bg-slate-50 text-center text-[9px] leading-tight text-slate-500`} role="img" aria-label={`No photo for ${vendor.name}`}>No photo</span>
  : <img key={sourceKey} src={src} alt="" className={className || 'admin-table-thumb'} loading="lazy" onError={() => setFailedSource(sourceKey)} />;
```

Remove only the row Eye action/import. Convert the vendor-name text to a visually matching focusable button opening the same details handler, with stopPropagation to prevent a double row invocation.

- [x] **Step 4: Wire snapshots to existing mutations.**

Replace direct status calls with request state containing target IDs/names/status. Example payload preparation:

```js
setStatusConfirmation({ ids: [vendor.id], names: [vendor.name], status: 'active', bulk: false });
setStatusConfirmation({ ids: [...selectedIds], names: data.items.filter(v => selectedIds.has(v.id)).map(v => v.name), status: 'suspended', bulk: true });
```

Use the captured IDs for mutation (not `selectedIds` at confirmation time), retain Promise.allSettled partial-success handling, clear confirmation after a completed attempt, and keep failed targets available for retry. Clear single Delete confirmation on successful deletion before refetch so a refetch failure cannot invite repeating an already completed delete; retain the dialog on deletion failure. Snapshot bulk deletion IDs and duplicate target names at request time too. All delete entry points continue to use the same component.

Split existing `handleSave` into prepare/request and execute phases without duplicating the existing persistence body. Validate before opening confirmation and preserve current no-change message. Capture `vendor`, `{...form}`, `{...editSnapshot}`, copied pending-delete/pending-add collections and the derived change flags. Execute the existing persistence body using that snapshot, preserving partial-save snapshots, cover lock rollback data, failed gallery deletion retry and map/list refresh behavior. The positive button is `Save Changes`, with title `Save changes?`; no-op or invalid forms must not open it.

Guard the underlying VendorDetailModal's dismiss/cancel and form controls while a confirmation or save is active. Escape from the top confirmation closes only it and keeps edited values. Do not invoke edit rollback from confirmation cancellation. Handle direct row and bulk status flows and both detail-editor and row-pencil entry points consistently.

- [x] **Step 5: Verify, self-review, and commit only task-owned files.**

```bash
cd frontend
npm run test:responsive -- tests/responsive/vendor-actions-confirmation.spec.js
npm run test:unit
npm run build
git diff --check
```

Expected GREEN: each new regression passes; all pre-existing unit tests remain green; build exits zero (record existing bundle-size warning separately). Confirm code/tests do not send real writes or expose storage credentials. Review desktop/mobile screenshots with the main agent. Commit exactly the owned production/tests files, never use `git add .`.

- [x] **Step 6: Task review and final verification.**

Pass the task brief, implementation report and generated diff package to a separate spec/quality reviewer. Fix verified Important/Critical findings through the implementer with focused tests and scoped re-review. Main independently runs the final relevant tests/build, requests luna_worker safety review and final broad review, then records completion in this plan and the approved spec. Keep the branch; no merge/push or deletion of existing outputs.

## Completion record

- Implementation commits: `5f2a4b6`, `1d704ed`, `932e635`.
- Final independent verification: 32/32 browser regressions (Vendors confirmations plus existing Audit Log and Review Moderation filters); 158/158 unit tests; production build and diff checks passed. Existing Vite bundle-size warning remains.
- Desktop/mobile screenshots inspected at 1440px and 390px. All confirmations reuse the original Delete styles; missing/broken photos show explicit placeholders.
- Initial and final bounded `luna_worker` reviews completed. Task and final reviewers verified fixes for danger tone, post-delete refresh failures, truthful failure messages and keyboard focus containment. No remaining Critical/Important findings.
- Nonblocking coverage follow-ups: explicit bulk-Suspend/selection-change snapshot and failed-photo-to-replacement regression cases. Those behaviors are implemented and code-reviewed; the current suite does not separately exercise these transitions.
- Current branch and unrelated uncommitted changes retained; no push or merge. No real vendor records mutated during verification.
