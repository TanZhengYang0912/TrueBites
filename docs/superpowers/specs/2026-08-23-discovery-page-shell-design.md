# Discovery Page Shell Design

Date: 2026-08-23

## Goal

Make the customer-facing discovery surfaces feel like one product family. The
Discover, Saved, My reviews, and Suggest pages should share the same header,
content width, top spacing, intro rhythm, and footer treatment while retaining
their page-specific controls and content.

## Scope

In scope:

- A shared shell for customer discovery pages.
- A shared page-intro pattern for eyebrow, title, description, and optional
  actions.
- Consistent responsive horizontal padding, max width, vertical spacing, and
  footer placement.
- Applying the shell to Saved, My reviews, Suggest, and Suggestion form.
- Keeping Discover's search, filters, community banner, vendor cards, and map
  controls unchanged in behavior.

Out of scope:

- Redesigning the Discover filter bar or community banner for other pages.
- Changing navigation labels, routes, authentication, data fetching, or card
  behavior.
- Changing admin pages or the marketing landing page.

## Recommended structure

Create a reusable `DiscoveryPageShell` component that owns the page background,
`DiscoveryHeader`, main container, and footer spacing. It accepts the existing
header props and renders page content through children.

Create a small `DiscoveryPageIntro` component for the repeated eyebrow/title/
description block. It accepts text and optional action content so Saved and
Suggest can keep their existing buttons without creating one-off wrappers.

The page-specific layout remains inside each page:

- Discover keeps the existing dashboard layout and controls.
- Saved and My reviews use the shell plus their tabs and card/review content.
- Suggest uses the shell plus the suggestion CTA/form content.

The shell should use the same effective container sizing as Discover:
`mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6`, with the intro and content
sections following one consistent vertical rhythm. Short pages should still
reserve the same bottom breathing room before the shared footer.

## Visual rules

- Keep `DiscoveryHeader` as the single customer navigation implementation.
- Use the existing typography tokens (`font-display`, `text-ink`, `text-muted`,
  `text-terracotta`) rather than page-specific colors.
- Keep the intro eyebrow uppercase, small, and terracotta across all pages.
- Keep title sizing responsive with the same clamp range and line-height.
- Keep actions aligned with the intro on desktop and stacked naturally on small
  screens.
- Do not add Discover-only filters or the green community banner to secondary
  pages.

## Behavior and accessibility

- Existing route navigation, active navigation state, data loading, empty
  states, and error states remain unchanged.
- The shell must not hide or reorder existing headings and landmarks.
- Each page keeps one primary `h1`; the shared intro component must not create
  duplicate headings.
- Existing buttons and links retain their accessible labels and keyboard
  behavior.

## Verification

- Existing frontend unit tests continue to pass.
- Responsive tests cover Discover, Saved, My reviews, Suggest, and Suggest form
  at mobile, tablet, and desktop widths.
- Production Vite build succeeds.
- A visual review confirms matching header position, content width, title
  spacing, and footer spacing across all four customer surfaces.
