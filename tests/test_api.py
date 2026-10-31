from backend.fiberguard.repository import Repository
from backend.fiberguard.geo import haversine
import pytest


def test_health_and_all_read_endpoints(client):
    for path in [
        "/health",
        "/network/nodes",
        "/network/edges",
        "/network/topologies",
        "/network/statistics",
        "/network/bridges",
        "/network/analysis",
    ]:
        r = client.get("/api" + path)
        assert r.status_code == 200, r.json
    t = client.get("/api/network/topologies").json["topologies"]
    assert t["mst"]["metrics"]["edge_count"] == 21
    assert t["optimized"]["metrics"]["bridge_count"] == 0
    assert t["mesh"]["metrics"]["edge_count"] == 231


def test_cut_accumulation_and_reset_are_stateless(client):
    first = client.post(
        "/api/network/simulate-cut", json={"topology": "mst", "edge_id": "fg-001"}
    )
    assert first.status_code == 200
    assert first.json["affected_nodes"]
    second = client.post(
        "/api/network/simulate-cut",
        json={
            "topology": "mst",
            "edge_id": "fg-002",
            "failed_edges": first.json["failed_edges"],
        },
    )
    assert second.json["failed_edges"] == ["fg-001", "fg-002"]
    assert (
        client.get("/api/network/topologies").json["topologies"]["mst"]["metrics"][
            "edge_count"
        ]
        == 21
    )
    assert (
        client.post("/api/network/reset", json={"topology": "mst"}).json["failed_edges"]
        == []
    )


@pytest.mark.parametrize("scenario", ["flood", "earthquake"])
def test_regional_disasters(client, scenario):
    r = client.post(
        "/api/network/simulate-disaster",
        json={
            "topology": "optimized",
            "scenario": scenario,
            "center": [47.918, 106.917],
            "radius_km": 80,
            "severity": 1.5,
        },
    )
    assert r.status_code == 200
    assert r.json["zone"]["radius_km"] == 120
    t = client.get("/api/network/topologies").json["topologies"]["optimized"]
    from backend.fiberguard.geo import intersects_circle

    expected = sorted(
        e["id"]
        for e in t["edges"]
        if intersects_circle(e["geometry"], [47.918, 106.917], 120)
    )
    assert r.json["new_failed_edges"] == expected


def test_shared_risk_removes_entire_group(client):
    t = client.get("/api/network/topologies").json["topologies"]["optimized"]
    expected = sorted(
        e["id"] for e in t["edges"] if e["shared_risk_group"] == "central-trunk"
    )
    r = client.post(
        "/api/network/simulate-disaster",
        json={"scenario": "srlg", "shared_risk_group": "central-trunk"},
    )
    assert r.status_code == 200
    assert r.json["failed_edges"] == expected
    assert len(expected) > 1


@pytest.mark.parametrize(
    "endpoint,body",
    [
        ("simulate-cut", {"edge_id": "missing"}),
        ("simulate-cut", {"edge_id": "fg-001", "failed_edges": ["bogus"]}),
        ("simulate-disaster", {"scenario": "earthquake", "center": [1000, 0]}),
        (
            "simulate-disaster",
            {"scenario": "flood", "center": [47, 105], "radius_km": -1},
        ),
        (
            "simulate-disaster",
            {"scenario": "flood", "center": [47, 105], "severity": True},
        ),
        ("simulate-disaster", {"scenario": "srlg", "shared_risk_group": None}),
        ("shortest-path", {"source": "unknown", "target": "ub"}),
        ("optimize", {"weights": {"cost": -1}}),
        (
            "optimize",
            {
                "weights": {
                    "cost": 0,
                    "terrain": 0,
                    "exposure": 0,
                    "diversity": 0,
                    "latency": 0,
                }
            },
        ),
        ("optimize", {"weights": {"typo": 1}}),
        ("simulate-cut", {"topology": "unknown"}),
    ],
)
def test_informative_validation(client, endpoint, body):
    r = client.post("/api/network/" + endpoint, json=body)
    assert r.status_code == 400, r.json
    assert r.json["error"]["message"]


