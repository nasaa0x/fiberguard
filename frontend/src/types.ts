export type Mode = "mst" | "optimized" | "risk" | "mesh";
export type View =
  | "overview"
  | "map"
  | "optimizer"
  | "disaster"
  | "routes"
  | "data"
  | "reports";
export interface NetworkNode {
  id: string;
  name_mn: string;
  name_en: string;
  province: string;
  lat: number;
  lon: number;
  node_type: string;
  traffic_demand_mbps: number;
}
export interface Edge {
  id: string;
  source: string;
  target: string;
  distance_km: number;
  cost_usd: number;
  terrain: string;
  risk_score: number;
  disaster_exposure: number;
  corridor_id: string;
  shared_risk_group: string | null;
  latency_ms: number;
  status: string;
  distance_source: string;
  route_source: string;
  geometry: [number, number][];
  theoretical: boolean;
  validation_reference?: string;
  routing?: {
    provider: string;
    profile: string;
    server: string;
    request_url: string;
    fetched_at: string;
    data_version: string | null;
    driving_duration_seconds: number;
    full_geometry_points: number;
    geometry_tolerance_m: number;
    snapped_distance_m: number[];
    surface_verified: boolean;
    fiber_route_verified: boolean;
    note: string;
  };
}
export interface Metrics {
  node_count: number;
  edge_count: number;
  distance_km: number;
  cost_usd: number;
  bridge_count: number;
  bridges: string[];
  connected: boolean;
  components: number;
  fault_tolerant: boolean;
  single_edge_survival_pct: number;
  multi_failure_survival_pct: number | null;
  scenario_count: number;
  max_modeled_rtt_ms: number | null;
  max_reachable_rtt_ms: number;
  below_50ms: boolean;
  corridor_diversity: number;
  additional_cost_pct: number;
  additional_distance_pct: number;
}
export interface Topology {
  id: Mode;
  nodes: NetworkNode[];
  edges: Edge[];
  metrics: Metrics;
  algorithm: string;
  heuristic: boolean;
  theoretical: boolean;
  infeasible?: boolean;
  message?: string;
}
export interface Bundle {
  topologies: Record<Mode, Topology>;
  metadata: {
    description: string;
    distance_method: string;
    capex_method: string;
    verified_routes: boolean;
  };
  revision: number;
}
export interface Route {
  reachable: boolean;
  nodes: string[];
  edges: string[];
  distance_km: number | null;
  propagation_one_way_ms: number | null;
  propagation_rtt_ms: number | null;
  equipment_one_way_ms: number | null;
  modeled_rtt_ms: number | null;
}
export interface Simulation {
  failed_edges: string[];
  components: string[][];
  affected_nodes: string[];
  reachable_nodes: string[];
  availability_pct: number;
  before_metrics: Metrics;
  after_metrics: Metrics;
  reference_node: string;
  route_target: string | null;
  before_route: Route | null;
  after_route: Route | null;
  latency_delta_ms: number | null;
  rerouted_paths: { destination: string; before: Route; after: Route }[];
  recovery: {
    recommendations: {
      edge_id: string;
      source: string;
      target: string;
      action: string;
      estimated_cost_usd: number;
      distance_km: number;
      cost_basis: string;
    }[];
    estimated_cost_usd: number;
    feasible: boolean;
  };
  zone?: { center: [number, number]; radius_km: number };
  scenario?: string;
  shared_risk_group?: string | null;
}
export interface RouteResult {
  before: Route;
  after: Route;
  latency_delta_ms: number | null;
}
export type Weights = Record<
  "cost" | "terrain" | "exposure" | "diversity" | "latency",
  number
>;
export const DEFAULT_WEIGHTS: Weights = {
  cost: 1,
  terrain: 0.65,
  exposure: 0.7,
  diversity: 0.8,
  latency: 0.35,
};
export const MODE_NAMES: Record<Mode, string> = {
  mst: "MST",
  optimized: "2-Edge Connected",
  risk: "Risk-Aware",
  mesh: "Full Mesh",
};
export const MODE_COLORS: Record<Mode, string> = {
  mst: "#d77870",
  optimized: "#7ca7df",
  risk: "#adbf88",
  mesh: "#74b499",
};
export const format = (n: number | null | undefined, d = 0) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
export const money = (n: number) =>
  n >= 1e6 ? `$${format(n / 1e6, 2)}M` : `$${format(n)}`;

export const distanceLabel = (edge: Edge): string =>
  ({
    osm_road_route: "OSM авто замын маршрут",
    validated_route: "Баталгаажсан урт",
    haversine_direct: "Онолын шууд зай",
    estimated_haversine_detour: "Координатын ойролцоолол",
  })[edge.distance_source] || edge.distance_source;
