# Validation record

Date: 2026-10-18. Environment: macOS / Apple Silicon, Python 3.9.6, Node.js 26.7.0, npm 11.19.0. Dependency versions are pinned in `requirements.txt` and resolved in `frontend/package-lock.json`.

## Backend

```text
$ .venv/bin/python -m pytest -q
54 passed
```

Coverage is behavioral rather than UI-generated: the seeded 22-node / 45-candidate inventory; MST's exact 21 edges, connectivity and 21 bridges; both augmented topologies and **every individual edge removal**; deterministic augmentation; candidate-only selection; infeasibility; bridge vs nonbridge cuts; circle / polyline segment interiors; geographic hit lists; surviving-only reroutes; length / CAPEX / latency arithmetic; unreachable nulls; 231-edge theoretical mesh separation; common hazard inventory; restoration feasibility; baseline immutability; CRUD persistence; immutable IDs; required validation references; protected Ulaanbaatar; malformed requests and informative errors; validated endpoint relocation protection; exhaustive topology certificates.

The cost augmentation passes 29/29 removal checks. Default risk augmentation passes 28/28. MST passes 0/21. The theoretical mesh passes 231/231 graph checks, with no physical feasibility assertion.

## Frontend production build

```text
$ npm --prefix frontend run build
> tsc --noEmit && vite build
✓ built
```

Strict TypeScript checking includes unused bindings and parameters. Production output separates mapping, chart, motion, and application chunks. The compiled frontend is also served by Flask: `GET http://127.0.0.1:5001/` returned HTTP 200, and same-origin API responses included the correct exhaustive failure certificates.

## Browser integration

```text
$ npm --prefix frontend run test:e2e
7 passed
```

Chromium workflows:

1. Overview live metrics, geographic paths, MST / full-mesh switching, and no page runtime errors.
2. MST single-link failure produces two components and restoration proposals; reset returns the clean state.
3. Regional flood and shared-risk corridor failures produce real multi-link results.
4. Dijkstra before / after results, weighted optimization, JSON and CSV download initiation.
5. Node edits persist after page reload; the fixture restores the original value.
6. A 390 × 844 mobile viewport has no horizontal document overflow, usable navigation, rendered Leaflet map, and functional disaster simulation.

7. Default routes show 45/45 OSM source labels and curved map geometry; an edge-table route update succeeds using its cached road alignment.

Desktop tests use a 1440 × 1100 viewport. Screenshots and failure traces are written to ignored `frontend/test-results/`. The frontend also supports a bundled vector outline and explicitly labeled estimates when tiles are disabled. Browser visual inspection verified that standard OpenStreetMap tiles loaded as PNG responses without an API key. No external availability SLA is asserted.

The root `npm run dev` command was launched successfully and served Vite on 5173 plus Flask on 5001. The single-server built frontend was checked separately. No deployment to an external host was performed.

## Practical limits of these checks

The suite does not validate real-world Mongolian fiber corridors, engineering cost accuracy, physical hazard predictions, real equipment latency, production access control, multi-process data coordination, large-scale load, or an exact optimality bound. Those remain explicit model / deployment limitations, described in the technical documentation. The application is a functional academic digital twin with transparent estimated data, not an operator-certified network inventory.


## Road-route revision

The default road snapshot contains **45/45 successfully fetched OSM driving alignments**, with no straight-line replacement. All stored sampled points are inside the bundled coarse Mongolia display outline. Current modeled results: MST 4,753.70 km / $89,015,325; cost augmentation 8,206.50 km / $154,326,332.50; risk augmentation 8,191.49 km / $153,189,238.00. Those lengths are provider road distances, while costs and optical latency remain modeled.

Thirteen additional offline test cases verify coordinate order, provider distance rather than haversine, cache reuse and explicit refresh, no-route errors without fabrication, invalid distances/geometry/snap rejection, geometry simplification, atomic field replacement, no-mutation failures, protection of surveyed routes, stale endpoint rejection, and single-edge resilience on the actual stored road snapshot. The earlier coordinate-only tests remain stable by explicitly selecting the original baseline.

The revised seven-workflow browser suite also passed against the compiled, same-origin Flask app on port 5011 using an isolated test authoring file (`E2E_BASE_URL`), preserving normal local user data.
