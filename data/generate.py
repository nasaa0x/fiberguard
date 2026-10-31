"""Deterministic academic dataset. No routes here are operator-verified."""

import json
import math
from pathlib import Path

ROOT = Path(__file__).parent
CITIES = [
    ("ub", "Улаанбаатар", "Ulaanbaatar", "Улаанбаатар", 47.918, 106.917),
    ("olgii", "Өлгий", "Ölgii", "Баян-Өлгий", 48.968, 89.962),
    ("khovd", "Ховд", "Khovd", "Ховд", 48.005, 91.641),
    ("ulaangom", "Улаангом", "Ulaangom", "Увс", 49.981, 92.067),
    ("uliastai", "Улиастай", "Uliastai", "Завхан", 47.742, 96.844),
    ("altai", "Алтай", "Altai", "Говь-Алтай", 46.372, 96.258),
    ("murun", "Мөрөн", "Mörön", "Хөвсгөл", 49.635, 100.162),
    ("tsetserleg", "Цэцэрлэг", "Tsetserleg", "Архангай", 47.476, 101.451),
    ("bayankhongor", "Баянхонгор", "Bayankhongor", "Баянхонгор", 46.194, 100.718),
    ("arvaikheer", "Арвайхээр", "Arvaikheer", "Өвөрхангай", 46.263, 102.775),
    ("bulgan", "Булган", "Bulgan", "Булган", 48.811, 103.534),
    ("erdenet", "Эрдэнэт", "Erdenet", "Орхон", 49.027, 104.044),
    ("darkhan", "Дархан", "Darkhan", "Дархан-Уул", 49.487, 105.923),
    ("sukhbaatar", "Сүхбаатар", "Sükhbaatar", "Сэлэнгэ", 50.236, 106.207),
    ("zuunmod", "Зуунмод", "Zuunmod", "Төв", 47.706, 106.952),
    ("mandalgovi", "Мандалговь", "Mandalgovi", "Дундговь", 45.763, 106.271),
    ("dalanzadgad", "Даланзадгад", "Dalanzadgad", "Өмнөговь", 43.570, 104.425),
    ("choir", "Чойр", "Choir", "Говьсүмбэр", 46.361, 108.361),
    ("sainshand", "Сайншанд", "Sainshand", "Дорноговь", 44.895, 110.122),
    ("chinggis", "Чингис", "Chinggis", "Хэнтий", 47.319, 110.655),
    ("baruunurt", "Баруун-Урт", "Baruun-Urt", "Сүхбаатар", 46.678, 113.279),
    ("choibalsan", "Чойбалсан", "Choibalsan", "Дорнод", 48.077, 114.535),
]
# Explicit planning adjacencies, NOT evidence of existing physical corridors.
PAIRS = [
    ("olgii", "khovd"),
    ("olgii", "ulaangom"),
    ("khovd", "ulaangom"),
    ("khovd", "altai"),
    ("khovd", "uliastai"),
    ("ulaangom", "uliastai"),
    ("ulaangom", "murun"),
    ("uliastai", "altai"),
    ("uliastai", "murun"),
    ("uliastai", "tsetserleg"),
    ("altai", "bayankhongor"),
    ("altai", "tsetserleg"),
    ("murun", "tsetserleg"),
    ("murun", "bulgan"),
    ("murun", "erdenet"),
    ("tsetserleg", "bayankhongor"),
    ("tsetserleg", "arvaikheer"),
    ("tsetserleg", "bulgan"),
    ("bayankhongor", "arvaikheer"),
    ("bayankhongor", "dalanzadgad"),
    ("arvaikheer", "bulgan"),
    ("arvaikheer", "ub"),
    ("arvaikheer", "mandalgovi"),
    ("bulgan", "erdenet"),
    ("bulgan", "ub"),
    ("erdenet", "darkhan"),
    ("erdenet", "ub"),
    ("darkhan", "sukhbaatar"),
    ("darkhan", "ub"),
    ("sukhbaatar", "ub"),
    ("ub", "zuunmod"),
    ("ub", "chinggis"),
    ("ub", "choir"),
    ("zuunmod", "mandalgovi"),
    ("zuunmod", "choir"),
    ("zuunmod", "chinggis"),
    ("mandalgovi", "dalanzadgad"),
    ("mandalgovi", "choir"),
    ("dalanzadgad", "sainshand"),
    ("choir", "sainshand"),
    ("choir", "chinggis"),
    ("sainshand", "baruunurt"),
    ("chinggis", "baruunurt"),
    ("chinggis", "choibalsan"),
    ("baruunurt", "choibalsan"),
]


