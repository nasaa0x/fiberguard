import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Cable,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  Earth,
  ExternalLink,
  FileChartColumn,
  GitBranch,
  LayoutDashboard,
  Menu,
  Network,
  PanelLeftClose,
  RadioTower,
  RefreshCw,
  Shield,
  ShieldCheck,
  TriangleAlert,
  Waves,
  X,
} from "lucide-react";
import { api, download } from "./api";
import NetworkMap from "./NetworkMap";
import Inspector from "./Inspector";
import Modal from "./Modal";
import Infrastructure from "./Infrastructure";
import {
  Comparison,
  DisasterControls,
  Optimizer,
  Reports,
  RouteAnalysis,
  SimulationResults,
} from "./Workspaces";
import type { Scenario } from "./Workspaces";
import type {
  Bundle,
  Edge,
  Mode,
  RouteResult,
  Simulation,
  View,
  Weights,
} from "./types";
import {
  DEFAULT_WEIGHTS,
  format,
  MODE_COLORS,
  MODE_NAMES,
  money,
} from "./types";

const NAV: { id: View; name: string; icon: typeof Network; sub?: string }[] = [
  { id: "overview", name: "Ерөнхий төлөв", icon: LayoutDashboard },
  { id: "map", name: "Сүлжээний зураг", icon: Earth },
  { id: "optimizer", name: "Топологи оновчлол", icon: GitBranch },
  { id: "disaster", name: "Гамшгийн симуляц", icon: Waves, sub: "LAB" },
  { id: "routes", name: "Замын шинжилгээ", icon: Activity },
  { id: "data", name: "Дэд бүтцийн өгөгдөл", icon: Database },
  { id: "reports", name: "Тайлан, экспорт", icon: FileChartColumn },
];
const TITLES: Record<View, [string, string]> = {
  overview: [
    "Сүлжээний ерөнхий төлөв",
    "Монголын шилэн кабелийн сүлжээний найдвартай байдал, холболт ба эрсдэлийн нэгдсэн харагдац.",
  ],
  map: [
    "Сүлжээний газрын зураг",
    "Зангилаа, боломжит коридор болон нөөц чиглэлүүдийг газарзүйн орчинд судлаарай.",
  ],
  optimizer: [
    "Топологийн оновчлол",
    "Хөрөнгө оруулалт ба сүлжээний тэсвэрийн бодит харьцуулалт.",
  ],
  disaster: [
    "Гамшгийн удирдлагын төв",
    "Нэг тасалдлаас бүс нутгийн гамшиг хүртэл — сүлжээний хязгаарыг туршаарай.",
  ],
  routes: [
    "Зам ба latency шинжилгээ",
    "Тасалдлын өмнөх болон дараах хамгийн богино замыг харьцуулна.",
  ],
  data: [
    "Дэд бүтцийн өгөгдөл",
    "Хот, зангилаа болон төлөвлөлтийн чиглэлүүдийн ил тод, засварлах боломжтой сан.",
  ],
  reports: [
    "Тайлан ба экспорт",
    "Тооцоолол, симуляц болон таамаглалаа дахин ашиглах боломжтой хэлбэрээр хадгалаарай.",
  ],
};
function initialView(): View {
  const h = location.hash.slice(1);
  return NAV.some((n) => n.id === h) ? (h as View) : "overview";
}
export default function App() {
  const [view, setView] = useState<View>(initialView);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [candidates, setCandidates] = useState<Edge[]>([]);
  const [mode, setMode] = useState<Mode>("optimized");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [appliedWeights, setAppliedWeights] =
    useState<Weights>(DEFAULT_WEIGHTS);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [scenario, setScenario] = useState<Scenario>("flood");
  const [center, setCenter] = useState<[number, number]>([47.918, 106.917]);
  const [radius, setRadius] = useState(100);
  const [severity, setSeverity] = useState(1);
  const [group, setGroup] = useState("central-trunk");
  const [showBridges, setShowBridges] = useState(false);
  const [notice, setNotice] = useState("");
  const navigate = useCallback((v: View) => {
    setView(v);
    location.hash = v;
    setSidebar(false);
  }, []);
  useEffect(() => {
    const listener = () => setView(initialView());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, e] = await Promise.all([
        api<Bundle>("/network/topologies"),
        api<{ edges: Edge[] }>("/network/edges"),
      ]);
      setBundle(b);
      setCandidates(e.edges);
      setAppliedWeights(DEFAULT_WEIGHTS);
      setSimulation(null);
      setRouteResult(null);
      setSelected(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const topology = bundle?.topologies[mode];
  const chooseMode = (m: Mode) => {
    setMode(m);
    setSimulation(null);
    setSelected(null);
    setRouteResult(null);
    setNotice(
      `${MODE_NAMES[m]} топологи сонголоо. Симуляцын төлөв шинэчлэгдлээ.`,
    );
  };
  const m = simulation?.after_metrics || topology?.metrics;
  async function operation(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cut(id: string) {
    void operation(async () => {
      const s = await api<Simulation>("/network/simulate-cut", {
        topology: mode,
        edge_id: id,
        failed_edges: simulation?.failed_edges || [],
        weights: appliedWeights,
      });
      setSimulation(s);
      setRouteResult(null);
      setNotice(
        `${id.toUpperCase()} тасарлаа · ${s.affected_nodes.length} хот тусгаарлагдсан`,
      );
    });
  }
  function reset() {
    void operation(async () => {
      await api("/network/reset", { topology: mode, weights: appliedWeights });
      setSimulation(null);
      setRouteResult(null);
      setNotice("Бүх холбоос сэргээгдлээ.");
    });
  }
  function restore(id: string) {
    void operation(async () => {
      const remaining = (simulation?.failed_edges || []).filter(
        (i) => i !== id,
      );
      if (!remaining.length) {
        setSimulation(null);
        setRouteResult(null);
        return;
      }
      const s = await api<Simulation>("/network/simulate-cut", {
        topology: mode,
        edge_id: remaining[0],
        failed_edges: remaining.slice(1),
        weights: appliedWeights,
      });
      setSimulation(s);
      setRouteResult(null);
      setNotice(`${id.toUpperCase()} сэргээгдлээ.`);
    });
  }
  function runDisaster() {
    if (scenario === "cut") {
      if (selected && topology?.edges.some((e) => e.id === selected))
        cut(selected);
      return;
    }
    void operation(async () => {
      const s = await api<Simulation>("/network/simulate-disaster", {
        topology: mode,
        scenario,
        center,
        radius_km: radius,
        severity,
        shared_risk_group: groups.includes(group) ? group : groups[0],
        failed_edges: simulation?.failed_edges || [],
        weights: appliedWeights,
      });
      setSimulation(s);
      setRouteResult(null);
      setNotice(
        `${s.failed_edges.length} холбоос тасарсан · Хүртээмж ${s.availability_pct}%`,
      );
    });
  }
  function optimize() {
    void operation(async () => {
      const result = await api<{
        topology: NonNullable<typeof topology>;
        weights: Weights;
      }>("/network/optimize", { mode: "risk", weights });
      setBundle((b) =>
        b
          ? { ...b, topologies: { ...b.topologies, risk: result.topology } }
          : b,
      );
      setAppliedWeights(result.weights);
      setMode("risk");
      setSimulation(null);
      setRouteResult(null);
      setSelected(null);
      setNotice("Эрсдэлд суурилсан топологи шинэчлэгдлээ.");
    });
  }
  const backup =
    routeResult?.after.edges || simulation?.after_route?.edges || [];
  const groups = [
    ...new Set(
      (topology?.edges || [])
        .map((e) => e.shared_risk_group)
        .filter((s): s is string => !!s),
    ),
  ].sort();
  const selectedEdge = topology?.edges.some((e) => e.id === selected)
    ? selected
    : null;
  const mapProps =
    topology && !topology.infeasible
      ? {
          topology,
          mode,
          simulation,
          selected,
          onSelect: setSelected,
          backup,
          center,
          radius: radius * severity,
          onPlace: (p: [number, number]) => {
            setCenter(p);
          },
          showZone:
            view === "disaster" &&
            (scenario === "flood" || scenario === "earthquake"),
          showBridges,
        }
      : null;
  const exportCurrent = () =>
    download(
      "fiberguard-snapshot.json",
      JSON.stringify(
        {
          project: "FiberGuard Mongolia",
          exported_at: new Date().toISOString(),
          topology,
          simulation,
          assumptions: bundle?.metadata,
          weights: appliedWeights,
        },
        null,
        2,
      ),
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            <Shield size={29} />
            <span>F</span>
          </span>
          <span>
            FiberGuard<small>M O N G O L I A</small>
          </span>
        </a>
        <div className="workspace-select">
          <span className="workspace-avatar">
            <Network size={18} />
          </span>
          <span>
            Монголын сүлжээ<small>Дижитал ихэр · v1.0</small>
          </span>
          <span className="mini-tag neutral">MN</span>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.sub && <small>{n.sub}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="model-label">
            <span className="live-dot" />
            <span>
              Academic research model
              <small>Бодит өгөгдлөөр баяжуулах боломжтой</small>
            </span>
          </div>
          <button className="help-button" onClick={() => setShowHelp(true)}>
            <CircleHelp size={17} />
            <span>Тусламж ба аргачлал</span>
            <ExternalLink size={12} />
          </button>
          <div className="user-info">
            <div className="user-avatar">FG</div>
            <span>
              Судлаачийн орчин<small>Local workspace</small>
            </span>
            <PanelLeftClose size={15} />
          </div>
        </div>
      </aside>
      {sidebar && (
        <button
          className="sidebar-scrim"
          onClick={() => setSidebar(false)}
          aria-label="Цэс хаах"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Цэс нээх"
              onClick={() => setSidebar(!sidebar)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{NAV.find((n) => n.id === view)?.name}</b>
          </div>
          <div className="topbar-right">
            <span className="api-status">
              <span className={`live-dot ${error ? "red-dot" : ""}`} />
              {bundle ? "API холбогдсон" : "API холбож байна"}
            </span>
            <span className="topbar-separator" />
            <button
              aria-label="Мэдэгдэл"
              title="Сүүлийн мэдэгдэл"
              onClick={() =>
                setNotice(
                  simulation
                    ? `${simulation.failed_edges.length} холбоос тасарсан. ${simulation.affected_nodes.length} хот тусгаарлагдсан.`
                    : "Симуляцын тасалдал байхгүй. Бүх тооцоо deterministic.",
                )
              }
            >
              <Bell size={17} />
            </button>
            <span className="top-avatar">Н</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow page-eyebrow">
                <span /> NETWORK INTELLIGENCE PLATFORM
              </div>
              <h1>{TITLES[view][0]}</h1>
              <p>{TITLES[view][1]}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button refresh-button"
                onClick={() => void load()}
                disabled={busy || loading}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                <span>Шинэчлэх</span>
              </button>
              <button
                className="button"
                onClick={exportCurrent}
                disabled={!bundle}
              >
                <ArrowDownToLine size={14} />
                <span>Экспорт</span>
              </button>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={17} />
              <div>
                <b>Үйлдлийг гүйцэтгэж чадсангүй</b>
                <span>{error}</span>
              </div>
              <button onClick={() => setError("")} aria-label="Алдаа хаах">
                <X size={15} />
              </button>
            </div>
          )}
          {loading && !bundle ? (
            <div className="loading-screen">
              <RefreshCw className="spin" size={28} />
              <h3>Сүлжээний загварыг тооцоолж байна</h3>
              <p>
                22 зангилаа · MST · 2-edge augmentation · disaster stress suite
              </p>
            </div>
          ) : !bundle ? (
            <div className="panel empty-state">
              <RadioTower size={30} />
              <h3>API холболт хүлээгдэж байна</h3>
              <p>
                Backend-ийг <code>python -m backend.app</code> командаар
                ажиллуулаад дахин оролдоно уу.
              </p>
              <button className="button primary" onClick={() => void load()}>
                Дахин холбох
              </button>
            </div>
          ) : (
            <>
              {candidates.length > 0 && (
                <div className="road-data-banner">
                  <Cable size={15} />
                  <strong>
                    {candidates.every(
                      (e) => e.distance_source === "osm_road_route",
                    )
                      ? "Авто зам дагасан тооцоо"
                      : "Уртын өгөгдлийн эх сурвалж"}
                  </strong>
                  <span>
                    {
                      candidates.filter(
                        (e) => e.distance_source === "osm_road_route",
                      ).length
                    }{" "}
                    / {candidates.length} чиглэл · OpenStreetMap / OSRM
                  </span>
                  <button onClick={() => navigate("data")}>
                    Өгөгдөл харах <ArrowRight size={12} />
                  </button>
                </div>
              )}
              {m && (
                <div className="metrics-row">
                  {[
                    {
                      label: "СҮЛЖЭЭНИЙ ЗАНГИЛАА",
                      value: format(m.node_count),
                      unit: "хот",
                      icon: Network,
                      sub:
                        m.node_count === 22
                          ? "21 аймаг + Улаанбаатар"
                          : "Засварласан төлөвлөлтийн граф",
                      color: "",
                    },
                    {
                      label: "НИЙТ КАБЕЛИЙН УРТ",
                      value: format(topology!.metrics.distance_km),
                      unit: "км",
                      icon: Cable,
                      sub: simulation
                        ? `${m.edge_count} / ${topology!.metrics.edge_count} идэвхтэй холбоос`
                        : `${m.edge_count} ${mode === "mesh" ? "онолын" : "загварын"} холбоос`,
                      color: "",
                    },
                    {
                      label: "КРИТИК ГҮҮР",
                      value: format(m.bridge_count),
                      unit: "холбоос",
                      icon: GitBranch,
                      sub: m.bridge_count
                        ? "Тасалдлын эрсдэлтэй"
                        : "Гүүр холбоос байхгүй",
                      color: m.bridge_count ? "red" : "green",
                    },
                    {
                      label: "1-FAULT TOLERANCE",
                      value: m.fault_tolerant ? "Хамгаалагдсан" : "Эмзэг",
                      unit: "",
                      icon: ShieldCheck,
                      sub: `${format(m.single_edge_survival_pct)}% single-edge survival`,
                      color: m.fault_tolerant ? "green" : "amber",
                    },
                    {
                      label: "CAPEX ТООЦОО",
                      value: money(topology!.metrics.cost_usd),
                      unit: "USD",
                      icon: Database,
                      sub: "Тооцоолсон хөрөнгө оруулалт",
                      color: "",
                    },
                    {
                      label: "MAX MODELED RTT",
                      value: format(m.max_modeled_rtt_ms, 1),
                      unit: "ms",
                      icon: Activity,
                      sub:
                        m.max_modeled_rtt_ms == null
                          ? "Зарим хот хүрэх боломжгүй"
                          : m.below_50ms
                            ? "50 ms босгоос доогуур"
                            : "50 ms босгоос давсан",
                      color: m.below_50ms ? "green" : "amber",
                    },
                  ].map((c) => (
                    <div className={`metric ${c.color}`} key={c.label}>
                      <div className="metric-label">
                        {c.label}
                        <c.icon size={14} />
                      </div>
                      <div
                        className={`metric-value ${c.value.length > 10 ? "text-value" : ""}`}
                      >
                        {c.value}
                        <span>{c.unit}</span>
                      </div>
                      <div className="metric-sub">
                        {c.color === "green" && <span className="live-dot" />}
                        {c.sub}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(view === "overview" ||
                view === "map" ||
                view === "routes" ||
                view === "disaster") && (
                <>
                  {view === "routes" && topology && !topology.infeasible && (
                    <RouteAnalysis
                      key={mode}
                      topology={topology}
                      mode={mode}
                      weights={appliedWeights}
                      simulation={simulation}
                      onResult={setRouteResult}
                      onError={setError}
                      busy={busy}
                      setBusy={setBusy}
                    />
                  )}
                  <div className="network-toolbar">
                    <div className="map-title">
                      <span className="live-dot" />
                      <h2>
                        {view === "disaster"
                          ? "Гамшгийн нөлөөллийн зураг"
                          : "Үндэсний сүлжээний зураг"}
                      </h2>
                      <span className="mini-tag neutral">LIVE MODEL</span>
                    </div>
                    <div
                      className="topology-switch"
                      aria-label="Топологи сонгох"
                    >
                      {(["mst", "optimized", "risk", "mesh"] as Mode[]).map(
                        (t) => (
                          <button
                            key={t}
                            className={mode === t ? "active" : ""}
                            onClick={() => chooseMode(t)}
                          >
                            <i style={{ background: MODE_COLORS[t] }} />
                            {MODE_NAMES[t]}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  {mapProps ? (
                    <div
                      className={`map-workspace ${view === "disaster" ? "disaster-workspace" : ""}`}
                    >
                      {view === "disaster" && (
                        <DisasterControls
                          scenario={scenario}
                          setScenario={setScenario}
                          center={center}
                          radius={radius}
                          setRadius={setRadius}
                          severity={severity}
                          setSeverity={setSeverity}
                          group={
                            groups.includes(group) ? group : groups[0] || ""
                          }
                          setGroup={setGroup}
                          groups={groups}
                          busy={busy}
                          onRun={runDisaster}
                          onReset={reset}
                          selectedEdge={selectedEdge}
                        />
                      )}
                      <div className="map-panel">
                        <div className="map-panel-header">
                          <span>
                            <i
                              className="small-square"
                              style={{ background: MODE_COLORS[mode] }}
                            />
                            {MODE_NAMES[mode]}
                            <span className="muted">
                              {" "}
                              / {topology!.metrics.edge_count} холбоос
                            </span>
                          </span>
                          <div>
                            <select
                              className="map-object-select"
                              aria-label="Сүлжээний объект сонгох"
                              value={selected || ""}
                              onChange={(e) =>
                                setSelected(e.target.value || null)
                              }
                            >
                              <option value="">Зангилаа / холбоос</option>
                              <optgroup label="Зангилаа">
                                {topology!.nodes.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.name_mn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Холбоос">
                                {topology!.edges.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.id} ·{" "}
                                    {
                                      topology!.nodes.find(
                                        (n) => n.id === e.source,
                                      )?.name_mn
                                    }{" "}
                                    →{" "}
                                    {
                                      topology!.nodes.find(
                                        (n) => n.id === e.target,
                                      )?.name_mn
                                    }
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <label className="bridge-toggle">
                              <input
                                type="checkbox"
                                checked={showBridges}
                                onChange={(e) =>
                                  setShowBridges(e.target.checked)
                                }
                              />
                              Критик гүүр
                            </label>
                            <button
                              title="Симуляц шинэчлэх"
                              aria-label="Симуляц шинэчлэх"
                              disabled={busy}
                              onClick={reset}
                            >
                              <RefreshCw size={13} />
                            </button>
                          </div>
                        </div>
                        <NetworkMap
                          key={view}
                          {...mapProps}
                          height={
                            view === "map"
                              ? "610px"
                              : view === "disaster"
                                ? "548px"
                                : "455px"
                          }
                        />
                        <div className="map-bottom">
                          <span>
                            <InfoIcon />
                            Зангилаа эсвэл холбоосыг сонгож дэлгэрэнгүй үзнэ үү.
                          </span>
                          <span>
                            {simulation?.failed_edges.length
                              ? `${simulation.failed_edges.length} тасалдал`
                              : "Бүх холбоос идэвхтэй"}
                            <span
                              className={`live-dot ${simulation?.failed_edges.length ? "red-dot" : ""}`}
                            />
                          </span>
                        </div>
                      </div>
                      {view !== "disaster" && (
                        <Inspector
                          topology={topology!}
                          selected={selected}
                          simulation={simulation}
                          onSelect={setSelected}
                          onCut={cut}
                          onRestore={restore}
                          busy={busy}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="panel empty-state">
                      <TriangleAlert size={28} />
                      <h3>Энэ топологийг үүсгэх боломжгүй</h3>
                      <p>{topology?.message}</p>
                      <button
                        className="button"
                        onClick={() => navigate("data")}
                      >
                        Дэд бүтцийн өгөгдөл засах
                      </button>
                    </div>
                  )}
                  {view === "disaster" && (
                    <SimulationResults
                      simulation={simulation}
                      nodes={topology?.nodes || bundle.topologies.mesh.nodes}
                    />
                  )}
                  {(view === "map" || view === "overview") && simulation && (
                    <SimulationResults
                      simulation={simulation}
                      nodes={topology?.nodes || []}
                    />
                  )}
                  {view === "overview" && (
                    <>
                      <div className="section-heading">
                        <div>
                          <h2>Топологийн харьцуулалт</h2>
                          <p>Зардал, холбоос ба найдвартай байдлын тэнцвэр</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("optimizer")}
                        >
                          Бүх үзүүлэлтийг харах
                          <ArrowRight size={14} />
                        </button>
                      </div>
                      <Comparison bundle={bundle} onMode={chooseMode} compact />
                      <div className="overview-bottom">
                        <div className="panel simulation-promo">
                          <div className="promo-icon">
                            <Waves size={26} />
                          </div>
                          <div>
                            <div className="eyebrow">
                              DISASTER SIMULATION LAB
                            </div>
                            <h3>Сүлжээ тань гамшигт бэлэн үү?</h3>
                            <p>
                              Үер, газар хөдлөлт болон коридорын тасалдлыг
                              загварчилж шалгаарай.
                            </p>
                          </div>
                          <button
                            className="button"
                            onClick={() => navigate("disaster")}
                          >
                            Туршиж үзэх
                            <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="panel model-note">
                          <BookOpen size={20} />
                          <div>
                            <h3>Судалгааны ил тод загвар</h3>
                            <p>
                              OSM авто замын урт. Кабелийн коридор
                              баталгаажаагүй.
                              <br />
                              Бодит дэд бүтцээр баяжуулахад нээлттэй.
                            </p>
                            <button
                              className="text-button"
                              onClick={() => setShowHelp(true)}
                            >
                              Таамаглал ба аргачлал
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
              {view === "optimizer" && (
                <Optimizer
                  bundle={bundle}
                  weights={weights}
                  setWeights={setWeights}
                  busy={busy}
                  optimize={optimize}
                  onMode={(t) => {
                    chooseMode(t);
                    navigate("map");
                  }}
                />
              )}
              {view === "data" && (
                <Infrastructure
                  nodes={bundle.topologies.mesh.nodes}
                  edges={candidates}
                  onChange={async () => {
                    await load();
                    setAppliedWeights(DEFAULT_WEIGHTS);
                  }}
                  onError={setError}
                />
              )}
              {view === "reports" && (
                <Reports
                  bundle={bundle}
                  simulation={simulation}
                  mode={mode}
                  onMode={(t) => {
                    chooseMode(t);
                    navigate("map");
                  }}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Shield size={12} /> FiberGuard Mongolia <span>·</span>{" "}
              Intelligent Network Digital Twin
            </span>
            <span>
              Тооцоолсон өгөгдөл <span>·</span> Academic project 2026
            </span>
          </footer>
        </main>
      </div>
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <Check size={16} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Мэдэгдэл хаах">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {showHelp && (
        <Modal
          onClose={() => setShowHelp(false)}
          labelId="help-title"
          className="help-modal"
        >
          <div className="modal-title">
            <h2 id="help-title">Загварын аргачлал</h2>
            <button onClick={() => setShowHelp(false)} aria-label="Хаах">
              <X size={18} />
            </button>
          </div>
          <div className="eyebrow">FIBERGUARD MONGOLIA / ACADEMIC MODEL</div>
          <p>
            22 хотын сүлжээг NetworkX ашиглан тооцоолж, Leaflet дээр харуулна.
            OpenStreetMap суурь зураг нь интернет холболт шаарддаг. Монголын хил
            болон бүх зангилаа офлайн харагдана.
          </p>
          <h3>Алгоритм</h3>
          <p>
            Kruskal MST → bridge-cover greedy augmentation → reverse deletion.
            Risk-aware сонголт нь зардал, terrain, exposure, SRLG reuse болон
            холбоосын уртад жин өгдөг heuristic.
          </p>
          <h3>Гамшгийн загвар</h3>
          <p>
            Сонгосон чиглэлийн polyline (OSM авто зам эсвэл эх сурвалжаа
            тэмдэглэсэн загвар) нь impact circle-тай огтлолцвол бүхэл холбоос
            тасарна. Severity нь радиусыг үржүүлнэ. SRLG нь нэг бүлгийн бүх
            холбоосыг зэрэг тасална. Симуляцын төлөв таны browser tab-д тусдаа
            байна.
          </p>
          <h3>Latency & CAPEX</h3>
          <p>
            Propagation speed: 200,000 км/сек. Equipment: 0.15 ms / hop /
            one-way. Үндсэн өгөгдөл OSRM авто зам дагасан урт, geometry
            ашиглана. Энэ нь бүхэлдээ асфальтан зам эсвэл бодит кабелийн коридор
            гэдгийг батлахгүй. CAPEX нь USD/км загвар, санхүүгийн үнийн санал
            биш.
          </p>
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => {
                setShowHelp(false);
                navigate("reports");
              }}
            >
              <Download size={14} />
              Тайлан, таамаглал
            </button>
            <button className="button" onClick={() => setShowHelp(false)}>
              Ойлголоо
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function InfoIcon() {
  return <CircleHelp size={12} />;
}
