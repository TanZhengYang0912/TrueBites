# Map Routing UML Corrections

## Scope

Correct the individual Map Routing documentation in the existing Google Doc without changing unrelated report sections or Tab 2 structure.

## Use Case Diagram

- Name the system boundary `TrueBites — Map Routing`.
- Show two separate human actors: `Guest` and `Registered User`.
- Associate both actors only with `Plan Multi-Stop Trip`.
- Show `Optimize Stop Order` as an optional extension with one dashed `«extend»` arrow pointing to `Plan Multi-Stop Trip`.
- Do not associate either actor directly with `Optimize Stop Order`.
- Do not show OSRM as a use-case actor.
- Keep tracking identifiers MDV001 and MDV002 in the textual requirements only, not inside use-case bubbles.

## Activity Diagrams

Both activity diagrams use three responsibility swimlanes:

1. `Guest / Registered User`
2. `TrueBites Frontend`
3. `Map Routing Backend / OSRM`

The first diagram covers opening `/map`, asynchronous GPS, adding and editing stops, automatic/current-order route requests, validation, error handling, route display, trip review, and the optional transition to `Optimize Stop Order`.

The second diagram covers the explicit `Suggest Best Order` request, backend validation, OSRM trip optimization, mapping `order/path/distance/duration`, success or failure handling, review, and return to `Plan Multi-Stop Trip`.

## Text Synchronization

- Change `Backend Map Visualization Module` to `Map Routing` in Section A.
- Replace the combined `Map User` wording with `Guest or Registered User` in both use-case Actor / Activator fields.
- Update the individual use-case diagram caption to identify it as the Map Routing use-case diagram.
- Normalize actor wording in FR001 and its matching Tab 2 row while preserving the current access behavior.
- Preserve MDV001/MDV002 traceability in descriptions and requirements.

## Acceptance Criteria

- The use-case diagram has two separate actors, and both connect only to the base use case.
- `Optimize Stop Order` has only the dashed `«extend»` relationship to `Plan Multi-Stop Trip`.
- The system boundary is named Map Routing.
- Both activity diagrams visibly contain the three approved swimlanes.
- Diagram arrows do not overlap labels or nodes.
- Section A, B1, B2, B3, and Tab 2 use consistent module and actor terminology.
- Other report sections, image inventory, and tab topology remain unchanged.