def test_route_and_optimization(client):
    r = client.post(
        "/api/network/shortest-path", json={"source": "ub", "target": "olgii"}
    )
    assert r.status_code == 200 and r.json["after"]["reachable"]
    r = client.post(
        "/api/network/optimize",
        json={"mode": "risk", "weights": {"terrain": 2, "diversity": 2}},
    )
    assert r.status_code == 200
    assert r.json["topology"]["metrics"]["bridge_count"] == 0
    assert r.json["topology"]["heuristic"]


def test_node_crud_persists_separately(client):
    n = dict(
        id="test",
        name_mn="Тест",
        name_en="Test",
        province="Test",
        lat=47.1,
        lon=106.1,
        node_type="regional",
        traffic_demand_mbps=100,
    )
    assert client.post("/api/network/nodes", json=n).status_code == 201
    assert (
        client.patch(
            "/api/network/nodes/test", json={"name_en": "Test edited"}
        ).status_code
        == 200
    )
    assert client.get("/api/network/topologies").json["topologies"]["optimized"][
        "infeasible"
    ]
    assert client.delete("/api/network/nodes/test").status_code == 200
    assert len(client.get("/api/network/nodes").json["nodes"]) == 22
    assert client.delete("/api/network/nodes/ub").status_code == 400
    assert client.delete("/api/network/nodes/missing").status_code == 404


def test_edge_crud_and_validated_distance(client):
    e = dict(
        id="test-edge",
        source="ub",
        target="altai",
        terrain="steppe",
        corridor_id="TEST",
    )
    assert client.post("/api/network/edges", json=e).status_code == 201
    r = client.patch(
        "/api/network/edges/test-edge",
        json=dict(
            distance_source="validated_route",
            distance_km=1234.5,
            cost_usd=20000000,
            validation_reference="Academic validation fixture; not an actual survey",
        ),
    )
    assert r.status_code == 200, r.json
    assert r.json["latency_ms"] == pytest.approx(1234.5 / 200)
    assert (
        client.patch("/api/network/edges/test-edge", json={"risk_score": 2}).status_code
        == 400
    )
    assert client.delete("/api/network/edges/test-edge").status_code == 200
    assert len(client.get("/api/network/edges").json["edges"]) == 45


def test_duplicate_and_geometry_validation(client):
    e = dict(
        id="bad-edge",
        source="ub",
        target="zuunmod",
        terrain="steppe",
        corridor_id="TEST",
    )
    assert client.post("/api/network/edges", json=e).status_code == 400
    e.update(target="altai", geometry=[[0, 0], [1, 1]])
    assert client.post("/api/network/edges", json=e).status_code == 400
    assert (
        client.patch("/api/network/edges/fg-001", json={"id": "renamed"}).status_code
        == 400
    )
    assert (
        client.patch(
            "/api/network/edges/fg-001", json={"distance_source": "validated_route"}
        ).status_code
        == 400
    )


def test_estimated_route_recomputed_after_node_move(client):
    before = client.get("/api/network/edges").json["edges"][0]
    assert (
        client.patch("/api/network/nodes/olgii", json={"lat": 48.8}).status_code == 200
    )
    after = next(
        x
        for x in client.get("/api/network/edges").json["edges"]
        if x["id"] == before["id"]
    )
    assert after["geometry"][0][0] == 48.8
    assert after["distance_km"] != before["distance_km"]
    assert after["latency_ms"] == pytest.approx(
        after["distance_km"] / 200, abs=0.000001
    )


def test_unknown_api_and_malformed_json(client):
    assert client.get("/api/nonexistent").status_code == 404
    r = client.post(
        "/api/network/optimize", data="not json", content_type="application/json"
    )
    assert r.status_code == 400
    assert r.json["error"]["message"]


def test_moving_validated_endpoint_requires_revalidation(client):
    r = client.patch(
        "/api/network/edges/fg-001",
        json={
            "distance_source": "validated_route",
            "distance_km": 200,
            "cost_usd": 3500000,
            "validation_reference": "Test fixture only",
        },
    )
    assert r.status_code == 200
    assert (
        client.patch("/api/network/nodes/olgii", json={"lat": 48.8}).status_code == 400
    )
    olgii = next(
        n for n in client.get("/api/network/nodes").json["nodes"] if n["id"] == "olgii"
    )
    assert olgii["lat"] == 48.968
