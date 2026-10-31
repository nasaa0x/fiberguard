"""Pure NetworkX domain functions; never mutate the input graph."""

from itertools import combinations
import random
import networkx as nx
from .geo import haversine, intersects_circle

DEFAULT_WEIGHTS = dict(
    cost=1.0, terrain=0.65, exposure=0.7, diversity=0.8, latency=0.35
)


class Infeasible(ValueError):
    pass


def graph_from_dataset(data):
    g = nx.Graph()
    for n in sorted(data["nodes"], key=lambda n: n["id"]):
        g.add_node(n["id"], **n)
    for e in sorted(data["edges"], key=lambda e: e["id"]):
        g.add_edge(e["source"], e["target"], **e)
    g.graph["candidate_edges"] = [dict(d) for _, _, d in g.edges(data=True)]
    return g


def mst(g):
    if not len(g) or not nx.is_connected(g):
        raise Infeasible(
            "Candidate graph is disconnected; a spanning network is infeasible."
        )
    return nx.minimum_spanning_tree(g, weight="cost_usd", algorithm="kruskal")


def bridge_ids(g):
    return sorted(g[u][v]["id"] for u, v in nx.bridges(g))


def augment(g, risk=False, weights=None):
    """Greedy bridge-cover augmentation, followed by reverse deletion.

    Cover is the count of current bridges on an existing shortest path.
    Candidate graph connectivity and bridge checks prove feasibility first.
    Selected links come ONLY from g. No claim of global optimality.
    """
    if len(g) < 2 or not nx.is_connected(g) or list(nx.bridges(g)):
        raise Infeasible(
            "Candidate corridors cannot provide 2-edge-connectivity. Add validated independent corridors."
        )
    w = weights or DEFAULT_WEIGHTS
    h = mst(g)
    added = []
    max_cost = max(d["cost_usd"] for _, _, d in g.edges(data=True)) or 1
    max_dist = max(d["distance_km"] for _, _, d in g.edges(data=True)) or 1
    while list(nx.bridges(h)):
        bridges = {frozenset(e) for e in nx.bridges(h)}
        choices = []
        for u, v, d in g.edges(data=True):
            if h.has_edge(u, v):
                continue
            path = nx.shortest_path(h, u, v, weight="distance_km")
            cover = sum(frozenset(e) in bridges for e in zip(path, path[1:]))
            if not cover:
                continue
            score = d["cost_usd"] / max_cost
            if risk:
                score = (
                    w["cost"] * score
                    + w["terrain"] * d["risk_score"]
                    + w["exposure"] * d.get("disaster_exposure", 0.5)
                    + w["diversity"]
                    * (
                        sum(
                            h[a][b].get("shared_risk_group")
                            == d.get("shared_risk_group")
                            for a, b in zip(path, path[1:])
                        )
                        / max(1, len(path) - 1)
                    )
                    + w["latency"] * d["distance_km"] / max_dist
                )
            choices.append((score / cover, d["id"], u, v, d))
        if not choices:
            raise Infeasible(
                "No remaining candidate edge can cover the remaining bridges."
            )
        _, _, u, v, d = min(choices, key=lambda x: (x[0], x[1]))
        h.add_edge(u, v, **d)
        added.append((u, v))
    for u, v in reversed(added):
        d = dict(h[u][v])
        h.remove_edge(u, v)
        if not nx.is_connected(h) or list(nx.bridges(h)):
            h.add_edge(u, v, **d)
    verification = verify_single_edge_survival(h)
    if not verification["all_survived"]:
        raise Infeasible("Single-edge removal verification failed.")
    return h


def verify_single_edge_survival(g):
    """Exhaustive constructive certificate, independent of bridge-count inference."""
    failed_checks = []
    for u, v, d in g.edges(data=True):
        h = g.copy()
        h.remove_edge(u, v)
        if not len(h) or not nx.is_connected(h):
            failed_checks.append(d["id"])
    return dict(
        checked_edges=g.number_of_edges(),
        passed_edges=g.number_of_edges() - len(failed_checks),
        failed_edge_ids=sorted(failed_checks),
        all_survived=bool(len(g)) and nx.is_connected(g) and not failed_checks,
    )


