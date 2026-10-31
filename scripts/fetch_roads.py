"""Fetch the 45 authored candidate driving alignments once; reuse disk cache.

Run from root: .venv/bin/python -m scripts.fetch_roads
At most one new request every 1.1 seconds. Never replaces a missing road with
an estimate. Seed estimates remain in network.json; derived snapshot separate.
"""

import argparse
import json
from pathlib import Path
from datetime import datetime, timezone
from backend.fiberguard.roads import RoadRouter, RoadRoutingError, road_edge

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Explicitly bypass cached provider routes",
    )
    args = parser.parse_args()
    baseline = json.loads((ROOT / "data/network.json").read_text())
    nodes = {n["id"]: n for n in baseline["nodes"]}
    router = RoadRouter()
    edges = []
    unavailable = []
    for i, e in enumerate(baseline["edges"], 1):
        try:
            route = router.route(
                nodes[e["source"]], nodes[e["target"]], refresh=args.refresh
            )
            edges.append(road_edge(e, route))
            print(
                f"{i:02d}/{len(baseline['edges'])} {e['id']} {e['source']} → {e['target']}: {route['distance_km']:.1f} km, {len(route['geometry'])} map points",
                flush=True,
            )
        except RoadRoutingError as exc:
            unavailable.append(
                dict(
                    edge_id=e["id"],
                    source=e["source"],
                    target=e["target"],
                    reason=str(exc),
                )
            )
            print(
                f"{i:02d}/{len(baseline['edges'])} {e['id']}: UNAVAILABLE — {exc}",
                flush=True,
            )
    if not edges:
        raise SystemExit("No road routes retrieved; existing snapshot unchanged.")
    metadata = dict(
        baseline["metadata"],
        version=2,
        dataset="osm-road-snapshot",
        generated_at=datetime.now(timezone.utc).isoformat(),
        description="OSM road-following driving alignments for academic fiber planning. Not surveyed fiber corridors; paved surface and build rights unverified.",
        distance_method="OSRM fastest driving route distance (meters / 1000), without terrain detour multiplier.",
        capex_method="OSRM road kilometers × modeled USD/km terrain rate; not a cable construction quote.",
        routing_provider="OSRM / OpenStreetMap",
        attribution="© OpenStreetMap contributors",
        license="https://opendatacommons.org/licenses/odbl/1-0/",
        source_url="https://www.openstreetmap.org/copyright",
        road_route_count=len(edges),
        unavailable_routes=unavailable,
        verified_routes=False,
        surface_verified=False,
    )
    target = ROOT / "data/network.roads.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(
            dict(metadata=metadata, nodes=baseline["nodes"], edges=edges),
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    temporary.replace(target)
    print(
        f"Saved {len(edges)} road routes; {len(unavailable)} unavailable. Seed estimates unchanged.",
        flush=True,
    )


if __name__ == "__main__":
    main()
