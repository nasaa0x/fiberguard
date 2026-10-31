"""REST API: authored infrastructure is persistent; simulation state is explicit per request."""

import os
import threading
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from pathlib import Path
from .repository import Repository
from . import engine
from .roads import RoadRouter, RoadRoutingError

ROOT = Path(__file__).resolve().parents[2]


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
        DATA_PATH=os.environ.get("FIBERGUARD_DATA_PATH"),
    )
    if test_config:
        app.config.update(test_config)
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": os.environ.get(
                    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
                ).split(",")
            }
        },
    )
    repo = Repository(app.config.get("DATA_PATH"), app.config.get("BASELINE_PATH"))
    router = app.config.get("ROAD_ROUTER") or RoadRouter(
        cache_path=app.config.get("ROAD_CACHE_PATH")
    )
    app.extensions["road_router"] = router
    app.extensions["repository"] = repo
    cache = {}
    cache_lock = threading.RLock()

    def payload():
        body = request.get_json(silent=False)
        if not isinstance(body, dict):
            raise ValueError("Expected a JSON object.")
        return body

    def topology(mode="optimized", weights=None):
        if mode not in ("mst", "optimized", "risk", "mesh"):
            raise ValueError("Unknown topology. Choose mst, optimized, risk or mesh.")
        g = engine.graph_from_dataset(repo.snapshot())
        if mode == "mst":
            return engine.mst(g)
        if mode == "mesh":
            return engine.mesh(g)
        return engine.augment(g, mode == "risk", weights)

    def validated_weights(body):
        supplied = body.get("weights", {})
        if not isinstance(supplied, dict) or set(supplied) - set(
            engine.DEFAULT_WEIGHTS
        ):
            raise ValueError("Unknown optimization weight.")
        w = {**engine.DEFAULT_WEIGHTS, **supplied}
        for k, v in w.items():
            Repository.number(v, k, 0, 5)
        if sum(w.values()) == 0:
            raise ValueError("At least one optimization weight must be positive.")
        return w

    def failed_ids(body, g):
        ids = body.get("failed_edges", [])
        known = {d["id"] for _, _, d in g.edges(data=True)}
        if (
            not isinstance(ids, list)
            or len(ids) > 10000
            or any(not isinstance(i, str) for i in ids)
        ):
            raise ValueError("failed_edges must be a list of edge IDs.")
        if set(ids) - known:
            raise ValueError("Failed edge does not belong to the selected topology.")
        return set(ids)

    @app.errorhandler(Exception)
    def error(exc):
        if isinstance(exc, RoadRoutingError):
            code, kind = 502, "road_routing_unavailable"
        elif isinstance(exc, engine.Infeasible):
            code, kind = 422, "infeasible"
        elif isinstance(exc, LookupError):
            code, kind = 404, "not_found"
        elif isinstance(exc, ValueError):
            code, kind = 400, "validation_error"
        elif isinstance(exc, HTTPException):
            code, kind = exc.code, "request_error"
        else:
            app.logger.exception("Unhandled API error")
            code, kind = 500, "internal_error"
        return (
            jsonify(
                error=dict(
                    code=kind,
                    message=(
                        str(exc)
                        if code < 500 or isinstance(exc, RoadRoutingError)
                        else "An internal error occurred. Check the server log."
                    ),
                )
            ),
            code,
        )

    @app.get("/api/health")
    def health():
        return jsonify(
            status="ok",
            service="FiberGuard Mongolia",
            version="1.0.0",
            simulation_state="stateless-client-owned",
            revision=repo.revision,
        )

    @app.route("/api/network/nodes", methods=["GET", "POST"])
    def nodes():
        if request.method == "GET":
            return jsonify(nodes=repo.snapshot()["nodes"])
        return jsonify(node=repo.mutate("nodes", "create", payload=payload())), 201

    @app.route("/api/network/edges", methods=["GET", "POST"])
    def edges():
        if request.method == "GET":
            data = repo.snapshot()
            return jsonify(edges=data["edges"], metadata=data["metadata"])
        return jsonify(edge=repo.mutate("edges", "create", payload=payload())), 201

    @app.route("/api/network/<kind>/<item_id>", methods=["PUT", "PATCH", "DELETE"])
    def edit(kind, item_id):
        if kind not in ("nodes", "edges"):
            raise LookupError("Unknown record type.")
        return jsonify(
            repo.mutate(
                kind,
                "delete" if request.method == "DELETE" else "update",
                item_id,
                payload() if request.method != "DELETE" else None,
            )
        )

    @app.post("/api/network/edges/<edge_id>/road-route")
    def fetch_road_route(edge_id):
        body = payload()
        refresh = body.get("refresh", False)
        if not isinstance(refresh, bool):
            raise ValueError("refresh must be a boolean.")
        data = repo.snapshot()
        edge = next((e for e in data["edges"] if e["id"] == edge_id), None)
        if edge is None:
            raise LookupError("Record not found.")
        if edge["distance_source"] == "validated_route":
            raise ValueError(
                "A surveyed route is protected. Reclassify it before fetching a road route."
            )
        nodes = {n["id"]: n for n in data["nodes"]}
        source, target = nodes[edge["source"]], nodes[edge["target"]]
        road = router.route(source, target, refresh=refresh)
        saved = repo.apply_road_route(edge_id, source, target, road)
        return jsonify(
            edge=saved,
            revision=repo.revision,
            note="OSM driving route; paved surface and actual fiber construction corridor are not verified.",
        )

    def summaries():
        with cache_lock, repo.lock:
            key = repo.revision
            if key in cache:
                return cache[key]
            summaries = {}
            base_cost = base_length = None
            for mode in ("mst", "optimized", "risk", "mesh"):
                try:
                    h = topology(mode)
                    item = engine.serialize(h, mode, base_cost, base_length)
                    if mode == "mst":
                        base_cost = item["metrics"]["cost_usd"]
                        base_length = item["metrics"]["distance_km"]
                    summaries[mode] = item
                except engine.Infeasible as e:
                    summaries[mode] = dict(id=mode, infeasible=True, message=str(e))
            result = dict(
                topologies=summaries, metadata=repo.snapshot()["metadata"], revision=key
            )
            cache.clear()
            cache[key] = result
            return result

    @app.get("/api/network/topologies")
    def topologies():
        return jsonify(summaries())

    @app.get("/api/network/statistics")
    def statistics():
        return jsonify(
            {
                k: v.get("metrics") or dict(infeasible=True)
                for k, v in summaries()["topologies"].items()
            }
        )

    @app.get("/api/network/bridges")
    def bridges():
        g = topology(request.args.get("topology", "mst"))
        return jsonify(bridges=engine.bridge_ids(g), metrics=engine.metrics(g, False))

    @app.post("/api/network/optimize")
    def optimize():
        body = payload()
        w = validated_weights(body)
        mode = body.get("mode", "risk")
        if mode not in ("risk", "optimized"):
            raise ValueError("Optimization mode must be risk or optimized.")
        g = topology(mode, w)
        base = engine.metrics(topology("mst"), False)
        return jsonify(
            topology=engine.serialize(g, mode, base["cost_usd"], base["distance_km"]),
            weights=w,
            explanation="Greedy score / newly covered bridges, then reverse-delete redundant additions. Score = cost·C/Cmax + terrain·risk + exposure·regional_exposure + diversity·backup_path_shared_group_fraction + latency·D/Dmax. Not a global optimum.",
        )

    @app.post("/api/network/simulate-cut")
    def cut():
        body = payload()
        g = topology(body.get("topology", "optimized"), validated_weights(body))
        failed = failed_ids(body, g)
        edge = body.get("edge_id")
        match = next((d for _, _, d in g.edges(data=True) if d["id"] == edge), None)
        if match is None:
            raise ValueError("Select an existing edge in the current topology.")
        failed.add(edge)
        # Show a destination beyond the cut, or the cut endpoint when possible.
        target = body.get("target") or (
            match["target"] if match["target"] != "ub" else match["source"]
        )
        result = engine.simulate(
            g,
            engine.graph_from_dataset(repo.snapshot()),
            failed,
            body.get("source", "ub"),
            target,
        )
        result["scenario"] = "cut"
        return jsonify(result)

    @app.post("/api/network/simulate-disaster")
    def disaster():
        body = payload()
        g = topology(body.get("topology", "optimized"), validated_weights(body))
        failed = failed_ids(body, g)
        scenario = body.get("scenario")
        if scenario == "srlg":
            group = body.get("shared_risk_group")
            hits = [
                d["id"]
                for _, _, d in g.edges(data=True)
                if d.get("shared_risk_group") == group
            ]
            if not group or not hits:
                raise ValueError("Select a shared-risk group present in this topology.")
            zone = None
        elif scenario in ("flood", "earthquake"):
            center = body.get("center")
            radius = body.get("radius_km", 100)
            severity = body.get("severity", 1)
            if not isinstance(center, list) or len(center) != 2:
                raise ValueError("Center must be [latitude, longitude].")
            Repository.number(center[0], "latitude", -85, 85)
            Repository.number(center[1], "longitude", -180, 180)
            Repository.number(radius, "radius_km", 1, 1500)
            Repository.number(severity, "severity", 0.25, 2)
            effective = radius * severity
            hits = engine.regional_failures(g, center, effective)
            zone = dict(
                center=center,
                radius_km=effective,
                requested_radius_km=radius,
                severity=severity,
            )
        else:
            raise ValueError("Scenario must be flood, earthquake or srlg.")
        result = engine.simulate(
            g,
            engine.graph_from_dataset(repo.snapshot()),
            failed | set(hits),
            body.get("source", "ub"),
            body.get("target"),
        )
        result.update(
            scenario=scenario,
            new_failed_edges=hits,
            zone=zone,
            shared_risk_group=(
                body.get("shared_risk_group") if scenario == "srlg" else None
            ),
        )
        return jsonify(result)

    @app.post("/api/network/shortest-path")
    def shortest_path():
        body = payload()
        g = topology(body.get("topology", "optimized"), validated_weights(body))
        failed = failed_ids(body, g)
        source, target = body.get("source"), body.get("target")
        before = engine.route(g, source, target)
        after = engine.route(engine.without_edges(g, failed), source, target)
        return jsonify(
            before=before,
            after=after,
            latency_delta_ms=(
                round(after["modeled_rtt_ms"] - before["modeled_rtt_ms"], 4)
                if after["reachable"] and before["reachable"]
                else None
            ),
        )

    @app.post("/api/network/reset")
    def reset():
        body = payload()
        g = topology(body.get("topology", "optimized"), validated_weights(body))
        return jsonify(
            engine.simulate(
                g,
                engine.graph_from_dataset(repo.snapshot()),
                [],
                body.get("source", "ub"),
            )
        )

    @app.get("/api/network/analysis")
    def analysis():
        body = dict(topology=request.args.get("topology", "optimized"))
        g = topology(body["topology"])
        return jsonify(
            engine.simulate(g, engine.graph_from_dataset(repo.snapshot()), [])
        )

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        dist = ROOT / "frontend" / "dist"
        if path.startswith("api/"):
            raise LookupError("API endpoint not found.")
        if not (dist / "index.html").exists():
            return (
                jsonify(
                    message="Run the Vite development server on port 5173, or build frontend first."
                ),
                200,
            )
        file = dist / path
        return send_from_directory(dist, path if file.is_file() else "index.html")

    return app
