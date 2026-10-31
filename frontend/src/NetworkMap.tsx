import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, type Circle as LeafletCircle, type LeafletEvent, type Marker as LeafletMarker } from "leaflet";
import type { GeoJsonObject } from "geojson";
import {
  Crosshair,
  Layers3,
  Minus,
  Plus,
  LocateFixed,
  MousePointer2,
} from "lucide-react";
import type { Edge, Mode, NetworkNode, Simulation, Topology } from "./types";
import { MODE_COLORS, format, distanceLabel } from "./types";

interface Props {
  topology: Topology;
  mode: Mode;
  simulation: Simulation | null;
  selected: string | null;
  onSelect: (id: string) => void;
  backup: string[];
  center: [number, number];
  radius: number;
  onPlace: (p: [number, number]) => void;
  showZone: boolean;
  showBridges: boolean;
  height?: string;
}
const hazardIcon = divIcon({
  className: "hazard-handle",
  html: '<span class="hazard-handle-dot" role="button" aria-label="Гамшгийн төвийг чирж зөө"></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});
function pointOf(e: LeafletEvent): [number, number] {
  const ll = (e.target as LeafletMarker).getLatLng();
  return [Number(ll.lat.toFixed(4)), Number(ll.lng.toFixed(4))];
}
function HazardZone({
  center,
  radiusKm,
  onPlace,
}: {
  center: [number, number];
  radiusKm: number;
  onPlace: (p: [number, number]) => void;
}) {
  const circleRef = useRef<LeafletCircle>(null);
  return (
    <>
      <Circle
        ref={circleRef}
        center={center}
        radius={radiusKm * 1000}
        interactive={false}
        pathOptions={{
          color: "#d19c69",
          fillColor: "#d19c69",
          fillOpacity: 0.14,
          dashArray: "5 5",
          weight: 1.5,
        }}
      />
      <Marker
        position={center}
        draggable
        icon={hazardIcon}
        zIndexOffset={800}
        title="Гамшгийн төвийг чирж зөө"
        alt="Гамшгийн төв"
        eventHandlers={{
          drag(e) {
            circleRef.current?.setLatLng((e.target as LeafletMarker).getLatLng());
          },
          dragend(e) {
            onPlace(pointOf(e));
          },
        }}
      >
        <Tooltip>Чирж зөө</Tooltip>
      </Marker>
    </>
  );
}
function MapControl({
  moveHazard,
  onPlace,
  fitToken,
  roadRoutes,
}: {
  moveHazard: boolean;
  onPlace: (p: [number, number]) => void;
  fitToken: number;
  roadRoutes: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!roadRoutes) return;
    const credit =
      'Routes: <a href="https://project-osrm.org/">OSRM</a> / <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>';
    map.attributionControl.addAttribution(credit);
    return () => {
      map.attributionControl.removeAttribution(credit);
    };
  }, [map, roadRoutes]);
  useMapEvents({
    click(e) {
      if (moveHazard)
        onPlace([
          Number(e.latlng.lat.toFixed(4)),
          Number(e.latlng.lng.toFixed(4)),
        ]);
    },
  });
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(
      [
        [41.1, 87.2],
        [52.4, 120.4],
      ],
      { padding: [25, 25] },
    );
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, fitToken]);
  return (
    <div className="map-zoom">
      <button
        title="Томруулах"
        aria-label="Томруулах"
        onClick={() => map.zoomIn()}
      >
        <Plus size={17} />
      </button>
      <button
        title="Жижигрүүлэх"
        aria-label="Жижигрүүлэх"
        onClick={() => map.zoomOut()}
      >
        <Minus size={17} />
      </button>
      <span />
      <button
        title="Монголд төвлөрүүлэх"
        aria-label="Монголд төвлөрүүлэх"
        onClick={() =>
          map.fitBounds([
            [41.1, 87.2],
            [52.4, 120.4],
          ])
        }
      >
        <LocateFixed size={17} />
      </button>
    </div>
  );
}
export default function NetworkMap(p: Props) {
  const [boundary, setBoundary] = useState<GeoJsonObject | null>(null);
  const [tiles, setTiles] = useState(true);
  const [fitToken, setFitToken] = useState(0);
  useEffect(() => {
    fetch("/mongolia.geojson")
      .then((r) => r.json())
      .then(setBoundary)
      .catch(() => setBoundary(null));
  }, []);
  const failed = new Set(p.simulation?.failed_edges || []);
  const affected = new Set(p.simulation?.affected_nodes || []);
  const names = Object.fromEntries(
    p.topology.nodes.map((n) => [n.id, n.name_mn]),
  );
  function line(e: Edge) {
    const isFailed = failed.has(e.id),
      isBackup = p.backup.includes(e.id),
      selected = p.selected === e.id;
    const bridge = p.showBridges && p.topology.metrics.bridges.includes(e.id);
    const color = isFailed
      ? "#ed8276"
      : isBackup
        ? "#e3c27d"
        : selected
          ? "#e4e9df"
          : bridge
            ? "#d87870"
            : MODE_COLORS[p.mode];
    return (
      <Polyline
        key={e.id}
        positions={e.geometry}
        pathOptions={{
          color,
          weight: isBackup ? 4 : selected ? 3.5 : p.mode === "mesh" ? 1 : 2,
          opacity:
            p.mode === "mesh" && !isFailed && !selected
              ? 0.15
              : isFailed
                ? 0.9
                : 0.8,
          dashArray: isFailed ? "5 7" : bridge ? "7 4" : undefined,
          className: isBackup ? "backup-route" : isFailed ? "failed-route" : "",
        }}
        eventHandlers={{
          click: (ev) => {
            ev.originalEvent.stopPropagation();
            p.onSelect(e.id);
          },
        }}
      >
        <Tooltip sticky>
          <b>
            {names[e.source]} → {names[e.target]}
          </b>
          <br />
          {format(e.distance_km, 1)} км ·{" "}
          {isFailed
            ? "ТАСАРСАН"
            : e.theoretical
              ? "Онолын холбоос"
              : distanceLabel(e)}
        </Tooltip>
      </Polyline>
    );
  }
  function node(n: NetworkNode) {
    const core = n.id === "ub",
      isAffected = affected.has(n.id),
      selected = p.selected === n.id;
    return (
      <CircleMarker
        key={n.id}
        center={[n.lat, n.lon]}
        radius={core ? 7 : selected ? 6 : 4}
        pathOptions={{
          color: isAffected
            ? "#e98c7a"
            : selected
              ? "#f1eedf"
              : core
                ? "#d1dfb2"
                : "#94afba",
          fillColor: isAffected ? "#a05046" : core ? "#b9cf92" : "#182d31",
          fillOpacity: 1,
          weight: core ? 2.5 : 1.6,
        }}
        eventHandlers={{
          click: (ev) => {
            ev.originalEvent.stopPropagation();
            p.onSelect(n.id);
          },
        }}
      >
        <Tooltip
          permanent
          direction={
            n.id === "bulgan"
              ? "left"
              : n.id === "darkhan"
                ? "right"
                : n.id === "zuunmod"
                  ? "bottom"
                  : "top"
          }
          offset={
            n.id === "bulgan"
              ? [-5, 0]
              : n.id === "darkhan"
                ? [5, 0]
                : [0, core ? -5 : -2]
          }
          className={`city-label ${core ? "core-label" : ""} ${isAffected ? "affected-label" : ""}`}
        >
          {n.name_mn}
          {core && <span> · CORE</span>}
        </Tooltip>
      </CircleMarker>
    );
  }
  return (
    <div
      className={`network-map ${p.showZone ? "hazard-map" : ""}`}
      style={{ height: p.height || "490px" }}
    >
      <MapContainer
        center={[46.8, 103.5]}
        zoom={5}
        minZoom={4}
        maxZoom={12}
        zoomControl={false}
        scrollWheelZoom
        attributionControl
      >
        {tiles && (
          <TileLayer
            url={
              import.meta.env.VITE_TILE_URL ||
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
        )}
        {boundary && (
          <GeoJSON
            data={boundary}
            style={{
              color: "#7e8976",
              weight: 1.2,
              opacity: 0.6,
              fillColor: "#29332d",
              fillOpacity: tiles ? 0.22 : 0.65,
            }}
          />
        )}
        {p.topology.edges
          .filter((e) => !failed.has(e.id) && !p.backup.includes(e.id))
          .map(line)}
        {p.topology.edges
          .filter((e) => failed.has(e.id) || p.backup.includes(e.id))
          .map(line)}
        {p.showZone && (
          <HazardZone
            center={p.center}
            radiusKm={p.radius}
            onPlace={p.onPlace}
          />
        )}
        {p.topology.nodes.map(node)}
        <MapControl
          moveHazard={p.showZone}
          onPlace={p.onPlace}
          fitToken={fitToken}
          roadRoutes={p.topology.edges.some(
            (e) => e.distance_source === "osm_road_route",
          )}
        />
      </MapContainer>
      <div className="map-location">
        <span className="live-dot" /> МОНГОЛ УЛС{" "}
        <span className="map-divider" /> EPSG:3857{" "}
        <button
          onClick={() => setFitToken((x) => x + 1)}
          title="Сүлжээнд төвлөрүүлэх"
          aria-label="Сүлжээнд төвлөрүүлэх"
        >
          <Crosshair size={13} />
        </button>
      </div>
      <button
        className={`map-layer ${!tiles ? "active" : ""}`}
        onClick={() => setTiles(!tiles)}
        title="Суурь зургийг солих"
      >
        <Layers3 size={16} />
        <span>Суурь зураг</span>
      </button>
      {p.showZone && (
        <div className="placing-notice hazard-hint">
          <MousePointer2 size={14} /> Тойргийн төвийг чирж зөө, эсвэл хоосон
          газар дар. Дараа нь «Симуляц эхлүүлэх».
        </div>
      )}
      <div className="map-legend">
        <span>
          <i style={{ background: MODE_COLORS[p.mode] }} />
          Идэвхтэй чиглэл
        </span>
        <span>
          <i className="legend-node" />
          Сүлжээний зангилаа
        </span>
        <span>
          <i className="legend-failed" />
          Тасарсан
        </span>
        <span>
          <i style={{ background: "#e3c27d" }} />
          Нөөц зам
        </span>
      </div>
      <div className="map-scale-label">
        {p.mode === "mesh"
          ? "Онолын шууд холбоос · авто зам биш"
          : p.topology.edges.every(
                (e) => e.distance_source === "osm_road_route",
              )
            ? "OSM / OSRM авто зам дагасан маршрут"
            : "Чиглэл бүрийн уртын эх сурвалжийг шалгана уу"}
      </div>
    </div>
  );
}
