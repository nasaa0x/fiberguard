# FiberGuard Mongolia

**Монголын шилэн кабелийн сүлжээний дижитал ихэр.** A functional academic planning and disaster simulation platform: Flask / NetworkX backend, React / TypeScript frontend, and a geographic network of the 21 provincial capitals plus Ulaanbaatar.

The interface defaults to Mongolian. All network metrics and simulation results come from the Python engine. No paid service, account, or API key is required.

## Run on macOS

Prerequisites: Python **3.9+**, Node.js **22.12+** (Node 24 LTS recommended), npm. Commands start in this repository:

```bash
cd /Users/nasaa_0x/Desktop/must/fiberguard
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix frontend ci
npm run dev
```

Open **http://127.0.0.1:5173**. API: **http://127.0.0.1:5001/api/health**. `Ctrl-C` stops both processes. Port 5001 avoids macOS AirPlay's common port-5000 conflict.

Alternatively use two terminals:

```bash
# Terminal 1, repository root
source .venv/bin/activate
python -m backend.app

# Terminal 2, repository root
npm --prefix frontend run dev
```

Configuration is optional. See [.env.example](.env.example) and [frontend/.env.example](frontend/.env.example). Backend variables must be exported in the shell (the backend does not automatically load `.env`). Vite loads `frontend/.env.local` when present. Default development traffic uses Vite's `/api` proxy.

## Single-server demonstration / WSGI

```bash
npm --prefix frontend run build
source .venv/bin/activate
python -m backend.app
# Open http://127.0.0.1:5001 — Flask serves the compiled frontend and API.
```

For a persistent local or managed single-process deployment:

```bash
.venv/bin/gunicorn --workers 1 --threads 4 --bind 127.0.0.1:5001 backend.app:app
```

The atomic JSON authoring store is designed for **one process**, with an in-process lock. Multiple WSGI workers or replicas require a shared transactional database. This is an academic application with no authentication or tenant authorization; bind it to localhost, or add authentication and a reverse proxy before exposing authoring endpoints publicly. HTTPS, monitoring, backups, and deployment-specific access controls are future deployment work.

## Demonstration walkthrough

1. **Ерөнхий төлөв / Overview**: inspect the computed metrics, map, and four topology cards.
2. Switch to **MST**, select a link using the map or the keyboard-accessible object selector, and choose **Кабель таслах** in the inspector. Observe disconnected cities and components.
3. Switch to **2-Edge Connected**, cut a link, and observe a surviving backup path. Select a failed link and choose **Холбоосыг сэргээх** to restore it.
4. Open **Гамшгийн симуляц**. Choose flood or earthquake; click the location control, then click the map. Adjust radius and severity and run the scenario. All intersecting modeled links fail together. Repeated simulations accumulate failures until reset.
5. Choose **Хамтын коридор / SRLG** and a group. Observe why a bridge-free graph can still become disconnected.
6. Open **Замын шинжилгээ** to compare Dijkstra routes, propagation delay, equipment delay, and modeled RTT before/after failure.
7. In **Топологи оновчлол**, adjust five weights, run optimization, and compare cost, redundancy, latency, and stress-suite outcomes. A risk-weighted heuristic is not guaranteed to outperform the cost heuristic on every metric.
8. In **Дэд бүтцийн өгөгдөл**, search, add, edit, or delete nodes and candidate edges. Change `Distance source` to `Validated route`, enter surveyed length and a validation reference to replace a length estimate.
9. In **Тайлан, экспорт**, download JSON or CSV, or print to PDF using the browser.

## What is implemented

- 22 named Mongolian / English geographic nodes and 45 explicitly listed **hypothetical planning corridors**.
- Kruskal cost MST; NetworkX bridge analysis; deterministic cost-aware and weighted risk-aware bridge-cover augmentation with reverse deletion.
- Explicit infeasibility when candidate infrastructure cannot support a connected / bridge-free topology.
- Exhaustive single-edge-removal certificate returned with each topology; 231-edge theoretical full mesh.
- Interactive Leaflet map, OpenStreetMap integration, bundled country outline, selectable nodes/edges, inspector, bridge highlighting, failed links, animated surviving routes, disaster circles, and natural pan/zoom.
- Single cuts, cumulative multiple cuts, regional flood, earthquake, and simultaneous SRLG failures.
- Dijkstra rerouting, unreachable destinations, connected components, root reachability, modeled latency changes, and a costed post-event restoration / construction plan.
- Transparent cost / terrain / regional exposure / corridor overlap / backup-link-length weighting.
- Identical deterministic hazard suite across feasible physical topologies, with measured survival percentages.
- Persistent node / edge CRUD with validation, immutable seeded baseline, per-tab explicit simulation state, structured API errors, loading / empty states, responsive Mongolian UI.
- JSON / CSV reporting and browser print / PDF. No server-side PDF renderer or historical multi-user simulation database.

## Road-following distances (default)

