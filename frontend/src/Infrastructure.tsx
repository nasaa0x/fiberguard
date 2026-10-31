import { useMemo, useState } from "react";
import {
  Cable,
  Route as RoadIcon,
  RefreshCw,
  Download,
  Edit3,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api, download } from "./api";
import Modal from "./Modal";
import type { Edge, NetworkNode } from "./types";
import { distanceLabel, format, money } from "./types";
interface Props {
  nodes: NetworkNode[];
  edges: Edge[];
  onChange: () => Promise<void>;
  onError: (s: string) => void;
}
export default function Infrastructure({
  nodes,
  edges,
  onChange,
  onError,
}: Props) {
  const [tab, setTab] = useState<"nodes" | "edges">("nodes");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [formError, setFormError] = useState("");
  const [geometryText, setGeometryText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [routingEdge, setRoutingEdge] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const names = Object.fromEntries(nodes.map((n) => [n.id, n.name_mn]));
  const filtered = useMemo(
    () =>
      (tab === "nodes" ? nodes : edges).filter((n) =>
        JSON.stringify(n).toLowerCase().includes(search.toLowerCase()),
      ),
    [tab, nodes, edges, search],
  );
  function create() {
    setEditing(false);
    setFormError("");
    setGeometryText("");
    setDraft(
      tab === "nodes"
        ? {
            id: "",
            name_mn: "",
            name_en: "",
            province: "",
            lat: 47,
            lon: 105,
            node_type: "regional",
            traffic_demand_mbps: 500,
          }
        : {
            id: "",
            source: nodes[0]?.id || "",
            target: nodes[1]?.id || "",
            terrain: "steppe",
            risk_score: 0.3,
            disaster_exposure: 0.4,
            corridor_id: "PLAN-NEW",
            shared_risk_group: "",
            status: "planned",
            distance_source: "estimated_haversine_detour",
          },
    );
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      setFormError("");
      const p = { ...draft };
      if (tab === "edges" && editing) {
        try {
          p.geometry = JSON.parse(geometryText);
        } catch {
          throw new Error("Geometry must be valid JSON: [[lat,lon], ...].");
        }
      }
      if (tab === "edges" && !p.shared_risk_group) p.shared_risk_group = null;
      await api(
        `/network/${tab}${editing ? "/" + draft.id : ""}`,
        p,
        editing ? "PATCH" : "POST",
      );
      setDraft(null);
      await onChange();
    } catch (e) {
      setFormError((e as Error).message);
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/network/${tab}/${deleting}`, undefined, "DELETE");
      setDeleting(null);
      await onChange();
    } catch (e) {
      setFormError((e as Error).message);
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function fetchRoad(edge: Edge) {
    setRoutingEdge(edge.id);
    try {
      await api(`/network/edges/${edge.id}/road-route`, {});
      await onChange();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setRoutingEdge(null);
    }
  }
  const field = (key: string, label: string, type = "text") => (
    <label className="field-label" key={key}>
      {label}
      <input
        required={key !== "shared_risk_group" && key !== "validation_reference"}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={String(draft?.[key] ?? "")}
        disabled={editing && key === "id"}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
      />
    </label>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <label className="field-label" key={key}>
      {label}
      <select
        value={String(draft?.[key] ?? "")}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      >
        {options.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="panel infrastructure">
        <div className="data-toolbar">
          <div className="segmented">
            <button
              className={tab === "nodes" ? "active" : ""}
              onClick={() => setTab("nodes")}
            >
              <MapPin size={14} />
              Зангилаа <span>{nodes.length}</span>
            </button>
            <button
              className={tab === "edges" ? "active" : ""}
              onClick={() => setTab("edges")}
            >
              <Cable size={14} />
              Чиглэл <span>{edges.length}</span>
            </button>
          </div>
          <div className="data-actions">
            <label className="search-field">
              <Search size={15} />
              <input
                aria-label="Дэд бүтэц хайх"
                placeholder="Хайх…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              className="button icon-button"
              title="Датасет татах"
              aria-label="Датасет татах"
              onClick={() =>
                download(
                  "fiberguard-dataset.json",
                  JSON.stringify({ nodes, edges }, null, 2),
                )
              }
            >
              <Download size={16} />
            </button>
            <button className="button primary" onClick={create}>
              <Plus size={15} />
              Нэмэх
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(tab === "nodes"
                  ? [
                      "ID",
                      "Хот / City",
                      "Аймаг",
                      "Координат",
                      "Төрөл",
                      "Demand",
                    ]
                  : ["ID", "Чиглэл", "Урт · км", "CAPEX", "Эрсдэл", "Коридор"]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th>Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const n = item as NetworkNode,
                  e = item as Edge;
                return (
                  <tr key={item.id}>
                    <td className="mono muted">{item.id}</td>
                    {tab === "nodes" ? (
                      <>
                        <td>
                          <b>{n.name_mn}</b>
                          <small>{n.name_en}</small>
                        </td>
                        <td>{n.province}</td>
                        <td className="mono">
                          {n.lat.toFixed(3)}, {n.lon.toFixed(3)}
                        </td>
                        <td>
                          <span className="mini-tag neutral">
                            {n.node_type}
                          </span>
                        </td>
                        <td>{format(n.traffic_demand_mbps)} Mbps</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <b>
                            {names[e.source]} → {names[e.target]}
                          </b>
                          <small>{distanceLabel(e)}</small>
                        </td>
                        <td>{format(e.distance_km, 1)}</td>
                        <td>{money(e.cost_usd)}</td>
                        <td>{format(e.risk_score * 100)} / 100</td>
                        <td>
                          {e.corridor_id}
                          <small>{e.shared_risk_group}</small>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="table-actions">
                        {tab === "edges" && (
                          <button
                            disabled={
                              !!routingEdge ||
                              e.distance_source === "validated_route"
                            }
                            aria-label={`${e.id} авто замын маршрут авах`}
                            title={
                              e.distance_source === "validated_route"
                                ? "Баталгаажсан хэмжилтийг хамгаалсан"
                                : "OSM зам дагасан урт, geometry авах (cache ашиглана)"
                            }
                            onClick={() => void fetchRoad(e)}
                          >
                            {routingEdge === e.id ? (
                              <RefreshCw size={14} className="spin" />
                            ) : (
                              <RoadIcon size={14} />
                            )}
                          </button>
                        )}
                        <button
                          aria-label={`${item.id} засах`}
                          onClick={() => {
                            setEditing(true);
                            setFormError("");
                            setGeometryText(
                              JSON.stringify((item as Edge).geometry ?? []),
                            );
                            setDraft({ ...item });
                          }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          disabled={item.id === "ub"}
                          aria-label={`${item.id} устгах`}
                          onClick={() => {
                            setFormError("");
                            setDeleting(item.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-state">
              Хайлтад тохирох мэдээлэл олдсонгүй.
            </div>
          )}
        </div>
        <div className="data-footer">
          <span>{filtered.length} бичлэг</span>
          <span>
            Өөрчлөлт local authoring файлд хадгалагдана · Суурь датасет тусдаа
          </span>
        </div>
      </div>
      <div className="info-note">
        <MapPin size={17} />
        <span>
          Авто замын маршрут авах: чиглэлийн мөрөн дэх замын дүрсийг дарна.
          Уртыг болон geometry-г OSRM-ээс хамтад нь авна. Бүхэлдээ асфальт
          эсэхийг батлахгүй. Баталгаажсан урт оруулах: чиглэл засах → Distance
          source: Validated route → бодит км ба эх сурвалж. Geometry нь
          [latitude, longitude] цэгүүдийн жагсаалт. Зөвхөн баталгаажсан урт
          оруулсан нь бүх коридорыг баталгаажсан гэж үзэхгүй.
        </span>
      </div>
      {draft && (
        <Modal onClose={() => !busy && setDraft(null)} labelId="editor-title">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="modal-title">
              <h2 id="editor-title">
                {tab === "nodes" ? "Зангилаа" : "Шилэн кабелийн чиглэл"}{" "}
                {editing ? "засах" : "нэмэх"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Хаах"
              >
                <X size={18} />
              </button>
            </div>
            <>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
            </>
            <div className="form-grid">
              {field("id", "Unique ID")}
              {tab === "nodes" ? (
                <>
                  {field("name_mn", "Монгол нэр")}
                  {field("name_en", "English name")}
                  {field("province", "Аймаг")}
                  {field("lat", "Latitude", "number")}
                  {field("lon", "Longitude", "number")}
                  {select("node_type", "Зангилааны төрөл", [
                    ["regional", "Regional"],
                    ["core", "Core"],
                  ])}
                  {field(
                    "traffic_demand_mbps",
                    "Traffic demand · Mbps",
                    "number",
                  )}
                </>
              ) : (
                <>
                  {select(
                    "source",
                    "Эхлэх зангилаа",
                    nodes.map((n) => [n.id, n.name_mn]),
                  )}
                  {select(
                    "target",
                    "Хүрэх зангилаа",
                    nodes.map((n) => [n.id, n.name_mn]),
                  )}
                  {select("terrain", "Газрын гадарга", [
                    ["steppe", "Тал хээр"],
                    ["mountain", "Уулархаг"],
                    ["gobi", "Говь"],
                  ])}
                  {field("risk_score", "Terrain risk · 0–1", "number")}
                  {field(
                    "disaster_exposure",
                    "Disaster exposure · 0–1",
                    "number",
                  )}
                  {field("corridor_id", "Коридорын ID")}
                  {field("shared_risk_group", "SRLG (optional)")}
                  {select("status", "Төлөв", [
                    ["planned", "Planned"],
                    ["operational", "Operational"],
                  ])}
                  {select("distance_source", "Distance source", [
                    [
                      "estimated_haversine_detour",
                      "Estimated haversine × detour",
                    ],
                    ["validated_route", "Validated route"],
                    ...(draft.distance_source === "osm_road_route"
                      ? [
                          ["osm_road_route", "OSM авто замын маршрут"] as [
                            string,
                            string,
                          ],
                        ]
                      : []),
                  ])}
                  {draft.distance_source === "validated_route" && (
                    <>
                      {field("distance_km", "Баталгаажсан урт · км", "number")}
                      {field("cost_usd", "CAPEX estimate · USD", "number")}
                      {field(
                        "validation_reference",
                        "Баталгаажуулалтын эх сурвалж",
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {tab === "edges" && editing && (
              <label className="field-label geometry-field">
                Modeled geometry · [lat, lon]
                <textarea
                  value={geometryText}
                  readOnly={draft.distance_source === "osm_road_route"}
                  onChange={(e) => setGeometryText(e.target.value)}
                />
              </label>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="button"
                onClick={() => setDraft(null)}
              >
                Болих
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Хадгалж байна…" : "Хадгалах"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          onClose={() => !busy && setDeleting(null)}
          labelId="delete-title"
          className="confirm-modal"
        >
          <>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
          </>
          <h2 id="delete-title">{deleting} устгах уу?</h2>
          <p className="muted small">
            {tab === "nodes"
              ? "Зангилаа болон түүнтэй холбоотой чиглэлүүдийг устгана."
              : "Чиглэлийг төлөвлөлтийн графаас устгана."}{" "}
            Топологийн боломж өөрчлөгдөж болно.
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(null)}>
              Болих
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={remove}
            >
              Устгах
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