def mesh(g):
    h = nx.Graph()
    h.add_nodes_from(g.nodes(data=True))
    h.graph["theoretical"] = True
    for u, v in combinations(sorted(g.nodes), 2):
        a, b = g.nodes[u], g.nodes[v]
        distance = round(haversine((a["lat"], a["lon"]), (b["lat"], b["lon"])), 3)
        h.add_edge(
            u,
            v,
            id="mesh-" + u + "-" + v,
            source=u,
            target=v,
            distance_km=distance,
            cost_usd=round(distance * 17500, 2),
            terrain="theoretical",
            risk_score=0,
            disaster_exposure=0,
            corridor_id="THEORETICAL",
            shared_risk_group=None,
            latency_ms=distance / 200,
            status="theoretical",
            distance_source="haversine_direct",
            route_source="theoretical_direct",
            geometry=[[a["lat"], a["lon"]], [b["lat"], b["lon"]]],
            theoretical=True,
        )
    return h


def without_edges(g, failed):
    h = g.copy()
    ids = set(failed)
    h.remove_edges_from([(u, v) for u, v, d in g.edges(data=True) if d["id"] in ids])
    return h


def route(g, source, target):
    if source not in g or target not in g:
        raise ValueError("Unknown route endpoint.")
    try:
        path = nx.dijkstra_path(g, source, target, weight="distance_km")
    except nx.NetworkXNoPath:
        return dict(
            reachable=False,
            nodes=[],
            edges=[],
            distance_km=None,
            propagation_one_way_ms=None,
            propagation_rtt_ms=None,
            equipment_one_way_ms=None,
            modeled_rtt_ms=None,
        )
    links = [g[u][v] for u, v in zip(path, path[1:])]
    length = sum(e["distance_km"] for e in links)
    equipment = len(links) * 0.15
    return dict(
        reachable=True,
        nodes=path,
        edges=[e["id"] for e in links],
        distance_km=round(length, 3),
        propagation_one_way_ms=round(length / 200, 4),
        propagation_rtt_ms=round(length / 100, 4),
        equipment_one_way_ms=round(equipment, 4),
        modeled_rtt_ms=round(length / 100 + 2 * equipment, 4),
    )


def regional_failures(g, center, radius):
    return sorted(
        d["id"]
        for _, _, d in g.edges(data=True)
        if intersects_circle(d["geometry"], center, radius)
    )


def scenario_survival(g):
    """Fixed deterministic stress suite; survival means every node connected."""
    if not len(g):
        return 0, 0
    source = g.graph.get("candidate_edges", [dict(d) for _, _, d in g.edges(data=True)])
    scenarios = []
    for c, r in [([47.918, 106.917], 120), ([48.3, 94.5], 160), ([46.4, 111.5], 180)]:
        scenarios.append(
            [d["id"] for d in source if intersects_circle(d["geometry"], c, r)]
        )
    groups = sorted(
        {d.get("shared_risk_group") for d in source if d.get("shared_risk_group")}
    )
    for group in groups:
        scenarios.append(
            [d["id"] for d in source if d.get("shared_risk_group") == group]
        )
    ids = sorted(d["id"] for d in source)
    pairs = list(combinations(ids, 2))
    random.Random(42).shuffle(pairs)
    scenarios.extend(pairs[:30])
    survived = sum(nx.is_connected(without_edges(g, s)) for s in scenarios)
    return round(100 * survived / len(scenarios), 2) if scenarios else 100, len(
        scenarios
    )


def metrics(g, stress=True):
    bridges = bridge_ids(g)
    connected = bool(len(g)) and nx.is_connected(g)
    edge_count = g.number_of_edges()
    max_rtt = 0.0
    for s, paths in nx.all_pairs_dijkstra_path(g, weight="distance_km"):
        for t, p in paths.items():
            length = sum(g[u][v]["distance_km"] for u, v in zip(p, p[1:]))
            max_rtt = max(max_rtt, length / 100 + (len(p) - 1) * 0.3)
    survival = (
        100 * (edge_count - len(bridges)) / edge_count
        if connected and edge_count
        else 0
    )
    multi, count = (
        scenario_survival(g) if stress and not g.graph.get("theoretical") else (None, 0)
    )
    groups = {
        d.get("shared_risk_group") or d["corridor_id"] for _, _, d in g.edges(data=True)
    }
    return dict(
        node_count=len(g),
        edge_count=edge_count,
        distance_km=round(sum(d["distance_km"] for _, _, d in g.edges(data=True)), 2),
        cost_usd=round(sum(d["cost_usd"] for _, _, d in g.edges(data=True)), 2),
        bridge_count=len(bridges),
        bridges=bridges,
        connected=connected,
        components=nx.number_connected_components(g),
        fault_tolerant=connected and not bridges and edge_count > 0,
        single_edge_survival_pct=round(survival, 2),
        multi_failure_survival_pct=multi,
        scenario_count=count,
        max_modeled_rtt_ms=round(max_rtt, 3) if connected else None,
        max_reachable_rtt_ms=round(max_rtt, 3),
        below_50ms=connected and max_rtt < 50,
        corridor_diversity=len(groups),
    )


