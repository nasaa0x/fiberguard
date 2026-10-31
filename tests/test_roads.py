"""Offline fixtures test provider semantics; stored snapshot tests real alignments."""

from copy import deepcopy
import json
import math
from pathlib import Path
import networkx as nx
import pytest
from backend.fiberguard.api import create_app
from backend.fiberguard import engine
from backend.fiberguard.geo import haversine
from backend.fiberguard.repository import Repository, BASELINE, ROAD_BASELINE
from backend.fiberguard.roads import (
    RoadRouter,
    RoadRoutingError,
    road_edge,
    simplify_geometry,
)

SOURCE = dict(id="ub", lat=47.918, lon=106.917)
TARGET = dict(id="zuunmod", lat=47.706, lon=106.952)


def response():
    return dict(
        code="Ok",
        data_version="offline-fixture",
        routes=[
            dict(
                distance=43000.0,
                duration=3600.0,
                geometry=dict(
                    type="LineString",
                    coordinates=[
                        [106.917, 47.918],
                        [106.97, 47.85],
                        [107.0, 47.77],
                        [106.952, 47.706],
                    ],
                ),
            )
        ],
    )


def make_app(tmp_path, fetcher):
    router = RoadRouter(tmp_path / "cache", fetcher=fetcher, min_interval=0)
    return create_app(
        dict(
            TESTING=True,
            DATA_PATH=tmp_path / "local.json",
            BASELINE_PATH=BASELINE,
            ROAD_ROUTER=router,
        )
    )


def test_road_distance_geometry_and_provenance_not_haversine(tmp_path):
    urls = []

    def fetch(url):
        urls.append(url)
        return response()

    router = RoadRouter(tmp_path, fetcher=fetch, min_interval=0)
    route = router.route(SOURCE, TARGET)
    assert route["distance_km"] == 43
    assert route["geometry"][0] == [SOURCE["lat"], SOURCE["lon"]]
    assert route["geometry"][-1] == [TARGET["lat"], TARGET["lon"]]
    assert len(route["geometry"]) >= 3
    assert route["routing"]["surface_verified"] is False
    assert route["routing"]["fiber_route_verified"] is False
    assert route["distance_source"] == "osm_road_route"
    assert route["distance_km"] != pytest.approx(
        haversine(route["geometry"][0], route["geometry"][-1]) * 1.15
    )
    assert "106.917000,47.918000;106.952000,47.706000" in urls[0]
    assert "overview=full" in urls[0] and "geometries=geojson" in urls[0]


def test_road_cache_survives_new_router_and_refresh_is_explicit(tmp_path):
    calls = []

    def fetch(url):
        calls.append(url)
        return response()

    first = RoadRouter(tmp_path, fetcher=fetch, min_interval=0).route(SOURCE, TARGET)
    router = RoadRouter(tmp_path, fetcher=fetch, min_interval=0)
    assert router.route(SOURCE, TARGET) == first
    assert len(calls) == 1
    router.route(SOURCE, TARGET, refresh=True)
    assert len(calls) == 2
    moved = {**SOURCE, "lat": 47.919}
    router.route(moved, TARGET)
    assert len(calls) == 3


def test_no_road_does_not_fabricate_a_straight_route(tmp_path):
    router = RoadRouter(
        tmp_path, fetcher=lambda u: dict(code="NoRoute"), min_interval=0
    )
    with pytest.raises(RoadRoutingError, match="NoRoute"):
        router.route(SOURCE, TARGET)
    assert not list(tmp_path.glob("*.json"))


@pytest.mark.parametrize("bad", ["distance", "geometry", "snap", "type"])
def test_invalid_external_route_rejected(tmp_path, bad):
    data = response()
    r = data["routes"][0]
    if bad == "distance":
        r["distance"] = float("nan")
    if bad == "geometry":
        r["geometry"]["coordinates"] = [[106, 47]]
    if bad == "snap":
        r["geometry"]["coordinates"][0] = [90, 40]
    if bad == "type":
        r["geometry"]["type"] = "Polygon"
    with pytest.raises(RoadRoutingError):
        RoadRouter(tmp_path, fetcher=lambda u: data, min_interval=0).route(
            SOURCE, TARGET
        )


def test_geometry_simplification_retains_endpoints_and_bends():
    points = [[0, 0], [0, 0.001], [0, 0.002], [0.001, 0.003], [0, 0.004]]
    simplified = simplify_geometry(points, 20)
    assert simplified[0] == points[0] and simplified[-1] == points[-1]
    assert points[3] in simplified
    assert len(simplified) < len(points)


