"""Atomic local authoring store. The seeded baseline JSON is immutable."""

from copy import deepcopy
import json
import math
import os
from pathlib import Path
import re
import threading
from .geo import haversine

BASELINE = Path(__file__).resolve().parents[2] / "data" / "network.json"
ROAD_BASELINE = BASELINE.with_name("network.roads.json")


class Repository:
    def __init__(self, path=None, baseline_path=None):
        self.path = Path(path) if path else BASELINE.with_name("network.local.json")
        self.lock = threading.RLock()
        self.revision = 0
        baseline = (
            Path(baseline_path)
            if baseline_path
            else (ROAD_BASELINE if ROAD_BASELINE.exists() else BASELINE)
        )
        self.data = json.loads(
            (self.path if self.path.exists() else baseline).read_text()
        )

    def snapshot(self):
        with self.lock:
            return deepcopy(self.data)

    def mutate(self, kind, operation, item_id=None, payload=None):
        with self.lock:
            data = deepcopy(self.data)
            records = data[kind]
            existing = next((n for n in records if n["id"] == item_id), None)
            if operation != "create" and existing is None:
                raise LookupError("Record not found.")
            if operation == "delete":
                if kind == "nodes" and item_id == "ub":
                    raise ValueError("Ulaanbaatar is the required reference node.")
                records.remove(existing)
                if kind == "nodes":
                    data["edges"] = [
                        e
                        for e in data["edges"]
                        if item_id not in (e["source"], e["target"])
                    ]
            else:
                if not isinstance(payload, dict):
                    raise ValueError("Expected a JSON object.")
                item = {**(existing or {}), **payload}
                if operation == "update" and item.get("id") != item_id:
                    raise ValueError("Record IDs are immutable.")
                if not isinstance(item.get("id"), str) or not re.fullmatch(
                    r"[a-zA-Z0-9_-]{1,64}", item["id"]
                ):
                    raise ValueError(
                        "ID must contain 1–64 letters, numbers, underscores or hyphens."
                    )
                if operation == "create" and any(
                    n["id"] == item["id"] for n in records
                ):
                    raise ValueError("ID already exists.")
                if kind == "nodes":
                    self.validate_node(item)
                else:
                    if item.get("distance_source") == "osm_road_route":
                        if (
                            not existing
                            or existing.get("distance_source") != "osm_road_route"
                        ):
                            raise ValueError(
                                "Use the road-route API to obtain an OSM driving alignment."
                            )
                        for key in (
                            "source",
                            "target",
                            "distance_km",
                            "geometry",
                            "route_source",
                            "routing",
                        ):
                            if item.get(key) != existing.get(key):
                                raise ValueError(
                                    "Road geometry, endpoints and distance must be updated together through the road-route API."
                                )
                    self.validate_edge(item, data, existing, payload)
                if existing:
                    records.remove(existing)
                records.append(item)
                if (
                    kind == "nodes"
                    and existing
                    and (item["lat"], item["lon"]) != (existing["lat"], existing["lon"])
                ):
                    for edge in data["edges"]:
                        if item_id in (edge["source"], edge["target"]):
                            if edge["distance_source"] in (
                                "validated_route",
                                "osm_road_route",
                            ):
                                raise ValueError(
                                    "This node has a road-following or validated incident route. Reclassify it as estimated before moving the node, then fetch a new road route or revalidate its geometry and length."
                                )
                            edge["geometry"][0 if edge["source"] == item_id else -1] = [
                                item["lat"],
                                item["lon"],
                            ]
                            if edge["distance_source"] != "validated_route":
                                self.estimate_edge(edge, data)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            os.replace(temporary, self.path)
            self.data = data
            self.revision += 1
            return deepcopy(item) if operation != "delete" else dict(deleted=item_id)

    def apply_road_route(self, edge_id, source_before, target_before, route):
        from .roads import road_edge

        with self.lock:
            data = deepcopy(self.data)
            edge = next((e for e in data["edges"] if e["id"] == edge_id), None)
            if edge is None:
                raise LookupError("Record not found.")
            nodes = {n["id"]: n for n in data["nodes"]}
            signature = lambda n: (n["id"], n["lat"], n["lon"])
            if (
                edge["source"] != source_before["id"]
                or edge["target"] != target_before["id"]
                or signature(nodes[edge["source"]]) != signature(source_before)
                or signature(nodes[edge["target"]]) != signature(target_before)
            ):
                raise ValueError(
                    "Route endpoints changed while fetching. Please fetch again."
                )
            if edge["distance_source"] == "validated_route":
                raise ValueError(
                    "A surveyed route is protected. Reclassify it before replacing it with an OSM route."
                )
            item = road_edge(edge, route)
            self.validate_edge(item, data, edge, item)
            data["edges"] = [item if e["id"] == edge_id else e for e in data["edges"]]
            data["metadata"]["road_route_count"] = sum(
                e["distance_source"] == "osm_road_route" for e in data["edges"]
            )
            temporary = self.path.with_suffix(".tmp")
            temporary.parent.mkdir(parents=True, exist_ok=True)
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            os.replace(temporary, self.path)
            self.data = data
            self.revision += 1
            return deepcopy(item)

    @staticmethod
    def number(value, name, low, high):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not low <= value <= high
        ):
            raise ValueError(f"{name} must be a finite number in [{low}, {high}].")

    @staticmethod
    def text(item, fields):
        for field in fields:
            if (
                not isinstance(item.get(field), str)
                or not item[field].strip()
                or len(item[field]) > 250
            ):
                raise ValueError(
                    f"{field} must be a nonempty string (max 250 characters)."
                )

    def validate_node(self, n):
        self.text(n, ["name_mn", "name_en", "province", "node_type"])
        self.number(n.get("lat"), "latitude", -85, 85)
        self.number(n.get("lon"), "longitude", -180, 180)
        if n["node_type"] not in ("core", "regional"):
            raise ValueError("node_type must be core or regional.")
        self.number(n.get("traffic_demand_mbps", 0), "traffic demand", 0, 1e9)

    def estimate_edge(self, e, data):
        lookup = {n["id"]: n for n in data["nodes"]}
        a, b = lookup[e["source"]], lookup[e["target"]]
        e["distance_km"] = round(
            haversine([a["lat"], a["lon"]], [b["lat"], b["lon"]])
            * {"mountain": 1.28, "gobi": 1.12, "steppe": 1.15}[e["terrain"]],
            3,
        )
        e["cost_usd"] = round(
            e["distance_km"]
            * {"mountain": 23500, "gobi": 15000, "steppe": 17500}[e["terrain"]],
            2,
        )
        e["latency_ms"] = round(e["distance_km"] / 200, 6)

    def validate_edge(self, e, data, existing, payload):
        self.text(e, ["source", "target", "terrain", "corridor_id"])
        nodes = {n["id"]: n for n in data["nodes"]}
        if e["source"] not in nodes or e["target"] not in nodes:
            raise ValueError("Both endpoints must be existing nodes.")
        if e["source"] == e["target"]:
            raise ValueError("Self loops are not allowed.")
        if any(
            x["id"] != e["id"]
            and {x["source"], x["target"]} == {e["source"], e["target"]}
            for x in data["edges"]
        ):
            raise ValueError(
                "A corridor already exists between these endpoints (simple graph model)."
            )
        if e["terrain"] not in ("mountain", "gobi", "steppe"):
            raise ValueError("Unknown terrain.")
        e.setdefault("status", "planned")
        if e["status"] not in ("planned", "operational"):
            raise ValueError(
                "Status must be planned or operational; failures belong to simulations."
            )
        e.setdefault("risk_score", 0.3)
        e.setdefault("disaster_exposure", 0.4)
        self.number(e["risk_score"], "risk score", 0, 1)
        self.number(e["disaster_exposure"], "disaster exposure", 0, 1)
        e.setdefault("distance_source", "estimated_haversine_detour")
        if e["distance_source"] not in (
            "estimated_haversine_detour",
            "validated_route",
            "osm_road_route",
        ):
            raise ValueError("Invalid distance_source.")
        if e["distance_source"] == "validated_route":
            self.text(e, ["validation_reference"])
            self.number(e.get("distance_km"), "validated distance", 0.001, 100000)
            self.number(e.get("cost_usd"), "estimated deployment cost", 0.01, 1e12)
        elif e["distance_source"] == "osm_road_route":
            if (
                not isinstance(e.get("routing"), dict)
                or e.get("route_source") != "OSRM / OpenStreetMap driving route"
            ):
                raise ValueError(
                    "Road routes must be fetched through the road-route API."
                )
            self.number(e.get("distance_km"), "road distance", 0.001, 100000)
            e["cost_usd"] = round(
                e["distance_km"]
                * {"mountain": 23500, "gobi": 15000, "steppe": 17500}[e["terrain"]],
                2,
            )
        else:
            self.estimate_edge(e, data)
            e.pop("routing", None)
            if existing and existing.get("distance_source") == "osm_road_route":
                e["geometry"] = [
                    [nodes[n]["lat"], nodes[n]["lon"]]
                    for n in (e["source"], e["target"])
                ]
                e["route_source"] = "synthetic_planning_polyline"
        e["latency_ms"] = round(e["distance_km"] / 200, 6)
        e["theoretical"] = False
        if not existing or any(k in payload for k in ("source", "target")):
            if "geometry" not in payload:
                e["geometry"] = [
                    [nodes[n]["lat"], nodes[n]["lon"]]
                    for n in (e["source"], e["target"])
                ]
        geometry = e.get("geometry")
        if not isinstance(geometry, list) or not 2 <= len(geometry) <= 10000:
            raise ValueError("Geometry needs 2–10,000 [lat,lon] points.")
        for p in geometry:
            if not isinstance(p, list) or len(p) != 2:
                raise ValueError("Geometry points must be [lat,lon].")
            self.number(p[0], "geometry latitude", -85, 85)
            self.number(p[1], "geometry longitude", -180, 180)
        for point, node_id in ((geometry[0], e["source"]), (geometry[-1], e["target"])):
            n = nodes[node_id]
            if haversine(point, [n["lat"], n["lon"]]) > 1:
                raise ValueError(
                    "Geometry endpoints must be within 1 km of their nodes."
                )
        e.setdefault("route_source", "synthetic_planning_polyline")
        group = e.get("shared_risk_group")
        if group is not None and (not isinstance(group, str) or len(group) > 100):
            raise ValueError("Invalid shared risk group.")