The default dataset now uses **45 actual OSM driving-route alignments**, stored in `data/network.roads.json`. Every physical candidate link uses OSRM's returned road kilometers and curved route geometry, rather than a straight city-to-city line or a detour multiplier. Routes were retrieved successfully for all 45 candidates; no missing route was replaced by a straight line.

The road-following route is **not proof of a fully asphalt/paved road**, a surveyed cable corridor, or permission to construct cable. OSRM selects its fastest car route; it is not a shortest-distance-only or paved-only solver. Full Mesh remains a clearly labeled theoretical direct-distance benchmark.

To retrieve/reuse the road snapshot:

```bash
.venv/bin/python -m scripts.fetch_roads
```

Add `--refresh` to explicitly bypass cached routes. The default fetches only uncached candidate routes, at most one request every 1.1 seconds. Run it once, then restart Flask. It writes `network.roads.json` separately from the original coordinate-estimate dataset. Individual route updates are available from the road icon on each edge in **Дэд бүтцийн өгөгдөл**, using `POST /api/network/edges/:id/road-route`. Provider failure returns an error and preserves the previous route; surveyed lengths are protected. The frontend and normal graph API use the bundled snapshot without needing a live routing server.

An existing `network.local.json` authoring override takes priority and is never silently overwritten. Individual road updates can upgrade its estimated edges. Deleting the override after stopping Flask returns to the bundled road snapshot.

## Computed default road snapshot

These are **fiber-planning model outputs using OSM road alignments**, not measurements of Mongolia's existing fiber infrastructure. Default risk weights: `cost=1`, `terrain=.65`, `exposure=.7`, `diversity=.8`, `latency=.35`.

| Topology | Links | Cable km | Estimated CAPEX USD | Bridges | Single-cut survival | Fixed hazard-suite survival | Max modeled RTT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cost MST | 21 | 4,753.70 | $89,015,325.00 | 21 | 0% | 18.92% | 34.697 ms |
| Cost augmentation | 29 | 8,206.50 | $154,326,332.50 | 0 | 100% | 78.38% | 26.916 ms |
| Risk augmentation | 28 | 8,191.49 | $153,189,238.00 | 0 | 100% | 75.68% | 27.335 ms |
| Theoretical full mesh | 231 | 152,410.99 | $2,667,192,342.50 | 0 | 100% | N/A | 18.345 ms |

The cost augmentation adds **72.63% modeled cable length** and **73.37% CAPEX** over MST. The risk heuristic trades metrics differently; it is not guaranteed globally optimal or superior under every tested hazard. These figures change when the dataset or optimization weights change.

## Data integrity and model limits

- City coordinates are approximate. Default paths follow OSM car routes, but none is an operator-verified fiber / surveyed construction corridor; road surface is not certified. `planned` / `operational` are authored model labels, not live telemetry.
- Default road-route distance is the OSRM driving-route distance, without a detour multiplier. For explicitly labeled coordinate estimates, route length is haversine distance multiplied by a terrain detour factor: steppe 1.15, mountain 1.28, Gobi 1.12. Deployment rates are modeled USD/km: 17,500 / 23,500 / 15,000 respectively.
- Road geometry comes from full OSRM road polylines, simplified using a declared 20 m projected tolerance; the scalar distance remains the full provider distance. Original coordinate-estimate paths remain synthetic and explicitly labeled. Neither is a surveyed fiber alignment.
- Validated lengths require `distance_source=validated_route`, `distance_km`, `cost_usd`, and `validation_reference`. Geometry provenance remains separate. Relocating a node with an incident validated route is rejected until that route is reclassified / revalidated.
- Length / CAPEX totals sum the logical cable links, including links that follow overlapping roads. They are not deduplicated trench kilometers and do not assume shared-construction savings or independent rights-of-way.
- Feasibility means feasibility **within the authored candidate graph**. Physical right-of-way, border, terrain engineering, and build permission have not been verified. Full mesh links never enter the candidate dataset.
- Regional impacts use the selected link's current road/estimate polyline and local equirectangular segment-to-circle intersection. They are binary stress tests, not hydrological or seismic forecasts. Severity multiplies the radius; it is not earthquake magnitude.
- Graph edge resilience differs from geographic / SRLG resilience. The default 37-case suite is 3 circles, 4 shared-risk groups, and 30 seeded candidate-link pairs. Identical hazards can affect zero, one, or multiple selected links. The suite percentage is not an empirical failure probability.
- Reachability is measured from Ulaanbaatar and includes the root. All nodes remain present during cable failures; equipment / city destruction is not modeled.
- Propagation speed is 200,000 km/s; equipment delay is separately modeled at 0.15 ms per link per direction. No congestion, serialization, queueing, access-network, or processing telemetry is included. The 50 ms check applies to maximum modeled RTT over **all node pairs**. Disconnected graphs return `null` maximum RTT and fail the threshold check.
- After-failure length / cost metrics describe the surviving subgraph; the top cable / CAPEX cards retain the original installed model totals. A cut is not represented as a CAPEX saving.
- Recovery recommendations reconnect contracted components using candidate edges sorted by full deployment CAPEX. Costs are **full replacement / construction proxies**, not repair quotes. Post-event field clearance and route validation are required. Proposals do not change connectivity automatically.
- The map uses keyless standard OSM tiles with visible attribution. External tiles and Google Fonts require internet; bundled geometry, local fonts fallback, nodes, links, and calculations remain available when those services are unavailable. Turn off the basemap to use the local outline. No tile prefetch or offline tile download is implemented.

