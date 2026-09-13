# Deployment-Aligned Report Update Design

## Objective

Update the existing Google Doc report so every statement affected by the current production deployment matches `https://true-bites-eta.vercel.app` and `origin/main@919970b`, while preserving the report template, its two-tab structure, and the student's backend map contribution boundary.

## Selected Approach

Use a targeted deployment-alignment pass rather than expanding or rebuilding the individual use-case model. Keep:

- `MDV001 — Plan Multi-Stop Trip` as the base use case.
- `MDV002 — Optimize Stop Order` as an optional `«extend»` use case at `Review current trip`.
- `Map User` as the only human actor shown in the individual diagram.

Do not add shared frontend features such as vendor browsing or the vendor-detail modal as individual backend use cases. Mention them only where needed to describe the deployed context or establish scope.

## Authoritative Facts

- Production frontend: `https://true-bites-eta.vercel.app`.
- Deployment baseline: `origin/main@919970b`.
- `/discover` is the vendor-list view and `/map` is the pin-map/trip-planning view.
- Entering `/map` does not wait for geolocation; GPS is requested asynchronously after the route opens.
- Guests and non-admin registered customers can access `/map`. The latest deployment no longer blocks suspended customers from the map, although an account-status notice may be shown elsewhere.
- `POST /api/trip` remains a public OSRM driving endpoint. It powers the backend multi-stop planner.
- Adding a vendor/custom place or updating the origin requests optimization; manual reorder, removal, and custom-stop edits preserve the submitted order.
- `Suggest Best Order` is shown when at least two non-location stops exist and explicitly activates MDV002.
- Car, Motorcycle, Transit, and Walking display routes use the frontend Google Directions integration. They must not be attributed to the backend OSRM optimization endpoint.
- Vendor marker details are now shown in an in-app modal; this is shared frontend functionality outside MDV001/MDV002.
- `/api/route` and the Google-to-OSRM fallback are broader backend map services, not the request path used by the current multi-stop planner.

## Document Changes

1. Section A: update the module description to reflect the deployed `/map` entry, public map access, asynchronous geolocation, and the boundary between backend trip optimization and frontend travel-mode display.
2. Section B:
   - Update the Map User label to `Guest or non-admin Registered Customer`.
   - Preserve the two-bubble `MDV001`/`MDV002` structure and `«extend»` direction.
   - Remove obsolete suspended-account blocking language.
   - Update the use-case descriptions for direct `/map` navigation and asynchronous GPS.
   - Keep vendor details explicitly outside this individual use-case scope while acknowledging the current in-app modal.
   - Synchronize every affected functional requirement in Tab 1 and Tab 2.
3. Section C:
   - Update both activity diagrams so `/map` opens before location resolution.
   - Preserve the backend driving optimization flow and clarify that optional travel-mode visualization is a separate frontend path.
   - Update the UI description to match the deployed Trip/Vendors panels, in-app details, and map controls.
4. Section D: keep code excerpts intact unless their explanatory prose is inaccurate. Narrow D3 to acknowledge frontend distance recalculation, and clarify in D4/D5 that the single-route fallback service is separate from MDV001/MDV002.
5. Section E: update only reflections whose claims depend on the old integration or access model; preserve unaffected personal reflection.

## Preservation And Verification

- Edit the named Google Doc in place.
- Preserve both native tabs, existing tables, heading hierarchy, lists, and unrelated content.
- Replace only affected figure objects and affected table-cell/paragraph text.
- Verify Tab 1 and Tab 2 requirement statements remain identical.
- Re-read the final document from the connector.
- Export to PDF, rasterize all pages, and inspect affected pages for clipping, overlap, or broken pagination.
- Perform an independent read-only review against the deployment baseline before handoff.
