"""Reproducible geodesic lengths and local projected polyline intersection."""

import math

EARTH_KM = 6371.0088


def haversine(a, b):
    p, q = math.radians(a[0]), math.radians(b[0])
    h = (
        math.sin((q - p) / 2) ** 2
        + math.cos(p) * math.cos(q) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    )
    return 2 * EARTH_KM * math.asin(min(1, math.sqrt(h)))


def intersects_circle(geometry, center, radius_km):
    """Local equirectangular projection around epicenter; includes segment interiors.

    For regional radii this is a model, not a GIS survey or geodesic buffer.
    Coordinates are always [latitude, longitude].
    """

    def project(p):
        return (
            math.radians(p[1] - center[1])
            * EARTH_KM
            * math.cos(math.radians(center[0])),
            math.radians(p[0] - center[0]) * EARTH_KM,
        )

    points = [project(p) for p in geometry]
    for a, b in zip(points, points[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        norm = dx * dx + dy * dy
        t = max(0, min(1, -(a[0] * dx + a[1] * dy) / norm)) if norm else 0
        if math.hypot(a[0] + t * dx, a[1] + t * dy) <= radius_km:
            return True
    return False