def test_road_api_updates_all_related_fields_atomically(tmp_path):
    app = make_app(tmp_path, lambda u: response())
    client = app.test_client()
    original = client.get("/api/network/edges").json["edges"]
    result = client.post("/api/network/edges/fg-031/road-route", json={})
    assert result.status_code == 200, result.json
    edge = result.json["edge"]
    assert edge["distance_km"] == 43 and edge["cost_usd"] == 43 * 17500
    assert edge["latency_ms"] == pytest.approx(43 / 200)
    assert edge["distance_source"] == "osm_road_route"
    assert (
        client.patch("/api/network/edges/fg-031", json={"risk_score": 0.8}).status_code
        == 200
    )
    saved = next(
        e for e in client.get("/api/network/edges").json["edges"] if e["id"] == "fg-031"
    )
    assert saved["distance_km"] == 43 and saved["geometry"] == edge["geometry"]
    assert (
        client.patch("/api/network/edges/fg-031", json={"distance_km": 5}).status_code
        == 400
    )
    assert (
        client.patch(
            "/api/network/edges/fg-031",
            json={"geometry": [[47.918, 106.917], [47.706, 106.952]]},
        ).status_code
        == 400
    )
    assert (
        client.patch("/api/network/nodes/ub", json={"lat": 47.919}).status_code == 400
    )
    assert len(original) == 45
    assert json.loads(BASELINE.read_text())["edges"] == original


def test_failed_road_request_preserves_authored_infrastructure(tmp_path):
    app = make_app(tmp_path, lambda u: dict(code="NoRoute"))
    client = app.test_client()
    before = client.get("/api/network/edges").json
    result = client.post("/api/network/edges/fg-031/road-route", json={})
    assert result.status_code == 502
    assert result.json["error"]["code"] == "road_routing_unavailable"
    assert "NoRoute" in result.json["error"]["message"]
    assert client.get("/api/network/edges").json == before


def test_surveyed_route_protected_and_refresh_validation(tmp_path):
    client = make_app(tmp_path, lambda u: response()).test_client()
    assert (
        client.patch(
            "/api/network/edges/fg-031",
            json=dict(
                distance_source="validated_route",
                distance_km=50,
                cost_usd=1000000,
                validation_reference="test fixture",
            ),
        ).status_code
        == 200
    )
    assert (
        client.post("/api/network/edges/fg-031/road-route", json={}).status_code == 400
    )
    assert (
        client.post("/api/network/edges/missing/road-route", json={}).status_code == 404
    )
    assert (
        client.post(
            "/api/network/edges/fg-001/road-route", json={"refresh": "false"}
        ).status_code
        == 400
    )


def test_stale_endpoint_route_is_not_applied(tmp_path):
    repo = Repository(tmp_path / "local.json", baseline_path=BASELINE)
    doc = repo.snapshot()
    nodes = {n["id"]: n for n in doc["nodes"]}
    road = RoadRouter(
        tmp_path / "cache", fetcher=lambda u: response(), min_interval=0
    ).route(nodes["ub"], nodes["zuunmod"])
    repo.mutate("nodes", "update", "ub", {"lat": 47.919})
    with pytest.raises(ValueError, match="endpoints changed"):
        repo.apply_road_route("fg-031", nodes["ub"], nodes["zuunmod"], road)
    assert (
        next(e for e in repo.snapshot()["edges"] if e["id"] == "fg-031")[
            "distance_source"
        ]
        == "estimated_haversine_detour"
    )


def test_bundled_road_snapshot_is_default_and_all_single_cuts_survive(tmp_path):
    doc = json.loads(ROAD_BASELINE.read_text())
    assert len(doc["nodes"]) == 22 and len(doc["edges"]) == 45
    assert all(
        e["distance_source"] == "osm_road_route" and len(e["geometry"]) > 2
        for e in doc["edges"]
    )
    assert (
        Repository(tmp_path / "not-authored.json").snapshot()["metadata"]["dataset"]
        == "osm-road-snapshot"
    )
    for edge in doc["edges"]:
        assert edge["distance_km"] > 0 and edge["routing"]["provider"] == "OSRM"
        assert edge["cost_usd"] == pytest.approx(
            edge["distance_km"]
            * {"mountain": 23500, "gobi": 15000, "steppe": 17500}[edge["terrain"]]
        )
    graph = engine.graph_from_dataset(doc)
    for risk in (False, True):
        augmented = engine.augment(graph, risk)
        assert engine.verify_single_edge_survival(augmented)["all_survived"]
        assert not engine.bridge_ids(augmented)
    assert all(
        e["distance_source"] == "haversine_direct"
        for _, _, e in engine.mesh(graph).edges(data=True)
    )
