import copy
import networkx as nx
import pytest
from backend.fiberguard import engine as e
from backend.fiberguard.geo import haversine, intersects_circle


def test_seeded_dataset_integrity(dataset, graph):
    assert len(graph) == 22
    assert len({n["province"] for n in dataset["nodes"]}) == 22
    assert nx.is_connected(graph)
    assert not list(nx.bridges(graph))
    assert len({x["id"] for x in dataset["edges"]}) == 45
    assert all(
        x["distance_source"] == "estimated_haversine_detour" and not x["theoretical"]
        for x in dataset["edges"]
    )
    assert len(dataset["edges"]) < 231


def test_mst_edges_connectivity_and_bridges(graph):
    h = e.mst(graph)
    assert h.number_of_edges() == 21
    assert nx.is_connected(h)
    assert len(e.bridge_ids(h)) == 21
    assert e.metrics(h)["single_edge_survival_pct"] == 0


@pytest.mark.parametrize("risk", [False, True])
def test_augmentation_zero_bridges_and_all_single_edge_removals(graph, risk):
    h = e.augment(graph, risk)
    assert e.bridge_ids(h) == []
    assert nx.is_connected(h)
    for u, v in h.edges():
        copy = h.copy()
        copy.remove_edge(u, v)
        assert nx.is_connected(copy), (u, v)
    assert e.metrics(h)["single_edge_survival_pct"] == 100
    assert set(d["id"] for _, _, d in h.edges(data=True)) <= set(
        d["id"] for _, _, d in graph.edges(data=True)
    )


def test_augmentation_deterministic(graph):
    assert sorted(e.augment(graph).edges()) == sorted(e.augment(graph).edges())
    assert sorted(e.augment(graph, True).edges()) == sorted(
        e.augment(graph, True).edges()
    )


def test_infeasible_does_not_fabricate_routes(graph):
    with pytest.raises(e.Infeasible):
        e.augment(e.mst(graph))
    g = graph.copy()
    g.remove_node("ub")
    g.add_node("isolated")
    with pytest.raises(e.Infeasible):
        e.mst(g)


def test_bridge_cut_disconnects_mst(graph):
    h = e.mst(graph)
    bridge = e.bridge_ids(h)[0]
    result = e.simulate(h, graph, [bridge])
    assert len(result["components"]) == 2
    assert result["affected_nodes"]
    assert result["availability_pct"] < 100
    assert result["recovery"]["recommendations"]
    assert result["recovery"]["feasible"]


def test_non_bridge_cut_retains_connectivity(graph):
    h = e.augment(graph)
    edge = next(iter(h.edges(data=True)))[2]["id"]
    result = e.simulate(h, graph, [edge])
    assert len(result["components"]) == 1
    assert result["affected_nodes"] == []
    assert result["availability_pct"] == 100


def test_disaster_segment_interior_not_only_endpoints():
    assert intersects_circle([[0, -2], [0, 2]], [0, 0], 1)
    assert not intersects_circle([[2, -2], [2, 2]], [0, 0], 100)
    assert intersects_circle([[0, 0], [0, 0]], [0, 0], 1)
    assert not intersects_circle([[3, 3], [3, 3]], [0, 0], 10)


def test_disaster_fails_correct_modeled_edges(graph):
    expected = sorted(
        d["id"]
        for _, _, d in graph.edges(data=True)
        if intersects_circle(d["geometry"], [47.918, 106.917], 120)
    )
    assert e.regional_failures(graph, [47.918, 106.917], 120) == expected
    assert expected
    h = e.without_edges(graph, expected)
    assert h.number_of_edges() == graph.number_of_edges() - len(expected)