## Tests and build

```bash
.venv/bin/python -m pytest -q
npm --prefix frontend run build

# Optional real-browser suite; automatically launches servers if ports are free
cd frontend
npx playwright install chromium
npm run test:e2e
```

Verified in the supplied macOS environment (Python 3.9.6, Node 26.7.0): **54 backend tests passed; 7 Chromium browser tests passed; strict TypeScript check and Vite production build passed**. Browser coverage includes desktop / mobile, real map rendering, topology switching, cuts, regional impacts, SRLG, reset, routes, weighted optimization, data persistence, and report downloads. See [validation record](docs/VALIDATION.md).

## Repository

```text
backend/
  app.py                    Flask / WSGI entry point, serves built frontend
  fiberguard/
    api.py                  Validated REST endpoints, topology cache
    repository.py           Atomic authoring store, baseline isolation
    engine.py               MST, augmentation, routes, metrics, recovery
    geo.py                  Haversine and disaster intersection geometry
    roads.py                OSRM routing, validation, caching, simplification
data/
  network.json              Original coordinate-estimate baseline
  network.roads.json        Default 22-node / 45-road-route snapshot
  generate.py               Reproducible coordinate-estimate generator
frontend/
  src/                      Typed React views, API client, map, CSS
  e2e/                      Chromium integration tests
  public/mongolia.geojson    Local geographic outline
scripts/dev.py              Combined macOS development launcher
scripts/fetch_roads.py      Cached, rate-limited OSRM snapshot updater
tests/                      Pytest engine and REST integration coverage
docs/                       Technical methodology, API reference, validation
```

Authoring creates `data/network.local.json` (ignored by Git); it does not modify `data/network.json`. Stop the backend and remove the local override to return to the bundled road snapshot. Restart afterward. `POST /reset` resets simulation state only, never authored infrastructure. Simulations and custom weights are tab-local and are reset by refresh / topology switch. An infrastructure mutation invalidates cached topology results.

## Architecture and API

The browser sends explicit topology, weights, and failed edge IDs. The server creates a fresh graph, removes failures from a copy, calculates outcomes, and returns JSON. There is no global shared failure state. The in-memory cache holds baseline topology responses only and is keyed by authoring revision.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health, revision, state model |
| GET / POST | `/api/network/nodes` | List / create geographic nodes |
| PATCH / PUT / DELETE | `/api/network/nodes/:id` | Edit / delete node (incident routes cascade; Ulaanbaatar protected) |
| GET / POST | `/api/network/edges` | List / create candidate routes |
| PATCH / PUT / DELETE | `/api/network/edges/:id` | Edit / delete candidate route |
| POST | `/api/network/edges/:id/road-route` | Fetch/cached OSM driving distance + geometry atomically |
| GET | `/api/network/topologies` | Four calculated topologies, metrics, exhaustive failure certificate |
| GET | `/api/network/statistics` | Comparison metrics |
| GET | `/api/network/bridges?topology=mst` | Critical edge IDs |
| GET | `/api/network/analysis?topology=optimized` | Initial simulation analysis |
| POST | `/api/network/optimize` | Deterministic weighted augmentation |
| POST | `/api/network/simulate-cut` | Add an individual failure to explicit failed IDs |
| POST | `/api/network/simulate-disaster` | Circle / SRLG failures plus explicit prior failures |
| POST | `/api/network/shortest-path` | Before / after route and separated latency estimates |
| POST | `/api/network/reset` | Return clean simulation analysis |

See [API examples](docs/API.md) and [academic technical documentation](docs/TECHNICAL.md).

## Sources and future work

Algorithm implementations use the official [NetworkX MST](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.tree.mst.minimum_spanning_tree.html) and [bridges](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.bridges.bridges.html) APIs. Driving routes: [OSRM API](https://project-osrm.org/docs/v26.4.0/http), [FOSSGIS road service and usage policy](https://routing.openstreetmap.de/about.html). OSM-derived road geometry is attributed to OpenStreetMap contributors under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Geographic outline: [world.geo.json / MNG](https://github.com/johan/world.geo.json/blob/master/countries/MNG.geo.json), a coarse Natural Earth-derived display boundary; it is not a cadastral or engineering boundary. Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); respect the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Fonts: Google Fonts, with system fallback.

Future improvements: validated operator / road / railway geometry, surveyed costs, ILP augmentation with optimality bounds, hazard rasters and geodesic buffers, capacity / traffic flow and node-failure models, demand-weighted availability, separate repair-cost / restoration-time models, PostGIS persistence, authentication, and a persistent simulation audit trail.
# fiberguard
