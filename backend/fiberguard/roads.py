"""OSM road-following driving routes with disk caching and respectful rate limiting.

Road distance is not surveyed cable length. OSRM's fastest driving profile does
not certify an entirely paved alignment. No straight-line fallback is permitted.
"""

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import ssl
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from .geo import EARTH_KM, haversine

DEFAULT_SERVER = "https://routing.openstreetmap.de/routed-car"
USER_AGENT = "FiberGuardMongolia/1.1 (academic road-corridor planner)"
ROOT = Path(__file__).resolve().parents[2]


class RoadRoutingError(RuntimeError):
    """A provider failure must never silently become a straight-line route."""


def _get_json(url, timeout=20):
    request = Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(5_000_001)
    except HTTPError as exc:
        # OSRM can return NoRoute/NoSegment in a 4xx JSON response.
        raw = exc.read(5_000_001)
    except (URLError, ssl.SSLError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        if not isinstance(reason, ssl.SSLError):
            raise RoadRoutingError(
                "Авто замын серверт холбогдож чадсангүй. Дараа дахин оролдоно уу."
            ) from exc
        # Apple's bundled Python 3.9 uses old LibreSSL. macOS curl supports
        # current HTTPS without disabling certificate checks or using shell code.
        try:
            result = subprocess.run(
                [
                    "curl",
                    "--silent",
                    "--show-error",
                    "--max-time",
                    str(timeout),
                    "--max-filesize",
                    "5000000",
                    "--user-agent",
                    USER_AGENT,
                    "--header",
                    "Accept: application/json",
                    url,
                ],
                capture_output=True,
                timeout=timeout + 2,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as fallback:
            raise RoadRoutingError(
                "HTTPS холболт амжилтгүй. Python/SSL эсвэл curl-ээ шинэчилнэ үү."
            ) from fallback
        if result.returncode:
            raise RoadRoutingError(
                "Авто замын HTTPS хүсэлт амжилтгүй. Хадгалсан маршрут өөрчлөгдөөгүй."
            )
        raw = result.stdout
    if len(raw) > 5_000_000:
        raise RoadRoutingError("Авто замын серверийн хариу хэт том байна.")
    try:
        doc = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise RoadRoutingError("Авто замын сервер JSON маршрут буцаасангүй.") from exc
    if not isinstance(doc, dict):
        raise RoadRoutingError("Авто замын серверийн хариу буруу бүтэцтэй байна.")
    return doc


def simplify_geometry(points, tolerance_m=20):
    """Iterative Douglas–Peucker, 20 m local projected tolerance; endpoints kept.

    Scalar distance is always the provider's full route distance, never the
    chord length of the simplified display / hazard-intersection geometry.
    """
    if len(points) <= 2:
        return deepcopy(points)
    lat = math.radians(sum(p[0] for p in points) / len(points))
    coslat = math.cos(lat)
    xy = [
        (
            math.radians(p[1]) * EARTH_KM * 1000 * coslat,
            math.radians(p[0]) * EARTH_KM * 1000,
        )
        for p in points
    ]
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        a, b = xy[first], xy[last]
        dx, dy = b[0] - a[0], b[1] - a[1]
        norm = dx * dx + dy * dy
        furthest, max_distance = None, tolerance_m * tolerance_m
        for i in range(first + 1, last):
            px, py = xy[i]
            t = (
                max(0.0, min(1.0, ((px - a[0]) * dx + (py - a[1]) * dy) / norm))
                if norm
                else 0.0
            )
            distance = (px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2
            if distance > max_distance:
                furthest, max_distance = i, distance
        if furthest is not None:
            keep.add(furthest)
            stack.extend([(first, furthest), (furthest, last)])
    return [deepcopy(points[i]) for i in sorted(keep)]


class RoadRouter:
    def __init__(self, cache_path=None, server=None, fetcher=None, min_interval=1.1):
        self.server = (
            server or os.environ.get("OSRM_BASE_URL", DEFAULT_SERVER)
        ).rstrip("/")
        parsed = urlparse(self.server)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
        ):
            raise ValueError(
                "OSRM_BASE_URL must be an HTTP(S) server URL without credentials."
            )
        self.path = Path(cache_path) if cache_path else ROOT / "data" / "road-cache"
        self.path.mkdir(parents=True, exist_ok=True)
        self.fetcher = fetcher or _get_json
        self.min_interval = min_interval
        self.lock = threading.Lock()
        self.last_request = 0.0

    def route(self, source, target, refresh=False):
        endpoints = [[source["lat"], source["lon"]], [target["lat"], target["lon"]]]
        identity = dict(
            server=self.server, profile="driving", endpoints=endpoints, version=1
        )
        key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        cache_file = self.path / (key + ".json")
        with self.lock:
            if not refresh and cache_file.exists():
                try:
                    cached = json.loads(cache_file.read_text())
                    if cached["identity"] == identity:
                        return deepcopy(cached["route"])
                except (ValueError, KeyError, OSError):
                    pass
            elapsed = time.monotonic() - self.last_request
            if elapsed < self.min_interval:
                time.sleep(self.min_interval - elapsed)
            coords = ";".join(f"{p[1]:.6f},{p[0]:.6f}" for p in endpoints)
            params = urlencode(
                dict(
                    overview="full",
                    geometries="geojson",
                    steps="false",
                    alternatives="false",
                    radiuses="1000;1000",
                    generate_hints="false",
                )
            )
            url = f"{self.server}/route/v1/driving/{coords}?{params}"
            self.last_request = time.monotonic()
            data = self.fetcher(url)
            route = self._validate(data, endpoints, url)
            temporary = cache_file.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(dict(identity=identity, route=route), ensure_ascii=False)
            )
            os.replace(temporary, cache_file)
            return deepcopy(route)

    def _validate(self, data, endpoints, url):
        if data.get("code") != "Ok" or not data.get("routes"):
            code = data.get("code", "unknown")
            raise RoadRoutingError(
                f"Авто замын маршрут олдсонгүй ({code}). Шулуун шугамаар орлуулаагүй."
            )
        try:
            result = data["routes"][0]
            distance = result["distance"] / 1000
            duration = result["duration"]
            coordinates = result["geometry"]["coordinates"]
            if not math.isfinite(distance) or not 0 < distance <= 100000:
                raise ValueError("distance")
            if not math.isfinite(duration) or duration < 0:
                raise ValueError("duration")
            if result["geometry"]["type"] != "LineString" or len(coordinates) < 2:
                raise ValueError("geometry")
            geometry = []
            for coord in coordinates:
                lon, lat = coord[:2]
                if (
                    not math.isfinite(lat)
                    or not math.isfinite(lon)
                    or not -85 <= lat <= 85
                    or not -180 <= lon <= 180
                ):
                    raise ValueError("coordinate")
                geometry.append([lat, lon])
            for point, requested in (
                (geometry[0], endpoints[0]),
                (geometry[-1], endpoints[1]),
            ):
                if haversine(point, requested) > 1:
                    raise ValueError("snapping beyond 1 km")
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            raise RoadRoutingError(
                "Серверийн маршрут буруу эсвэл замд холбох зай 1 км-ээс их байна."
            ) from exc
        return dict(
            distance_km=round(distance, 3),
            geometry=simplify_geometry(geometry),
            distance_source="osm_road_route",
            route_source="OSRM / OpenStreetMap driving route",
            routing=dict(
                provider="OSRM",
                profile="driving",
                server=self.server,
                request_url=url,
                fetched_at=datetime.now(timezone.utc).isoformat(),
                data_version=data.get("data_version"),
                driving_duration_seconds=duration,
                full_geometry_points=len(geometry),
                geometry_tolerance_m=20,
                snapped_distance_m=[
                    round(haversine(geometry[0], endpoints[0]) * 1000, 2),
                    round(haversine(geometry[-1], endpoints[1]) * 1000, 2),
                ],
                surface_verified=False,
                fiber_route_verified=False,
                note="Fastest OSM driving route. Paved surface, cable availability and construction rights not verified.",
            ),
        )


def road_edge(edge, route):
    item = {**deepcopy(edge), **deepcopy(route)}
    item["cost_usd"] = round(
        item["distance_km"]
        * {"mountain": 23500, "gobi": 15000, "steppe": 17500}[item["terrain"]],
        2,
    )
    item["latency_ms"] = round(item["distance_km"] / 200, 6)
    return item
