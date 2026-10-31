import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  ArrowRight,
  Cable,
  Check,
  ChevronRight,
  CloudRain,
  Download,
  Earth,
  FileJson,
  FileSpreadsheet,
  GitBranch,
  Info,
  MapPin,
  Play,
  RotateCcw,
  Scissors,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import { api, csv, download } from "./api";
import type {
  Bundle,
  Mode,
  NetworkNode,
  RouteResult,
  Simulation,
  Topology,
  Weights,
} from "./types";
import {
  DEFAULT_WEIGHTS,
  format,
  MODE_COLORS,
  MODE_NAMES,
  money,
} from "./types";

export function Comparison({
  bundle,
  onMode,
  compact = false,
}: {
  bundle: Bundle;
  onMode: (m: Mode) => void;
  compact?: boolean;
}) {
  const [includeMesh, setIncludeMesh] = useState(false);
  const modes: Mode[] = ["mst", "optimized", "risk", "mesh"];
  const available = modes.filter((m) => !bundle.topologies[m].infeasible);
  const rows = available
    .filter((m) => includeMesh || m !== "mesh")
    .map((m) => ({
      name: MODE_NAMES[m],
      cost: Math.round(bundle.topologies[m].metrics.cost_usd / 1e4) / 100,
      fill: MODE_COLORS[m],
    }));
  return (
    <>
      {!compact && (
        <div className="comparison-intro panel">
          <div>
            <div className="eyebrow">THE ECONOMICS OF RESILIENCE</div>
            <h2>Найдвартай байдалд ямар өртөг хэрэгтэй вэ?</h2>
            <p className="muted">
              Хамгийн бага зардлаас олон эрсдэлийн хамгаалалт хүртэл. Бүх
              хувилбарыг ижил таамаглал, ижил гамшгийн багцаар үнэлнэ.
            </p>
          </div>
          <div className="chart-wrap">
            <div className="chart-caption">
              <span>ESTIMATED CAPEX · USD MILLION</span>
              <button onClick={() => setIncludeMesh(!includeMesh)}>
                {includeMesh ? "Full Mesh хасах" : "+ Full Mesh"}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={rows}
                margin={{ top: 10, right: 15, left: -22, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#2c332f"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#949c94", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#949c94", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  formatter={(v) => [`$${v}M`, "CAPEX"]}
                  contentStyle={{
                    background: "#1b211d",
                    border: "1px solid #3c443c",
                    color: "#eceee6",
                  }}
                />
                <Bar dataKey="cost" radius={[3, 3, 0, 0]} maxBarSize={38}>
                  {rows.map((r) => (
                    <Cell key={r.name} fill={r.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className={`comparison-grid ${compact ? "compact" : ""}`}>
        {modes.map((mode, i) => {
          const t = bundle.topologies[mode];
          if (t.infeasible)
            return (
              <div className="topology-card" key={mode}>
                <h3>{MODE_NAMES[mode]}</h3>
                <p className="text-red">Боломжгүй</p>
                <p className="small muted">{t.message}</p>
              </div>
            );
          const m = t.metrics;
          return (
            <button
              onClick={() => onMode(mode)}
              className={`topology-card ${mode === "optimized" ? "recommended" : ""}`}
              key={mode}
            >
              <div className="topology-card-top">
                <span
                  className="topology-symbol"
                  style={{ color: MODE_COLORS[mode] }}
                >
                  {i === 0 ? (
                    <GitBranch size={19} />
                  ) : i === 3 ? (
                    <Earth size={19} />
                  ) : (
                    <ShieldCheck size={19} />
                  )}
                </span>
                {mode === "optimized" ? (
                  <span className="mini-tag">ЗӨВЛӨМЖ</span>
                ) : mode === "mesh" ? (
                  <span className="mini-tag neutral">ОНОЛЫН</span>
                ) : (
                  <ChevronRight size={14} />
                )}
              </div>
              <h3>{MODE_NAMES[mode]}</h3>
              <p>
                {
                  [
                    "Хамгийн бага өртөг",
                    "Нэг тасалдлын хамгаалалт",
                    "Эрсдэлд суурилсан сонголт",
                    "Бүх хосын шууд холбоос",
                  ][i]
                }
              </p>
              <div className="topology-value">
                {format(m.distance_km)}
                <span>км</span>
              </div>
              <div className="topology-cost">
                {money(m.cost_usd)} <span>CAPEX</span>
              </div>
              <div className="card-divider" />
              <div className="compare-row">
                <span>Критик гүүр</span>
                <b className={m.bridge_count ? "text-red" : "text-green"}>
                  {m.bridge_count}
                </b>
              </div>
              <div className="compare-row">
                <span>1-fault survival</span>
                <b>{format(m.single_edge_survival_pct)}%</b>
              </div>
              {!compact && (
                <>
                  <div className="compare-row">
                    <span>Олон тасалдлын тэсвэр</span>
                    <b>
                      {mode === "mesh"
                        ? "N/A"
                        : format(m.multi_failure_survival_pct, 1) + "%"}
                    </b>
                  </div>
                  <div className="compare-row">
                    <span>Max modeled RTT</span>
                    <b>{format(m.max_modeled_rtt_ms, 2)} ms</b>
                  </div>
                  <div className="compare-row">
                    <span>Коридорын бүлгийн тоо</span>
                    <b>{m.corridor_diversity}</b>
                  </div>
                  <div className="compare-row">
                    <span>CAPEX нэмэгдэл / MST</span>
                    <b>+{format(m.additional_cost_pct, 1)}%</b>
                  </div>
                  <div className="compare-row">
                    <span>Уртын нэмэгдэл / MST</span>
                    <b>+{format(m.additional_distance_pct, 1)}%</b>
                  </div>
                </>
              )}
              <div className="topology-card-footer">
                <span>{m.edge_count} холбоос</span>
                <span style={{ color: MODE_COLORS[mode] }}>
                  {mode === "mesh"
                    ? "THEORETICAL"
                    : m.fault_tolerant
                      ? "RESILIENT"
                      : "COST FIRST"}{" "}
                  <ArrowRight size={11} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="info-note">
          <Info size={17} />
          <span>
            Greedy augmentation нь глобал оновчтой шийдлийн баталгаа биш. Full
            Mesh нь бодит коридорын боломжийг батлахгүй; гамшгийн харьцуулалтад
            оруулаагүй. Тэсвэрийн хувь нь зөвхөн тогтсон 3 бүс, бүх SRLG,
            seed=42 сонгосон 30 хос тасалдлын стресс тестийн үр дүн. Ижил аюул
            нь топологиос хамааран 0, 1, олон холбоост нөлөөлнө; бодит магадлал
            биш.
          </span>
        </div>
      )}
    </>
  );
}
export function Optimizer({
  weights,
  setWeights,
  busy,
  optimize,
  bundle,
  onMode,
}: {
  weights: Weights;
  setWeights: (w: Weights) => void;
  busy: boolean;
  optimize: () => void;
  bundle: Bundle;
  onMode: (m: Mode) => void;
}) {
  const labels: Record<keyof Weights, string> = {
    cost: "Барилгын зардал",
    terrain: "Газрын гадаргын эрсдэл",
    exposure: "Бүс нутгийн гамшгийн өртөлт",
    diversity: "Коридорын олон янз байдал",
    latency: "Нөөц холбоосын latency",
  };
  return (
    <div className="workspace-stack">
      <div className="panel optimization-controls">
        <div className="optimization-copy">
          <div className="eyebrow">
            <SlidersHorizontal size={13} /> OPTIMIZATION ENGINE
          </div>
          <h2>Зардал ба эрсдэлийн тэнцвэр</h2>
          <p className="muted">
            MST-ээс эхэлж, критик гүүрүүдийг хаах боломжит холбоосуудыг жинлэсэн
            оноогоор сонгоно.
          </p>
          <button className="button primary" disabled={busy} onClick={optimize}>
            <Settings2 size={15} />
            {busy ? "Тооцоолж байна…" : "Оновчлол ажиллуулах"}
          </button>
          <button
            className="text-button"
            onClick={() => setWeights(DEFAULT_WEIGHTS)}
          >
            Анхны жин
          </button>
        </div>
        <div className="weight-controls">
          {(Object.keys(labels) as (keyof Weights)[]).map((k) => (
            <label key={k}>
              <span>
                {labels[k]}
                <b>{weights[k].toFixed(2)}</b>
              </span>
              <input
                type="range"
                min="0"
                max="3"
                step="0.05"
                value={weights[k]}
                onChange={(e) =>
                  setWeights({ ...weights, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </div>
      </div>
      <Comparison bundle={bundle} onMode={onMode} />
      <div className="panel formula">
        <div className="eyebrow">ИЛ ТОД МАТЕМАТИК ЗАГВАР</div>
        <code>
          score(e) = [w₁ C/Cmax + w₂ risk + w₃ exposure + w₄ SRLG_path_overlap +
          w₅ D/Dmax] / bridges_covered
        </code>
        <p className="muted small">
          Хамгийн бага оноотой холбоосыг нэмж, илүүдэл нэмсэн холбоосыг урвуу
          дарааллаар хасна. Эцэст нь холбоос бүрийг нэг нэгээр нь таслан шалгах
          боломжтой. Latency жин нь нөөц холбоосын уртын proxy; бүх backup
          path-ын глобал оновчлол биш.
        </p>
      </div>
    </div>
  );
}
export type Scenario = "cut" | "flood" | "earthquake" | "srlg";
export function DisasterControls({
  scenario,
  setScenario,
  center,
  radius,
  setRadius,
  severity,
  setSeverity,
  group,
  setGroup,
  groups,
  busy,
  onRun,
  onReset,
  selectedEdge,
}: {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  center: [number, number];
  radius: number;
  setRadius: (n: number) => void;
  severity: number;
  setSeverity: (n: number) => void;
  group: string;
  setGroup: (s: string) => void;
  groups: string[];
  busy: boolean;
  onRun: () => void;
  onReset: () => void;
  selectedEdge: string | null;
}) {
  const scenarios = [
    {
      id: "cut" as const,
      icon: Scissors,
      name: "Кабель тасрах",
      sub: "SINGLE LINK",
    },
    {
      id: "flood" as const,
      icon: CloudRain,
      name: "Үерийн эрсдэл",
      sub: "REGIONAL FLOOD",
    },
    {
      id: "earthquake" as const,
      icon: Waves,
      name: "Газар хөдлөлт",
      sub: "EARTHQUAKE",
    },
    {
      id: "srlg" as const,
      icon: Cable,
      name: "Хамтын коридор",
      sub: "SHARED RISK",
    },
  ];
  return (
    <div className="panel disaster-controls">
      <div className="panel-heading">
        <span>ГАМШГИЙН УДИРДЛАГА</span>
        <span className="mini-tag warning">SIMULATION</span>
      </div>
      <div className="scenario-options">
        {scenarios.map((s) => (
          <button
            key={s.id}
            className={scenario === s.id ? "selected" : ""}
            onClick={() => setScenario(s.id)}
          >
            <s.icon size={20} />
            <span>
              {s.name}
              <small>{s.sub}</small>
            </span>
            {scenario === s.id && <Check size={14} />}
          </button>
        ))}
      </div>
      <div className="disaster-inputs">
        {scenario === "cut" ? (
          <div className="selection-box">
            <Scissors size={16} />
            <p>
              {selectedEdge
                ? `Сонгосон холбоос: ${selectedEdge.toUpperCase()}`
                : "Газрын зураг дээр таслах холбоосоо сонгоно уу."}
            </p>
          </div>
        ) : scenario === "srlg" ? (
          <label className="field-label">
            Хамтын эрсдэлийн бүлэг
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <small>Нэг бүлгийн бүх холбоос зэрэг тасарна.</small>
          </label>
        ) : (
          <>
            <div className="field-label">
              Гамшгийн төв
              <div className="location-select" aria-live="polite">
                <MapPin size={15} />
                {center[0].toFixed(3)}° N, {center[1].toFixed(3)}° E
              </div>
              <small>
                Улбар шар тойргийг чирж хүссэн газраа аваачина. Хоосон газар
                дарвал төв нь тэр цэгт очно. «Симуляц эхлүүлэх» дарвал тойрогтой
                огтлолцсон кабель тасарна.
              </small>
            </div>
            <label className="range-label">
              <span>
                Үндсэн радиус<b>{radius} км</b>
              </span>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>
            <label className="range-label">
              <span>
                Хүчний коэффициент<b>{severity.toFixed(2)}×</b>
              </span>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.25"
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
              />
              <small>
                Бодит загварын радиус: {format(radius * severity)} км.
                Огтлолцсон бүх холбоос тасарна.
              </small>
            </label>
          </>
        )}
      </div>
      <div className="disaster-buttons">
        <button
          className="button primary"
          onClick={onRun}
          disabled={busy || (scenario === "cut" && !selectedEdge)}
        >
          <Play size={14} />
          {busy ? "Тооцоолж байна…" : "Симуляц эхлүүлэх"}
        </button>
        <button
          className="button icon-button"
          title="Симуляц шинэчлэх"
          aria-label="Симуляц шинэчлэх"
          disabled={busy}
          onClick={onReset}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="fine-print">
        Загварын туршилт. Бодит гамшгийн урьдчилсан мэдээ биш.
      </div>
    </div>
  );
}
export function SimulationResults({
  simulation,
  nodes,
}: {
  simulation: Simulation | null;
  nodes: NetworkNode[];
}) {
  const names = Object.fromEntries(nodes.map((n) => [n.id, n.name_mn]));
  if (!simulation?.failed_edges.length)
    return (
      <div className="panel result-empty">
        <ShieldCheck size={30} />
        <h3>Симуляц ажиллуулахад бэлэн</h3>
        <p>Гамшгийн хувилбар сонгож, сүлжээний тэсвэрийг туршина уу.</p>
        {simulation && (
          <small>
            Сүүлийн бүсэд загварын холбоос огтлолцоогүй — 0 тасалдал.
          </small>
        )}
      </div>
    );
  const before = simulation.before_route,
    after = simulation.after_route;
  return (
    <div className="results-grid">
      <div className="panel result-summary">
        <div className="panel-heading">
          <span>СИМУЛЯЦЫН ҮР ДҮН</span>
          <span className="mini-tag warning">
            {simulation.failed_edges.length} FAILURE
            {simulation.failed_edges.length > 1 ? "S" : ""}
          </span>
        </div>
        <p className="fine-print">
          {
            {
              cut: "Кабелийн тасалдал",
              flood: "Үерийн симуляц",
              earthquake: "Газар хөдлөлт",
              srlg: "Хамтын коридор",
            }[simulation.scenario || "cut"]
          }
          {simulation.zone &&
            ` · ${simulation.zone.center.map((n) => n.toFixed(3)).join(", ")} · ${format(simulation.zone.radius_km)} км`}
          {simulation.shared_risk_group && ` · ${simulation.shared_risk_group}`}
        </p>
        <div className="result-numbers">
          <div>
            <span>Хүртээмж</span>
            <b>
              {format(simulation.availability_pct, 1)}
              <small>%</small>
            </b>
          </div>
          <div>
            <span>Тусгаарлагдсан хот</span>
            <b className={simulation.affected_nodes.length ? "text-red" : ""}>
              {simulation.affected_nodes.length}
            </b>
          </div>
          <div>
            <span>Components</span>
            <b>{simulation.components.length}</b>
          </div>
          <div>
            <span>Дахин чиглүүлсэн</span>
            <b>
              {
                simulation.rerouted_paths.filter((p) => p.after.reachable)
                  .length
              }
            </b>
          </div>
        </div>
        <div className="affected-list">
          {simulation.affected_nodes.length ? (
            simulation.affected_nodes.map((n) => (
              <span className="mini-tag red" key={n}>
                {names[n]}
              </span>
            ))
          ) : (
            <span className="text-green small">
              <Check size={13} /> Бүх хот үндсэн зангилаатай холбогдсон
            </span>
          )}
        </div>
        <div className="section-label">ТАСАРСАН ХОЛБООСУУД</div>
        <div className="affected-list">
          {simulation.failed_edges.map((id) => (
            <span className="mini-tag red" key={id}>
              {id}
            </span>
          ))}
        </div>
      </div>
      <div className="panel route-comparison">
        <div className="panel-heading">
          <span>НӨӨЦ ЗАМЫН ӨӨРЧЛӨЛТ</span>
          <GitBranch size={15} />
        </div>
        {before && after ? (
          <>
            <p className="small muted">
              Улаанбаатар → {names[simulation.route_target || ""]}
            </p>
            <div className="before-after">
              <div>
                <span>Өмнө</span>
                <b>
                  {format(before.distance_km, 1)} <small>км</small>
                </b>
                <em>{format(before.modeled_rtt_ms, 2)} ms RTT</em>
              </div>
              <ArrowRight size={18} />
              <div>
                <span>Дараа</span>
                <b>
                  {after.reachable
                    ? format(after.distance_km, 1)
                    : "Холболтгүй"}{" "}
                  <small>{after.reachable ? "км" : ""}</small>
                </b>
                <em>
                  {after.reachable
                    ? format(after.modeled_rtt_ms, 2) + " ms RTT"
                    : "Сэргээх шаардлагатай"}
                </em>
              </div>
            </div>
            <p className="fine-print">
              {after.reachable
                ? after.nodes.map((n) => names[n]).join(" → ")
                : "Физик холбоос тасарсан үед rerouting дангаараа холболт үүсгэхгүй."}
            </p>
          </>
        ) : (
          <p className="muted small">Сонгосон замын үр дүн байхгүй.</p>
        )}
      </div>
      <div className="panel recovery-panel">
        <div className="panel-heading">
          <span>СЭРГЭЭХ СТРАТЕГИ</span>
          <Settings2 size={15} />
        </div>
        {simulation.recovery.recommendations.length ? (
          <>
            <p className="muted small">
              Компонентуудыг хамгийн бага тооцоолсон зардлаар холбох боломжит
              төлөвлөгөө:
            </p>
            {simulation.recovery.recommendations.map((r) => (
              <div className="recovery-row" key={r.edge_id}>
                <Cable size={15} />
                <div>
                  <b>
                    {names[r.source]} → {names[r.target]}
                  </b>
                  <small>
                    {r.action === "restore" ? "Сэргээх" : "Шинэ холбоос барих"}{" "}
                    · {r.edge_id}
                  </small>
                </div>
                <span>{money(r.estimated_cost_usd)}</span>
              </div>
            ))}
            <div className="recovery-total">
              <span>Нийт CAPEX proxy</span>
              <b>{money(simulation.recovery.estimated_cost_usd)}</b>
            </div>
            <p className="fine-print">
              Гамшгийн дараах төлөвлөлт: аюул арилсан эсэх, газар дээрх
              боломжийг шалгана. Бүрэн солих CAPEX ашигласан; бодит засварын
              өртөг, хугацаа тодорхойгүй. Холбоос автоматаар баригдахгүй.
            </p>
          </>
        ) : (
          <div className="recovery-ok">
            <ShieldCheck size={20} />
            <div>
              <b>Нөөц замаар холбогдсон</b>
              <p>Дэд бүтцийг сэргээх нь нэмэлт хамгаалалтыг буцаан олгоно.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export function RouteAnalysis({
  topology,
  mode,
  simulation,
  weights,
  onResult,
  onError,
  busy,
  setBusy,
}: {
  topology: Topology;
  mode: Mode;
  simulation: Simulation | null;
  weights: Weights;
  onResult: (r: RouteResult) => void;
  onError: (s: string) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [source, setSource] = useState("ub");
  const [target, setTarget] = useState("olgii");
  const [result, setResult] = useState<RouteResult | null>(null);
  async function run() {
    setBusy(true);
    try {
      const r = await api<RouteResult>("/network/shortest-path", {
        topology: mode,
        source,
        target,
        failed_edges: simulation?.failed_edges || [],
        weights,
      });
      setResult(r);
      onResult(r);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel route-controls">
      <div className="panel-heading">
        <span>DIJKSTRA · ХАМГИЙН БОГИНО ЗАМ</span>
        <GitBranch size={16} />
      </div>
      <div className="route-form">
        <label className="field-label">
          Эхлэх зангилаа
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {topology.nodes.map((n) => (
              <option value={n.id} key={n.id}>
                {n.name_mn}
              </option>
            ))}
          </select>
        </label>
        <ArrowRight size={17} />
        <label className="field-label">
          Хүрэх зангилаа
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {topology.nodes.map((n) => (
              <option value={n.id} key={n.id}>
                {n.name_mn}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy} onClick={run}>
          <GitBranch size={15} />
          Зам тооцоолох
        </button>
      </div>
      {result && (
        <div className="route-analysis-results">
          {(["before", "after"] as const).map((key) => {
            const r = result[key];
            return (
              <div key={key}>
                <div className="eyebrow">
                  {key === "before" ? "АНХНЫ ЗАМ" : "ТАСАЛДЛЫН ДАРАА"}
                </div>
                <h3>
                  {r.reachable
                    ? format(r.distance_km, 1) + " км"
                    : "Зам олдсонгүй"}
                </h3>
                <p>
                  {r.nodes
                    .map(
                      (id) => topology.nodes.find((n) => n.id === id)?.name_mn,
                    )
                    .join(" → ") || "Эдгээр зангилаа тусгаарлагдсан."}
                </p>
                <dl className="details">
                  <div>
                    <dt>One-way propagation</dt>
                    <dd>{format(r.propagation_one_way_ms, 3)} ms</dd>
                  </div>
                  <div>
                    <dt>Round-trip propagation</dt>
                    <dd>{format(r.propagation_rtt_ms, 3)} ms</dd>
                  </div>
                  <div>
                    <dt>Equipment one-way</dt>
                    <dd>{format(r.equipment_one_way_ms, 3)} ms</dd>
                  </div>
                  <div>
                    <dt>Modeled total RTT</dt>
                    <dd>{format(r.modeled_rtt_ms, 3)} ms</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <p className="fine-print">
        v = 200,000 км/сек. Equipment delay = 0.15 ms / холбоос / чиглэл. Зайн
        хувьд хамгийн богино замыг сонгоно. Бодит сүлжээний latency хэмжилт биш.
      </p>
    </div>
  );
}
export function Reports({
  bundle,
  simulation,
  mode,
  onMode,
}: {
  bundle: Bundle;
  simulation: Simulation | null;
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const assumptions = [
    "Хотын координат ойролцоо; авто замын маршрут нь бодит шилэн кабелийн коридорыг батлахгүй.",
    "OSM / OSRM маршрут: авто замын урт. Координатын ойролцоолол ба баталгаажсан хэмжилтийг эх сурвалжаар нь ялгана. CAPEX нь USD/км загвар.",
    "2-edge-connectivity нь газарзүйн хамааралтай тасалдлын баталгаа биш.",
    "Гамшиг нь тойрог болон эх сурвалжтай route polyline-ын огтлолцолд суурилсан. OSM geometry-г 20 м tolerance-тай хялбаршуулсан.",
    "Weighted greedy heuristic нь глобал оновчлол биш.",
    "Propagation болон equipment delay нь хялбаршуулсан тооцоо; бодит RTT биш.",
  ];
  function exportJSON() {
    download(
      "fiberguard-report.json",
      JSON.stringify(
        {
          project: "FiberGuard Mongolia",
          exported_at: new Date().toISOString(),
          selected_topology: mode,
          network: bundle,
          simulation,
          assumptions,
        },
        null,
        2,
      ),
    );
  }
  function exportCSV() {
    const rows: unknown[][] = [
      [
        "topology",
        "algorithm",
        "distance_km",
        "capex_usd",
        "bridge_count",
        "single_edge_survival_pct",
        "multi_failure_survival_pct",
        "max_modeled_rtt_ms",
        "additional_cost_pct",
      ],
    ];
    Object.values(bundle.topologies)
      .filter((t) => !t.infeasible)
      .forEach((t) =>
        rows.push([
          t.id,
          t.algorithm,
          t.metrics.distance_km,
          t.metrics.cost_usd,
          t.metrics.bridge_count,
          t.metrics.single_edge_survival_pct,
          t.metrics.multi_failure_survival_pct,
          t.metrics.max_modeled_rtt_ms,
          t.metrics.additional_cost_pct,
        ]),
      );
    rows.push(
      [],
      [
        "simulation",
        "selected_topology",
        "failed_edges",
        "availability_pct",
        "affected_nodes",
        "components",
        "recovery_cost_proxy_usd",
      ],
    );
    rows.push([
      "latest",
      mode,
      simulation?.failed_edges.join(";"),
      simulation?.availability_pct,
      simulation?.affected_nodes.join(";"),
      simulation?.components.length,
      simulation?.recovery.estimated_cost_usd,
    ]);
    rows.push([], ["assumptions"], ...assumptions.map((a) => [a]));
    download("fiberguard-report.csv", csv(rows), "text/csv;charset=utf-8");
  }
  return (
    <div className="workspace-stack">
      <div className="panel report-hero">
        <div className="report-icon">
          <FileJson size={32} />
        </div>
        <div>
          <div className="eyebrow">REPRODUCIBLE NETWORK INTELLIGENCE</div>
          <h2>Шинжилгээнээс хамгаалалт хүртэл.</h2>
          <p className="muted">
            Топологийн харьцуулалт, гүүрийн шинжилгээ, гамшгийн үр дүн болон
            сэргээх төлөвлөгөөг нэг тайланд.
          </p>
          <div className="button-row">
            <button className="button primary" onClick={exportJSON}>
              <Download size={15} />
              JSON тайлан
            </button>
            <button className="button" onClick={exportCSV}>
              <FileSpreadsheet size={15} />
              CSV экспорт
            </button>
            <button className="button" onClick={() => window.print()}>
              Хэвлэх / PDF
            </button>
          </div>
        </div>
      </div>
      <Comparison bundle={bundle} onMode={onMode} compact />
      <div className="panel assumptions">
        <div className="panel-heading">
          <span>ТАЙЛАНГИЙН ТААМАГЛАЛ БА ХЯЗГААРЛАЛТ</span>
          <Info size={16} />
        </div>
        {assumptions.map((a, i) => (
          <p key={a}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {a}
          </p>
        ))}
      </div>
      <SimulationResults
        simulation={simulation}
        nodes={bundle.topologies[mode].nodes || []}
      />
    </div>
  );
}
