export const SCHEMA_VERSION = 1;

export const DEFAULT_GATE_TITLES = ["關卡一", "關卡二", "關卡三", "關卡四"] as const;

export const SECTORS = [
  "科技",
  "金融",
  "醫療保健",
  "能源",
  "工業",
  "非必需消費",
  "必需消費",
  "公用事業",
  "房地產",
  "通訊服務",
  "材料",
  "寬基ETF",
  "其他",
] as const;

export const BROAD_SP_ETFS = ["VOO", "SPY", "IVV", "SPLG"] as const;
export const LEVERED_ETFS = ["SSO", "UPRO", "SPXL", "SPXU", "SDS", "TQQQ", "SQQQ"] as const;

export type GateColor = "unset" | "green" | "yellow" | "red";
export type CycleStage = "unset" | "recovery" | "expansion" | "peak" | "recession";
export type Onboarding = "pending" | "demo" | "empty";
export type StyleId = "balanced" | "conservative" | "aggressive";

export interface Gate {
  color: GateColor;
  note: string;
}

export interface KeyDate {
  id: string;
  date: string;
  label: string;
}

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  shares: number;
  avgCostUsd: number;
  notes: string;
  sector: string;
  beta: number | null;
  marketCapUsd: number | null;
  betaManual: boolean;
  marketCapManual: boolean;
  psychStopUsd: number | null;
  breakevenStop: boolean;
  conviction: boolean;
  manualPriceUsd: number | null;
  gates: [Gate, Gate, Gate, Gate];
  keyDates: KeyDate[];
}

export interface CashFlow {
  id: string;
  date: string;
  /** Positive = deposit into the account. Negative = withdrawal. */
  amountHkd: number;
  note: string;
}

export interface Trade {
  id: string;
  date: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  priceUsd: number;
  feesUsd: number;
  note: string;
  plannedScaleIn: boolean;
  averagingDown: boolean;
}

export interface TradePlan {
  id: string;
  ticker: string;
  entry: string;
  entryTiming: string;
  stop: string;
  stopTiming: string;
  takeProfit: string;
  takeProfitTiming: string;
  scaleInPrices: string;
  note: string;
  updatedAt: string;
}

export interface Scorecard {
  ticker: string;
  value: number;
  growth: number;
  profitability: number;
  priceAction: number;
  moatNote: string;
  managementNote: string;
  updatedAt: string;
}

export interface WatchItem {
  id: string;
  ticker: string;
  name: string;
  note: string;
}

export interface Quote {
  ticker: string;
  priceUsd: number;
  asOf: string;
  currency: string;
  /** Percent points, e.g. -0.14 means -0.14%. */
  changePct: number | null;
  name: string;
  beta: number | null;
  marketCapUsd: number | null;
  session: string;
  source: string;
}

export interface FxQuote {
  rate: number;
  date: string;
  fetchedAt: string;
  source: string;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface PriceSeries {
  points: PricePoint[];
  adjusted: boolean;
  source: "cnbc" | "yahoo" | "yahoo-proxy";
  fetchedAt: string;
}

export interface Settings {
  gateTitles: [string, string, string, string];
  riskPct: number;
  monthlyKnockoutPct: number;
  monthStartEquityHkd: number | null;
  monthStartDate: string | null;
  cycleStage: CycleStage;
  startingCapitalHkd: number | null;
  rPct: number;
  winRatePct: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  manualUsdHkd: number | null;
  onboarding: Onboarding;
}

export interface EquitySnapshot {
  date: string;
  equityHkd: number;
}

export interface Notebook {
  schemaVersion: number;
  holdings: Holding[];
  cashHkd: number;
  cashFlows: CashFlow[];
  trades: Trade[];
  plans: TradePlan[];
  scorecards: Scorecard[];
  watchlist: WatchItem[];
  settings: Settings;
  quotes: Record<string, Quote>;
  fx: FxQuote | null;
  fxHistory: { date: string; rate: number }[];
  priceHistory: Record<string, PriceSeries>;
  equitySnapshots: EquitySnapshot[];
}

export interface BackupFile {
  app: "investment-notebook";
  schemaVersion: number;
  exportedAt: string;
  notebook: Notebook;
}

export const CYCLE_INFO: Record<Exclude<CycleStage, "unset">, { label: string; tilt: string }> = {
  recovery: { label: "復甦", tilt: "週期股與價值股" },
  expansion: { label: "擴張", tilt: "成長股與週期股" },
  peak: { label: "高峰滯漲", tilt: "防守股與現金。本程式不提供沽空或衍生工具。" },
  recession: { label: "衰退", tilt: "價值股、防守股與現金" },
};

export function emptyGates(): [Gate, Gate, Gate, Gate] {
  return [
    { color: "unset", note: "" },
    { color: "unset", note: "" },
    { color: "unset", note: "" },
    { color: "unset", note: "" },
  ];
}

export function defaultSettings(): Settings {
  return {
    gateTitles: [...DEFAULT_GATE_TITLES],
    riskPct: 2,
    monthlyKnockoutPct: 6,
    monthStartEquityHkd: null,
    monthStartDate: null,
    cycleStage: "unset",
    startingCapitalHkd: null,
    rPct: 2,
    winRatePct: null,
    avgWinR: null,
    avgLossR: null,
    manualUsdHkd: null,
    onboarding: "pending",
  };
}

export function emptyNotebook(): Notebook {
  return {
    schemaVersion: SCHEMA_VERSION,
    holdings: [],
    cashHkd: 0,
    cashFlows: [],
    trades: [],
    plans: [],
    scorecards: [],
    watchlist: [],
    settings: defaultSettings(),
    quotes: {},
    fx: null,
    fxHistory: [],
    priceHistory: {},
    equitySnapshots: [],
  };
}