def haversine(a, b):
    p, q = map(math.radians, [a[0], b[0]])
    d = math.radians(b[0] - a[0])
    l = math.radians(b[1] - a[1])
    return (
        6371.0088
        * 2
        * math.asin(
            min(
                1,
                math.sqrt(
                    math.sin(d / 2) ** 2
                    + math.cos(p) * math.cos(q) * math.sin(l / 2) ** 2
                ),
            )
        )
    )


def main():
    nodes = [
        dict(
            id=i,
            name_mn=m,
            name_en=e,
            province=p,
            lat=lat,
            lon=lon,
            node_type="core" if i == "ub" else "regional",
            traffic_demand_mbps=10000 if i == "ub" else 500 + 150 * k,
        )
        for k, (i, m, e, p, lat, lon) in enumerate(CITIES)
    ]
    lookup = {n["id"]: n for n in nodes}
    edges = []
    for k, (a, b) in enumerate(PAIRS):
        x, y = lookup[a], lookup[b]
        west = (x["lon"] + y["lon"]) / 2 < 99
        terrain = (
            "mountain"
            if west
            else ("gobi" if (x["lat"] + y["lat"]) / 2 < 46.5 else "steppe")
        )
        factor = {"mountain": 1.28, "gobi": 1.12, "steppe": 1.15}[terrain]
        length = round(
            haversine((x["lat"], x["lon"]), (y["lat"], y["lon"])) * factor, 3
        )
        group = (
            "western-pass"
            if west
            else (
                "southern-corridor"
                if terrain == "gobi"
                else (
                    "central-trunk"
                    if x["lon"] < 108 and y["lon"] < 108
                    else "eastern-corridor"
                )
            )
        )
        mid = [
            (x["lat"] + y["lat"]) / 2 + ((k % 3) - 1) * 0.06,
            (x["lon"] + y["lon"]) / 2 + ((k % 5) - 2) * 0.025,
        ]
        edges.append(
            dict(
                id="fg-%03d" % (k + 1),
                source=a,
                target=b,
                distance_km=length,
                cost_usd=round(
                    length
                    * {"mountain": 23500, "gobi": 15000, "steppe": 17500}[terrain],
                    2,
                ),
                terrain=terrain,
                risk_score=round(
                    min(
                        0.95,
                        {"mountain": 0.52, "gobi": 0.25, "steppe": 0.17}[terrain]
                        + (k % 7) * 0.035,
                    ),
                    3,
                ),
                disaster_exposure=round(0.2 + (k % 6) * 0.1, 2),
                corridor_id="PLAN-%02d" % (k // 2 + 1),
                shared_risk_group=group,
                latency_ms=round(length / 200, 6),
                status="planned",
                distance_source="estimated_haversine_detour",
                route_source="synthetic_planning_polyline",
                geometry=[[x["lat"], x["lon"]], mid, [y["lat"], y["lon"]]],
                theoretical=False,
            )
        )
    doc = dict(
        metadata=dict(
            version=1,
            seed=42,
            currency="USD",
            verified_routes=False,
            description="Academic planning hypotheses. City coordinates approximate; cable lengths = haversine × terrain detour. Not surveyed road, rail or operator fiber routes.",
            distance_method="Earth radius 6371.0088 km; detour: mountain 1.28, gobi 1.12, steppe 1.15",
            capex_method="Estimated USD/km: mountain 23500, gobi 15000, steppe 17500",
        ),
        nodes=nodes,
        edges=edges,
    )
    (ROOT / "network.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