def test_rerouting_uses_surviving_infrastructure_only(graph):
    h = e.augment(graph)
    original = e.route(h, "ub", "olgii")
    failed = original["edges"][:1]
    result = e.simulate(h, graph, failed, "ub", "olgii")
    assert result["after_route"]["reachable"]
    assert not set(result["after_route"]["edges"]) & set(failed)
    assert result["after_route"]["edges"] != original["edges"]
    for p in result["rerouted_paths"]:
        assert not set(p["after"]["edges"]) & set(failed)
        assert all(
            edge in {d["id"] for _, _, d in h.edges(data=True)}
            for edge in p["after"]["edges"]
        )


def test_latency_and_cost_consistency(graph):
    r = e.route(graph, "ub", "olgii")
    length = r["distance_km"]
    hops = len(r["edges"])
    assert r["propagation_one_way_ms"] == pytest.approx(length / 200, abs=0.0001)
    assert r["propagation_rtt_ms"] == pytest.approx(length / 100, abs=0.0001)
    assert r["equipment_one_way_ms"] == pytest.approx(hops * 0.15)
    assert r["modeled_rtt_ms"] == pytest.approx(length / 100 + hops * 0.3, abs=0.0001)
    m = e.metrics(graph)
    assert m["cost_usd"] == pytest.approx(
        sum(d["cost_usd"] for _, _, d in graph.edges(data=True)), abs=0.01
    )
    assert m["distance_km"] == pytest.approx(
        sum(d["distance_km"] for _, _, d in graph.edges(data=True)), abs=0.01
    )
    assert haversine([0, 0], [0, 1]) == pytest.approx(111.19508, rel=1e-6)
    selfroute = e.route(graph, "ub", "ub")
    assert selfroute["modeled_rtt_ms"] == 0 and selfroute["edges"] == []


def test_mesh_is_theoretical_231_edges(graph):
    h = e.mesh(graph)
    assert h.number_of_edges() == 231
    assert all(d["theoretical"] for _, _, d in h.edges(data=True))
    assert e.bridge_ids(h) == []
    assert e.metrics(h)["multi_failure_survival_pct"] is None


def test_simulation_does_not_mutate_baseline(graph):
    old = copy.deepcopy(dict(graph.edges))
    h = e.augment(graph)
    e.simulate(h, graph, [next(iter(h.edges(data=True)))[2]["id"]])
    assert dict(graph.edges) == old


def test_unreachable_latency_is_null(graph):
    h = e.mst(graph)
    r = e.simulate(h, graph, e.bridge_ids(h))
    assert r["after_metrics"]["max_modeled_rtt_ms"] is None
    assert r["after_metrics"]["below_50ms"] is False
    assert len(r["affected_nodes"]) == 21
    assert all(not x["after"]["reachable"] for x in r["rerouted_paths"])


def test_stress_suite_is_comparable(graph):
    trees = [e.mst(graph), e.augment(graph), e.augment(graph, True)]
    assert all(len(g.graph["candidate_edges"]) == 45 for g in trees)
    assert len({e.metrics(g)["scenario_count"] for g in trees}) == 1


def test_recovery_only_uses_candidate_links_and_reconnects(graph):
    h = e.augment(graph)
    failed = e.regional_failures(h, [47.918, 106.917], 120)
    result = e.simulate(h, graph, failed)
    remaining = e.without_edges(h, failed)
    for rec in result["recovery"]["recommendations"]:
        assert graph.has_edge(rec["source"], rec["target"])
        remaining.add_edge(
            rec["source"], rec["target"], **graph[rec["source"]][rec["target"]]
        )
    assert nx.is_connected(remaining)


def test_exhaustive_failure_certificate(graph):
    h = e.augment(graph)
    cert = e.verify_single_edge_survival(h)
    assert cert["checked_edges"] == h.number_of_edges()
    assert cert["passed_edges"] == h.number_of_edges()
    assert cert["failed_edge_ids"] == [] and cert["all_survived"]
    cert = e.verify_single_edge_survival(e.mst(graph))
    assert cert["passed_edges"] == 0 and len(cert["failed_edge_ids"]) == 21