def serialize(g, name, base_cost=None, base_length=None):
    m = metrics(g)
    m["additional_cost_pct"] = (
        round((m["cost_usd"] / base_cost - 1) * 100, 2) if base_cost else 0
    )
    m["additional_distance_pct"] = (
        round((m["distance_km"] / base_length - 1) * 100, 2) if base_length else 0
    )
    return dict(
        id=name,
        verification=verify_single_edge_survival(g),
        nodes=[dict(d) for _, d in g.nodes(data=True)],
        edges=[dict(d) for _, _, d in g.edges(data=True)],
        metrics=m,
        algorithm={
            "mst": "Kruskal minimum cost spanning tree",
            "optimized": "Cost-aware greedy bridge coverage + reverse deletion",
            "risk": "Weighted risk-aware greedy bridge coverage + reverse deletion",
            "mesh": "Theoretical complete graph; direct geodesic links",
        }[name],
        heuristic=name in ("optimized", "risk"),
        theoretical=name == "mesh",
    )


def restoration(g, surviving, failed):
    """Kruskal on contracted surviving components; restore/build only modeled links."""
    components = list(nx.connected_components(surviving))
    membership = {n: i for i, c in enumerate(components) for n in c}
    uf = nx.utils.UnionFind(range(len(components)))
    recommendations = []
    for u, v, d in sorted(
        g.edges(data=True), key=lambda x: (x[2]["cost_usd"], x[2]["id"])
    ):
        if uf[membership[u]] == uf[membership[v]]:
            continue
        recommendations.append(
            dict(
                edge_id=d["id"],
                source=u,
                target=v,
                action="restore" if d["id"] in failed else "build",
                estimated_cost_usd=d["cost_usd"],
                distance_km=d["distance_km"],
                cost_basis="full modeled replacement CAPEX; repair cost is unknown",
            )
        )
        uf.union(membership[u], membership[v])
    return dict(
        planning_phase="post_event_restoration",
        requires_field_validation=True,
        recommendations=recommendations,
        estimated_cost_usd=round(
            sum(r["estimated_cost_usd"] for r in recommendations), 2
        ),
        feasible=len({uf[i] for i in range(len(components))}) <= 1,
    )


def simulate(baseline, candidates, failed, source="ub", target=None):
    h = without_edges(baseline, failed)
    if source not in h:
        raise ValueError("Reference node does not exist.")
    connected_to_source = nx.node_connected_component(h, source)
    affected = sorted(set(h) - connected_to_source)
    paths = []
    for n in sorted(h):
        if n == source:
            continue
        before = route(baseline, source, n)
        after = route(h, source, n)
        if before["edges"] != after["edges"] or not after["reachable"]:
            paths.append(dict(destination=n, before=before, after=after))
    target = (
        target
        or next((p["destination"] for p in paths if p["after"]["reachable"]), None)
        or next(iter(affected), None)
    )
    before = route(baseline, source, target) if target else None
    after = route(h, source, target) if target else None
    return dict(
        failed_edges=sorted(set(failed)),
        components=[
            sorted(c)
            for c in sorted(nx.connected_components(h), key=lambda c: sorted(c))
        ],
        affected_nodes=affected,
        reachable_nodes=sorted(connected_to_source),
        availability_pct=round(100 * len(connected_to_source) / len(h), 2),
        before_metrics=metrics(baseline, False),
        after_metrics=metrics(h, False),
        rerouted_paths=paths,
        reference_node=source,
        route_target=target,
        before_route=before,
        after_route=after,
        latency_delta_ms=(
            round(after["modeled_rtt_ms"] - before["modeled_rtt_ms"], 4)
            if before and after and after["reachable"] and before["reachable"]
            else None
        ),
        recovery=restoration(candidates, h, set(failed)),
    )
