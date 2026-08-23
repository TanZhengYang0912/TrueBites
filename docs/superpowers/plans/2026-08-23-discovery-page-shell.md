# Discovery Page Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Discover, Saved, My reviews, Suggest, and Suggestion form share the same customer-facing page skeleton while preserving each page's existing content, navigation, data behavior, and controls.

**Architecture:** Add a small `DiscoveryPageShell` that owns the customer background, shared `DiscoveryHeader`, Discover-sized responsive main container, and shared `Footer`. Add `DiscoveryPageIntro` for the repeated eyebrow/title/description/action rhythm. Refactor Engagement, Suggestions, and SuggestionFormPage to compose these primitives; leave Discover's custom hero, search, filters, and community banner behavior intact.

**Tech Stack:** React 18, React Router, Tailwind CSS utility classes, Node's built-in test runner, Playwright responsive tests, Vite.

## Global Constraints

- Keep `DiscoveryHeader` as the single customer navigation implementation.
- Use the existing typography tokens `font-display`, `text-ink`, `text-muted`, and `text-terracotta`.
- The shared shell main container must use `mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-6 md:pb-18 md:pt-12 xl:px-10`.
- Do not add Discover-only filters or the green community banner to secondary pages.
- Preserve existing routes, active navigation state, authentication gates, data fetching, loading/error/empty states, form submission, and card behavior.
- Each affected page must keep exactly one primary `h1`.
- Short pages must keep bottom breathing room before the shared footer.
- Do not modify admin pages, the marketing landing page, or the Map view layout.

---

### Task 1: Add shared shell primitives and a structural regression test

