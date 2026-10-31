import {
  ArrowDownRight,
  ArrowRight,
  Cable,
  Check,
  ChevronRight,
  CircleDot,
  MapPin,
  RadioTower,
  Scissors,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import type { Edge, NetworkNode, Simulation, Topology } from "./types";
import { distanceLabel, format, money } from "./types";
interface Props {
  topology: Topology;
  selected: string | null;
  simulation: Simulation | null;
  onSelect: (s: string | null) => void;
  onCut: (id: string) => void;
  onRestore: (id: string) => void;
  busy: boolean;
}
export default function Inspector({
  topology,
  selected,
  simulation,
  onSelect,
  onCut,
  onRestore,
  busy,
}: Props) {
  const node: NetworkNode | undefined = topology.nodes.find(
    (n) => n.id === selected,
  );
  const edge: Edge | undefined = topology.edges.find((e) => e.id === selected);
  const names = Object.fromEntries(
    topology.nodes.map((n) => [n.id, n.name_mn]),
  );
  const failed = simulation?.failed_edges.includes(selected || "");
  const m = simulation?.after_metrics || topology.metrics;
  return (
    <aside className={`inspector ${selected ? "has-selection" : ""}`}>
      <div className="panel-heading">
        <span>{selected ? "ДЭЛГЭРЭНГҮЙ МЭДЭЭЛЭЛ" : "СҮЛЖЭЭНИЙ ТӨЛӨВ"}</span>
        {selected ? (
          <button onClick={() => onSelect(null)} aria-label="Сонголт хаах">
            <X size={15} />
          </button>
        ) : (
          <RadioTower size={16} />
        )}
      </div>
      {node ? (
        <>
          <div className="inspector-icon">
            <MapPin size={24} />
          </div>
          <div className="eyebrow">
            {node.node_type === "core" ? "ҮНДСЭН ЗАНГИЛАА" : "АЙМГИЙН ЗАНГИЛАА"}
          </div>
          <h3>{node.name_mn}</h3>
          <p className="muted small">
            {node.name_en} · {node.province}
          </p>
          <div className="status-pill">
            <span className="live-dot" />
            {simulation?.affected_nodes.includes(node.id)
              ? "Холболт тасарсан"
              : "Холбогдсон"}
          </div>
          <dl className="details">
            <div>
              <dt>Координат</dt>
              <dd>
                {node.lat.toFixed(3)}, {node.lon.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Traffic demand</dt>
              <dd>{format(node.traffic_demand_mbps)} Mbps</dd>
            </div>
            <div>
              <dt>Шууд холболт</dt>
              <dd>
                {
                  topology.edges.filter((e) =>
                    [e.source, e.target].includes(node.id),
                  ).length
                }{" "}
                чиглэл
              </dd>
            </div>
          </dl>
          <div className="section-label">ХОЛБОГДСОН ЧИГЛЭЛҮҮД</div>
          <div className="link-list">
            {topology.edges
              .filter((e) => [e.source, e.target].includes(node.id))
              .map((e) => (
                <button key={e.id} onClick={() => onSelect(e.id)}>
                  <Cable size={14} />
                  <span>
                    {names[e.source === node.id ? e.target : e.source]}
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
          </div>
        </>
      ) : edge ? (
        <>
          <div className="inspector-icon">
            <Cable size={24} />
          </div>
          <div className="eyebrow">
            {edge.theoretical
              ? "ОНОЛЫН ХОЛБООС"
              : edge.id.toUpperCase() +
                (edge.distance_source === "osm_road_route"
                  ? " · АВТО ЗАМ"
                  : " · ТООЦООЛСОН")}
          </div>
          <h3 className="edge-title">
            {names[edge.source]}
            <ArrowDownRight size={17} />
            {names[edge.target]}
          </h3>
          <div className={`status-pill ${failed ? "danger" : ""}`}>
            <span className="live-dot" />
            {failed
              ? "Тасарсан"
              : topology.metrics.bridges.includes(edge.id)
                ? "Критик гүүр холбоос"
                : "Идэвхтэй загвар"}
          </div>
          <dl className="details">
            <div>
              <dt>
                {edge.distance_source === "osm_road_route"
                  ? "Авто замын урт"
                  : "Кабелийн урт"}
              </dt>
              <dd>{format(edge.distance_km, 1)} км</dd>
            </div>
            <div>
              <dt>CAPEX тооцоо</dt>
              <dd>{money(edge.cost_usd)}</dd>
            </div>
            <div>
              <dt>Propagation delay</dt>
              <dd>{format(edge.latency_ms, 2)} ms</dd>
            </div>
            <div>
              <dt>Эрсдэлийн оноо</dt>
              <dd>{format(edge.risk_score * 100)} / 100</dd>
            </div>
            <div>
              <dt>Газрын гадарга</dt>
              <dd>
                {{
                  mountain: "Уулархаг",
                  steppe: "Тал хээр",
                  gobi: "Говь",
                  theoretical: "Онолын",
                }[edge.terrain] || edge.terrain}
              </dd>
            </div>
            <div>
              <dt>Коридор</dt>
              <dd>{edge.corridor_id}</dd>
            </div>
            <div>
              <dt>SRLG</dt>
              <dd>{edge.shared_risk_group || "—"}</dd>
            </div>
          </dl>
          <dl className="details route-provenance">
            <div>
              <dt>Уртын эх сурвалж</dt>
              <dd>{distanceLabel(edge)}</dd>
            </div>
            {edge.routing && (
              <>
                <div>
                  <dt>Авсан огноо</dt>
                  <dd>
                    {new Date(edge.routing.fetched_at).toLocaleDateString(
                      "mn-MN",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Geometry tolerance</dt>
                  <dd>{edge.routing.geometry_tolerance_m} m</dd>
                </div>
              </>
            )}
          </dl>
          {failed ? (
            <button
              className="button primary full"
              disabled={busy}
              onClick={() => onRestore(edge.id)}
            >
              <Undo2 size={15} />
              Холбоосыг сэргээх
            </button>
          ) : (
            <button
              className="button danger-button full"
              disabled={busy}
              onClick={() => onCut(edge.id)}
            >
              <Scissors size={15} />
              Кабель таслах
            </button>
          )}
          <p className="fine-print">
            {edge.distance_source === "osm_road_route"
              ? "OpenStreetMap / OSRM авто зам дагасан урт. Асфальтан гадарга, бодит кабель тавих боломж баталгаажаагүй."
              : edge.distance_source === "validated_route"
                ? "Баталгаажуулсан урт: " + edge.validation_reference
                : edge.theoretical
                  ? "Онолын шууд зай. Бодит авто замын маршрут биш."
                  : "Урт = haversine × газрын гадаргын коэффициент. Бодит хэмжилт биш."}
          </p>
        </>
      ) : (
        <>
          <div
            className={`health-orbit ${m.fault_tolerant ? "healthy" : "warning"}`}
          >
            <ShieldCheck size={30} />
            <span />
          </div>
          <div className="health-text">
            <h3>
              {m.fault_tolerant
                ? "Сүлжээ найдвартай"
                : m.connected
                  ? "Сүлжээ холбогдсон"
                  : "Холболт доголдсон"}
            </h3>
            <p>
              {m.fault_tolerant
                ? "Нэг холбоосын тасалдлыг тэсвэрлэнэ"
                : m.connected
                  ? "Нэг тасалдлын хамгаалалт хангалтгүй"
                  : "Сэргээх ажиллагаа шаардлагатай"}
            </p>
          </div>
          <div className="availability">
            <span>Зангилааны хүртээмж</span>
            <b>
              {format(simulation?.availability_pct ?? 100, 1)}
              <small>%</small>
            </b>
            <div className="progress-track">
              <div
                style={{ width: `${simulation?.availability_pct ?? 100}%` }}
              />
            </div>
            <small>Улаанбаатарт холбогдох зангилаанууд</small>
          </div>
          <dl className="details">
            <div>
              <dt>
                <CircleDot size={13} />
                Идэвхтэй холбоос
              </dt>
              <dd>
                {m.edge_count} / {topology.metrics.edge_count}
              </dd>
            </div>
            <div>
              <dt>
                <Cable size={13} />
                Тасарсан холбоос
              </dt>
              <dd className={simulation?.failed_edges.length ? "text-red" : ""}>
                {simulation?.failed_edges.length || 0}
              </dd>
            </div>
            <div>
              <dt>
                <TriangleAlert size={13} />
                Критик гүүр
              </dt>
              <dd>{m.bridge_count}</dd>
            </div>
            <div>
              <dt>
                <Check size={13} />
                Connected components
              </dt>
              <dd>{m.components}</dd>
            </div>
          </dl>
          <div className="inspector-hint">
            <MapPin size={17} />
            <p>
              Газрын зураг дээрх зангилаа эсвэл холбоосыг сонгож дэлгэрэнгүй
              мэдээлэл үзнэ үү.
            </p>
          </div>
          <button className="text-button full" onClick={() => onSelect("ub")}>
            Үндсэн зангилааг харах
            <ArrowRight size={14} />
          </button>
        </>
      )}
      <div className="inspector-footer">
        <span className="live-dot" /> DETERMINISTIC MODEL <span>v1.0</span>
      </div>
    </aside>
  );
}
