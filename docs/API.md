# REST API reference

Base URL: `http://127.0.0.1:5001/api`. JSON bodies must be objects and use `Content-Type: application/json`. Responses use kilometers, USD, and milliseconds. Map coordinates and request centers use **[latitude, longitude]**.

## State contract

The baseline is immutable. CRUD persists a separate local authoring dataset. Simulations are stateless: send previous `failed_edges` and any custom risk `weights` on every subsequent request. Omitting them evaluates an otherwise clean default topology. The API does not store browser sessions or globally shared failures.

Topology names: `mst`, `optimized`, `risk`, `mesh`. Default: `optimized`. The mesh is theoretical; its links are not physical candidates.

## Read endpoints

- `GET /health` → `{status, service, version, simulation_state, revision}`.
- `GET /network/nodes` → `{nodes: [...]}`.
- `GET /network/edges` → `{edges: [...], metadata: {...}}` (candidate infrastructure only).
- `GET /network/topologies` → `{topologies: {mst, optimized, risk, mesh}, metadata, revision}`.
- `GET /network/statistics` → topology-to-metrics mapping.
- `GET /network/bridges?topology=mst` → `{bridges: [edge IDs], metrics}`.
- `GET /network/analysis?topology=optimized` → clean simulation analysis.

A topology includes nodes, edges, metrics, algorithm description, heuristic / theoretical flags, and `verification: {checked_edges, passed_edges, failed_edge_ids, all_survived}`. A topology that cannot be built returns `{id, infeasible: true, message}` in the topology listing. Explicit requests for infeasible topologies return HTTP 422.

Metrics include node / edge counts, cable length, CAPEX, bridges, components, connectivity, fault tolerance, single-edge survival, fixed-suite survival, all-pairs maximum modeled RTT, reachable-pair maximum RTT, the 50ms check, SRLG/corridor group count, and relative cable / CAPEX increase over MST.

## Optimization

`POST /network/optimize`

```json
{
  "mode": "risk",
  "weights": {"cost": 1, "terrain": 0.65, "exposure": 0.7, "diversity": 0.8, "latency": 0.35}
}
```

Mode must be `risk` or `optimized`. Weights are finite numbers in [0,5]; at least one must be positive. Returns `{topology, weights, explanation}`. The objective is a deterministic heuristic; there is no global optimum claim.

## Cut and cumulative failures

`POST /network/simulate-cut`

```json
{
  "topology": "optimized",
  "edge_id": "fg-001",
  "failed_edges": [],
  "source": "ub",
  "target": "olgii"
}
```

Source defaults to `ub`. The clicked edge is added to the supplied failures. All IDs must belong to the selected topology. Supplying a target is optional; for cuts the API chooses an edge endpoint when omitted. A surviving alternate path may legitimately be identical if the cut did not affect the chosen shortest-distance route.

## Disaster impacts

`POST /network/simulate-disaster`

```json
{
  "topology": "optimized",
  "scenario": "flood",
  "center": [47.918, 106.917],
  "radius_km": 100,
  "severity": 1.25,
  "failed_edges": []
}
```

`scenario` is `flood` or `earthquake`. Radius: 1–1500 km. Severity: 0.25–2, multiplying radius. Every selected route whose modeled polyline intersects the resulting circle fails. Returns `zone`, `new_failed_edges`, and the full simulation response. All failures are deterministic and binary.

SRLG variant:

```json
{
  "topology": "optimized",
  "scenario": "srlg",
  "shared_risk_group": "central-trunk",
  "failed_edges": []
}
```

This removes every selected link belonging to that nonempty group; the group must be present in the topology. `zone` is null.

## Simulation response

```text
failed_edges                 union of explicitly failed and newly impacted IDs
components                   arrays of node IDs
reference_node               source (ub by default)
reachable_nodes              reference component
availability_pct             reference-reachable nodes / all nodes × 100
affected_nodes               nodes unreachable from reference
before_metrics / after_metrics
rerouted_paths               destination + before/after route for every changed path
route_target                 chosen illustrative destination
before_route / after_route
latency_delta_ms              null if either route is unreachable
recovery                     recommendations, full-CAPEX proxy, feasibility, planning phase
```

Each route returns `reachable`, `nodes`, `edges`, `distance_km`, `propagation_one_way_ms`, `propagation_rtt_ms`, `equipment_one_way_ms`, and `modeled_rtt_ms`. Unreachable route values are null with empty path arrays.

Recovery proposals reference only authored candidate infrastructure. The plan is post-event planning, requires field validation, and does not automatically restore connectivity.

## Shortest paths

`POST /network/shortest-path`

```json
{"topology":"optimized","source":"ub","target":"olgii","failed_edges":["fg-001"]}
```

Returns `{before, after, latency_delta_ms}`. Dijkstra minimizes cable distance; equipment delay is added separately afterward. Send `weights` when querying a custom risk topology.

## Reset

`POST /network/reset`

```json
{"topology":"optimized"}
```

Returns clean simulation analysis with no failed edges. Does not alter nodes, authored corridors, local override, or other clients. Clients must clear their local failure list.

To restore only one failure, remove that ID from your explicit failure set and recalculate a route or simulation. The UI performs this automatically through the cut endpoint with the remaining failure IDs; if no failures remain it clears the local simulation state.

## Node CRUD

`POST /network/nodes` returns 201:

```json
{
  "id":"planning-site",
  "name_mn":"Төлөвлөлтийн цэг",
  "name_en":"Planning site",
  "province":"Төв",
  "lat":47.5,
  "lon":106.5,
  "node_type":"regional",
  "traffic_demand_mbps":500
}
```

`PATCH /network/nodes/:id` and `PUT` merge validated fields. IDs are immutable. Latitude must be finite in [-85,85], longitude [-180,180]; node type `core` or `regional`. Nonempty names / province are required. IDs contain 1–64 letters, numbers, underscores, or hyphens.

`DELETE /network/nodes/:id` cascades to incident edges. The `ub` reference node is protected. New disconnected nodes make physical topology construction explicitly infeasible until adequate corridors are authored; mesh remains an editable-data fallback.

## Candidate route CRUD

`POST /network/edges` returns 201:

```json
{
  "id":"plan-new",
  "source":"ub",
  "target":"altai",
  "terrain":"steppe",
  "risk_score":0.3,
  "disaster_exposure":0.4,
  "corridor_id":"PLAN-NEW",
  "shared_risk_group":"planning-study",
  "status":"planned"
}
```

The server calculates estimated distance, deployment cost, propagation delay, and synthetic endpoint geometry if omitted. Terrain: `steppe`, `mountain`, `gobi`; scores in [0,1]. Status: `planned` or `operational`. Both remain modeled eligible candidate infrastructure; failures belong in simulation requests.

`PATCH /network/edges/:id`, `PUT`, and `DELETE` are supported. Self-loops and duplicate endpoint pairs are rejected (simple undirected graph). The API never inserts full-mesh links into the physical candidate store.

Validated scalar route length:

```json
{
  "distance_source":"validated_route",
  "distance_km":1234.5,
  "cost_usd":20000000,
  "validation_reference":"Survey identifier / publication / operator reference"
}
```

Supply actual evidence for real use. Geometry is independently authored as 2–10,000 `[lat,lon]` points, with endpoints within 1 km of their nodes. `route_source` records provenance. A validated scalar length does not implicitly validate the synthetic geometry. Moving a node with an incident validated route requires reclassification / revalidation.

## Errors

```json
{"error":{"code":"validation_error","message":"Select an existing edge in the current topology."}}
```

- 400: invalid inputs or malformed JSON.
- 404: unknown record or endpoint.
- 413: request larger than 2 MB.
- 422: infeasible connected / 2-edge topology.
- 500: generic public message, detailed error logged server-side.

No authentication is included in this academic local application. CORS permits default local Vite origins; configure `CORS_ORIGINS` for a managed deployment. Authoring persistence currently requires one server process.

## curl example

```bash
curl http://127.0.0.1:5001/api/health
curl http://127.0.0.1:5001/api/network/statistics
curl -X POST http://127.0.0.1:5001/api/network/simulate-disaster \
  -H 'Content-Type: application/json' \
  -d '{"topology":"optimized","scenario":"earthquake","center":[47.918,106.917],"radius_km":100,"severity":1,"failed_edges":[]}'
```


## OSM road-following routes

The default data source is `data/network.roads.json` (45 fetched car alignments). The original estimate dataset remains `network.json`. Authoring overrides take priority. Road routes use `distance_source=osm_road_route`; Full Mesh remains `haversine_direct`.

`POST /network/edges/:id/road-route`

```json
{"refresh": false}
```

Retrieves the OSRM driving route between current node coordinates and atomically replaces the edge's distance, geometry, propagation delay and modeled CAPEX. Default requests reuse coordinate/profile/server-specific disk cache. `refresh=true` explicitly requests a new provider result. The server throttles provider requests to a minimum 1.1-second interval; errors return HTTP 502 `road_routing_unavailable` with no mutation and **no straight-line fallback**. Missing edges return 404; surveyed routes are protected; changed endpoints during fetch reject stale results.

The request uses `overview=full`, `geometries=geojson` and endpoint snap limits of 1000 m. Provider longitude/latitude pairs are converted to application latitude/longitude. Geometry is simplified with a declared 20 m projected tolerance; full returned road distance is retained, without a detour multiplier. CAPEX = returned road kilometers × the existing modeled terrain rate. Fiber propagation still uses 200,000 km/s, **not car travel duration**.

The `routing` metadata records provider, profile, server, request URL, fetch timestamp, data version if supplied, driving duration, full geometry point count, simplification tolerance, endpoint snap distances, and false `surface_verified` / `fiber_route_verified` flags. Driving duration is provenance only and never substitutes for optical latency. A driving route does not prove asphalt-only surface, an installed cable, engineering feasibility or right-of-way.

Normal CRUD may edit terrain / risk / status on a road edge but cannot alter its externally sourced geometry, distance or endpoints independently. Reclassify to an estimate or use the route endpoint to obtain consistent replacement data. Moving a node with incident road routes is blocked pending reclassification / rerouting. Existing `validated_route` lengths remain separately editable with evidence.

Set optional `OSRM_BASE_URL` to a compatible self-hosted car-routing server. The public default is FOSSGIS's `https://routing.openstreetmap.de/routed-car`; see https://routing.openstreetmap.de/about.html. The Python HTTPS client uses certificate-verified curl as a transport fallback for Apple's old bundled LibreSSL; TLS verification is never disabled. Normal graph analysis uses the bundled snapshot and does not call this provider.