**Files:**
- Create: `frontend/src/components/discovery/DiscoveryPageShell.jsx`
- Create: `frontend/src/components/discovery/DiscoveryPageIntro.jsx`
- Create: `frontend/src/lib/discoveryLayout.test.mjs`
- Modify: `docs/superpowers/specs/2026-08-23-discovery-page-shell-design.md` (already corrected to match Discover's actual 1360px container)

**Interfaces:**
- `DiscoveryPageShell({ headerProps, children, mainClassName = "" })` renders one `DiscoveryHeader`, a `<main>` using the shared Discover-sized container classes, `children`, and one `Footer`.
- `DiscoveryPageIntro({ eyebrow, title, description, action = null, className = "" })` renders the shared eyebrow/title/description block and an optional action; `title` is a React node so existing page copy can remain unchanged.
- The static test reads source files and verifies all shell consumers import/use the shared shell and intro, and that the shell contains the canonical responsive class tokens.

- [ ] **Step 1: Write the failing structural test**

Create `frontend/src/lib/discoveryLayout.test.mjs` with these exact assertions:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("the shared shell owns the Discover-sized page frame", () => {
  const shell = read("components/discovery/DiscoveryPageShell.jsx");
  assert.match(shell, /DiscoveryHeader/);
  assert.match(shell, /Footer/);
  assert.match(shell, /max-w-\\[1360px\\]/);
  assert.match(shell, /md:pb-18/);
  assert.match(shell, /xl:px-10/);
});

test("secondary discovery pages compose the shared shell and intro", () => {
  for (const path of [
    "pages/EngagementPage.jsx",
    "pages/SuggestionsPage.jsx",
    "pages/SuggestionFormPage.jsx",
  ]) {
    const source = read(path);
    assert.match(source, /DiscoveryPageShell/);
    assert.match(source, /DiscoveryPageIntro/);
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd frontend && node --test src/lib/discoveryLayout.test.mjs`

Expected: FAIL because the new shell and intro files do not exist and the three pages still render their own frames.

- [ ] **Step 3: Implement the shell**

Create `DiscoveryPageShell.jsx` with this exact shape, allowing only `mainClassName` to add page-specific classes:

```jsx
import DiscoveryHeader from "./DiscoveryHeader";
import Footer from "../Footer";

const MAIN_CLASS = "mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-6 md:pb-18 md:pt-12 xl:px-10";

export default function DiscoveryPageShell({ headerProps, children, mainClassName = "" }) {
  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader {...headerProps} />
      <main className={`${MAIN_CLASS} ${mainClassName}`.trim()}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Implement the shared intro**

Create `DiscoveryPageIntro.jsx` so it preserves one `h1`, supports optional action content, and stacks cleanly on narrow screens:

```jsx
export default function DiscoveryPageIntro({ eyebrow, title, description, action = null, className = "" }) {
  return (
    <div className={`mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between ${className}`.trim()}>
      <div>
        <p className="mb-3 mt-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">{eyebrow}</p>
        <h1 className="m-0 max-w-3xl font-display text-[clamp(32px,4vw,54px)] font-medium leading-[1.05] tracking-[-0.04em] text-ink">{title}</h1>
        <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `cd frontend && node --test src/lib/discoveryLayout.test.mjs`

Expected: PASS for both tests.

- [ ] **Step 6: Commit the primitives and spec correction**

```bash
git add -f docs/superpowers/specs/2026-08-23-discovery-page-shell-design.md docs/superpowers/plans/2026-08-23-discovery-page-shell.md
git add frontend/src/components/discovery/DiscoveryPageShell.jsx frontend/src/components/discovery/DiscoveryPageIntro.jsx frontend/src/lib/discoveryLayout.test.mjs
git commit -m "feat: add shared discovery page shell"
```

### Task 2: Refactor Saved and My reviews onto the shared frame

**Files:**
- Modify: `frontend/src/pages/EngagementPage.jsx:1-400`

**Interfaces:**
- Reuse the existing `headerProps` values and navigation callbacks exactly; pass them as the `headerProps` object to `DiscoveryPageShell`.
- Replace only the outer page wrapper, direct `DiscoveryHeader`, main container, intro wrapper, and existing `Footer`; leave all bookmark/review handlers, cards, pagination, modals, toast, and auth gate behavior unchanged.

- [ ] **Step 1: Add the shared imports and replace the page frame**

Replace the direct `DiscoveryHeader` and `Footer` imports with:

```jsx
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
```

Then replace the return-frame section with:

```jsx
return (
  <DiscoveryPageShell
    headerProps={{
      onOpenMap: () => navigate("/map?view=map"),
      session,
      userEmail,
      initials,
      firstName,
      avatarUrl,
      savedCount: bookmarks.length,
      activeSection: tab === "reviews" ? "reviews" : "saved",
      onOpenDiscover: () => navigate("/map"),
      onOpenSaved: () => { setTab("bookmarks"); navigate("/engagement"); },
      onOpenReviews: () => { setTab("reviews"); navigate("/engagement?tab=reviews"); },
      onOpenSuggestions: () => navigate("/suggestions"),
      onLogin: () => navigate("/login"),
      onSignUp: () => navigate("/login"),
      onOpenProfile: () => navigate("/profile"),
      onOpenVendor: (id) => navigate(`/map?vendor=${id}`),
    }}
  >
    <DiscoveryPageIntro
      eyebrow="Your TrueBites collection"
      title={tab === "reviews" ? "My reviews" : "Saved places"}
      description={tab === "reviews" ? "Keep track of the places and flavours you have shared." : "Keep the Melaka places you want to return to."}
    />
    {/* Keep the current bookmark and review sections in this position unchanged. */}
  </DiscoveryPageShell>
);
```

When applying this frame, remove the old page `<div>`, direct header, `<main>`, intro `<div>`, and old `<Footer>` only. The existing section content and modal siblings must remain inside the shell; modals may remain after the main content but before the shell closes if required by their fixed positioning.

- [ ] **Step 2: Run Engagement's existing unit coverage and the structural test**

Run: `cd frontend && node --test src/lib/discoveryLayout.test.mjs src/lib/*.test.mjs`

Expected: PASS with no changed bookmark/review behavior assertions.

- [ ] **Step 3: Run the responsive routes covering Saved and My reviews**

Run: `cd frontend && npx playwright test tests/responsive/routes.spec.js --grep "engagement"`

Expected: PASS at the existing mobile, tablet, and desktop viewport matrix; screenshots show the shared Discover-sized header/content/footer rhythm.

- [ ] **Step 4: Commit the Engagement refactor**

```bash
git add frontend/src/pages/EngagementPage.jsx
git commit -m "refactor: align saved and reviews with discovery shell"
```

### Task 3: Refactor Suggest and Suggestion form onto the shared frame

**Files:**
- Modify: `frontend/src/pages/SuggestionsPage.jsx:1-150`
- Modify: `frontend/src/pages/SuggestionFormPage.jsx:1-100`

**Interfaces:**
- Both pages pass their current `DiscoveryHeader` props unchanged through `DiscoveryPageShell`.
- `SuggestionsPage` uses `DiscoveryPageIntro` with the existing “My suggestions” copy and CTA.
- `SuggestionFormPage` uses `DiscoveryPageIntro` with the existing “Share the place locals keep to themselves.” copy and “My suggestions” CTA.
- The existing suggestion list, edit modal, form validation, submission redirect, and error/loading/empty states remain unchanged.

- [ ] **Step 1: Replace each page's frame and intro**

For `SuggestionsPage.jsx`, use the current navigation callbacks exactly as follows:

```jsx
<DiscoveryPageShell
  headerProps={{
    session: userSession,
    userEmail: email,
    initials,
    firstName,
    avatarUrl: meta.avatar_url || "",
    activeSection: "suggestions",
    onOpenDiscover: () => navigate("/map"),
    onOpenSaved: () => navigate("/engagement"),
    onOpenReviews: () => navigate("/engagement?tab=reviews"),
    onOpenSuggestions: () => navigate("/suggestions"),
    onOpenProfile: () => navigate("/profile"),
    onOpenMap: () => navigate("/map?view=map"),
    onLogin: () => navigate("/login"),
    onSignUp: () => navigate("/login"),
  }}
>
  <DiscoveryPageIntro
    eyebrow="Your community discoveries"
    title="My suggestions"
    description="Track the hidden gems you have shared with TrueBites. We will keep the updates simple while our team verifies the details."
    action={<button type="button" onClick={() => navigate("/suggestions/new")} className="min-h-11 shrink-0 rounded bg-forest px-4 text-sm font-semibold text-white">Suggest another vendor</button>}
  />
  {/* Keep the current tab row, notices, suggestion list, and empty state here. */}
</DiscoveryPageShell>
```

For `SuggestionFormPage.jsx`, use the same current navigation callbacks:

```jsx
<DiscoveryPageShell
  headerProps={{
    session: userSession,
    userEmail: email,
    initials,
    firstName,
    avatarUrl: meta.avatar_url || "",
    activeSection: "suggestions",
    onOpenDiscover: () => navigate("/map"),
    onOpenSaved: () => navigate("/engagement"),
    onOpenReviews: () => navigate("/engagement?tab=reviews"),
    onOpenSuggestions: () => navigate("/suggestions"),
    onOpenProfile: () => navigate("/profile"),
    onOpenMap: () => navigate("/map?view=map"),
    onLogin: () => navigate("/login"),
    onSignUp: () => navigate("/login"),
  }}
>
  <DiscoveryPageIntro
    eyebrow="Community discoveries · Melaka only"
    title="Share the place locals keep to themselves."
    description="Send us a vendor and a video. Our admin team checks every suggestion before it becomes part of the TrueBites guide."
    action={<button type="button" onClick={() => navigate("/suggestions")} className="min-h-11 shrink-0 rounded bg-forest px-4 text-sm font-semibold text-white">My suggestions</button>}
  />
  {/* Keep the current SuggestionForm card here unchanged. */}
</DiscoveryPageShell>
```

Remove the old direct `DiscoveryHeader`, old `max-w-[1200px]` `<main>`, and the duplicated intro wrappers. Do not add the Discover filter bar or community banner. Do not change `activeSection="suggestions"` or any navigation callback.

- [ ] **Step 2: Run structural and unit tests**

Run: `cd frontend && node --test src/lib/discoveryLayout.test.mjs src/lib/*.test.mjs`

Expected: PASS, including the existing suggestion/address/influencer regression tests.

- [ ] **Step 3: Run all affected responsive routes**

Run: `cd frontend && npx playwright test tests/responsive/routes.spec.js --grep "suggestions|engagement"`

Expected: PASS for Suggest, Suggestion form, Saved, and My reviews at all configured viewports without horizontal overflow or clipped CTAs.

- [ ] **Step 4: Commit the Suggest refactor**

```bash
git add frontend/src/pages/SuggestionsPage.jsx frontend/src/pages/SuggestionFormPage.jsx
git commit -m "refactor: align suggestion pages with discovery shell"
```

### Task 4: Full verification, visual review, and final commit handoff

**Files:**
- Verify: `frontend/src/components/Dashboard.jsx` and `frontend/tests/responsive/routes.spec.js` without changing them unless a concrete regression is found.

**Interfaces:**
- The final implementation exposes one consistent shell for secondary customer pages and preserves Discover's custom content inside its existing frame.
- No new runtime dependency, API, route, or database migration is introduced.

- [ ] **Step 1: Inspect the final diff for scope and class consistency**

Run: `git diff 9d4735c..HEAD -- frontend/src/components/discovery frontend/src/pages/EngagementPage.jsx frontend/src/pages/SuggestionsPage.jsx frontend/src/pages/SuggestionFormPage.jsx frontend/tests/responsive/routes.spec.js`

Verify that only the shared shell/intro, the three customer pages, and tests changed; no API calls, route paths, status strings, form fields, or admin files changed.

- [ ] **Step 2: Run all frontend unit tests**

Run: `cd frontend && npm run test:unit`

Expected: PASS with zero failures.

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`

Expected: Vite completes successfully and writes the production bundle to `frontend/dist`.

- [ ] **Step 4: Run the full responsive suite**

Run: `cd frontend && npm run test:responsive`

Expected: PASS for Discover, Saved, My reviews, Suggest, Suggestion form, and the existing other routes; no new overflow or console errors.

- [ ] **Step 5: Perform a final visual/accessibility review**

Inspect the responsive screenshots for:

```text
Discover      header + 1360px frame + existing hero/filter/banner + footer
Saved         same header/frame/title rhythm + folders/cards + footer
My reviews    same header/frame/title rhythm + filters/cards + footer
Suggest       same header/frame/title rhythm + tabs/status cards + footer
Suggest form  same header/frame/title rhythm + form card + footer
```

Confirm each page has one `h1`, the header active tab remains correct, action buttons remain keyboard reachable, and no page-specific controls were removed.

- [ ] **Step 6: Before claiming completion, check for an independent bounded review**

Ask the `luna_worker` reviewer to inspect the final diff read-only for accidental changes to auth/navigation/data behavior and for responsive shell consistency. Resolve any actionable findings, then rerun the focused and full verification commands above.

- [ ] **Step 7: Commit any final corrections**

```bash
git add frontend/src/components/discovery frontend/src/pages/EngagementPage.jsx frontend/src/pages/SuggestionsPage.jsx frontend/src/pages/SuggestionFormPage.jsx frontend/src/lib/discoveryLayout.test.mjs frontend/tests/responsive/routes.spec.js
git commit -m "test: verify consistent discovery page shell"
```

## Self-review

- Spec coverage: Tasks 1–3 implement the shared shell, shared intro, Discover-sized responsive frame, footer spacing, and page-specific content preservation. Task 4 covers unit, responsive, build, visual, and accessibility verification.
- Scope: Discover keeps its current custom hero/search/filter/banner behavior; no admin, auth, API, route, or data changes are planned.
- Placeholder scan: no unspecified implementation step is required; every file, command, expected result, and interface is named.
- Type/prop consistency: `DiscoveryPageShell` consumes `headerProps`, `children`, and `mainClassName`; `DiscoveryPageIntro` consumes `eyebrow`, `title`, `description`, `action`, and `className`. All page tasks use those exact props.
