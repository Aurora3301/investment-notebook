import {
  DEFAULT_GATE_TITLES,
  SCHEMA_VERSION,
  type BackupFile,
  type Gate,
  type GateColor,
  type Holding,
  type Notebook,
  type Onboarding,
  type Settings,
  emptyNotebook,
} from "./types";

function rec(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function num(value: unknown, fallback: number | null = 0): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function gateColor(value: unknown): GateColor {
  return value === "red" || value === "yellow" || value === "green" ? value : "unset";
}

function gatesOf(value: unknown): [Gate, Gate, Gate, Gate] {
  const list = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => {
    const gate = rec(list[index]);
    return { color: gateColor(gate?.color), note: str(gate?.note) };
  }) as [Gate, Gate, Gate, Gate];
}

function titlesOf(value: unknown): [string, string, string, string] {
  const list = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => {
    const title = str(list[index]).trim();
    return title || DEFAULT_GATE_TITLES[index];
  }) as [string, string, string, string];
}

function onboardingOf(value: unknown, hasData: boolean): Onboarding {
  if (value === "demo" || value === "empty" || value === "pending") return value;
  return hasData ? "empty" : "pending";
}

function holdingOf(value: unknown, index: number): Holding | null {
  const row = rec(value);
  if (!row) return null;
  const ticker = str(row.ticker).trim().toUpperCase();
  if (!ticker) return null;
  const shares = num(row.shares, 0) ?? 0;
  return {
    id: str(row.id) || `holding-${index}-${ticker}`,
    ticker,
    name: str(row.name) || ticker,
    shares: shares < 0 ? 0 : shares,
    avgCostUsd: Math.max(0, num(row.avgCostUsd, 0) ?? 0),
    notes: str(row.notes),
    sector: str(row.sector),
    beta: num(row.beta, null),
    marketCapUsd: num(row.marketCapUsd, null),
    betaManual: Boolean(row.betaManual),
    marketCapManual: Boolean(row.marketCapManual),
    psychStopUsd: num(row.psychStopUsd, null),
    breakevenStop: Boolean(row.breakevenStop),
    conviction: Boolean(row.conviction),
    manualPriceUsd: num(row.manualPriceUsd, null),
    gates: gatesOf(row.gates),
    keyDates: Array.isArray(row.keyDates)
      ? row.keyDates.flatMap((item, dateIndex) => {
          const date = rec(item);
          if (!date || !str(date.date)) return [];
          return [{ id: str(date.id) || `date-${dateIndex}`, date: str(date.date), label: str(date.label) }];
        })
      : [],
  };
}

function settingsOf(value: unknown, hasData: boolean): Settings {
  const base = emptyNotebook().settings;
  const row = rec(value);
  if (!row) return { ...base, onboarding: onboardingOf(undefined, hasData) };
  const cycle = str(row.cycleStage);
  return {
    gateTitles: titlesOf(row.gateTitles),
    riskPct: Math.min(50, Math.max(0.1, num(row.riskPct, base.riskPct) ?? base.riskPct)),
    monthlyKnockoutPct: Math.min(80, Math.max(0.5, num(row.monthlyKnockoutPct, base.monthlyKnockoutPct) ?? base.monthlyKnockoutPct)),
    monthStartEquityHkd: num(row.monthStartEquityHkd, null),
    monthStartDate: str(row.monthStartDate) || null,
    cycleStage: cycle === "recovery" || cycle === "expansion" || cycle === "peak" || cycle === "recession" ? cycle : "unset",
    startingCapitalHkd: num(row.startingCapitalHkd, null),
    rPct: Math.min(50, Math.max(0.1, num(row.rPct, base.rPct) ?? base.rPct)),
    winRatePct: num(row.winRatePct, null),
    avgWinR: num(row.avgWinR, null),
    avgLossR: num(row.avgLossR, null),
    manualUsdHkd: num(row.manualUsdHkd, null),
    onboarding: onboardingOf(row.onboarding, hasData),
  };
}

/** Document migration. Add a step here when SCHEMA_VERSION increases. */
export function migrate(input: unknown): Notebook {
  const row = rec(input) ?? {};
  const version = typeof row.schemaVersion === "number" ? row.schemaVersion : 0;
  let current: Record<string, unknown> = { ...row };
  if (version < 1) current = { ...current, schemaVersion: 1 };
  if (version > SCHEMA_VERSION) current = { ...current, schemaVersion: SCHEMA_VERSION };
  return normalize(current);
}

export function normalize(input: unknown): Notebook {
  const row = rec(input) ?? {};
  const holdings = Array.isArray(row.holdings)
    ? row.holdings.flatMap((item, index) => {
        const holding = holdingOf(item, index);
        return holding ? [holding] : [];
      })
    : [];
  const mapRows = <T>(value: unknown, map: (item: Record<string, unknown>, index: number) => T | null): T[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => {
      const record = rec(item);
      if (!record) return [];
      const mapped = map(record, index);
      return mapped ? [mapped] : [];
    });
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    holdings,
    cashHkd: num(row.cashHkd, 0) ?? 0,
    cashFlows: mapRows(row.cashFlows, (item, index) => {
      const date = str(item.date);
      const amount = num(item.amountHkd, null);
      if (!date || amount == null) return null;
      return { id: str(item.id) || `cf-${index}`, date, amountHkd: amount, note: str(item.note) };
    }),
    trades: mapRows(row.trades, (item, index) => {
      const ticker = str(item.ticker).trim().toUpperCase();
      const date = str(item.date);
      const shares = num(item.shares, null);
      const price = num(item.priceUsd, null);
      if (!ticker || !date || shares == null || price == null || shares < 0 || price < 0) return null;
      const side = item.side === "sell" ? "sell" : "buy";
      return {
        id: str(item.id) || `trade-${index}`,
        date,
        ticker,
        side,
        shares,
        priceUsd: price,
        feesUsd: Math.max(0, num(item.feesUsd, 0) ?? 0),
        note: str(item.note),
        plannedScaleIn: Boolean(item.plannedScaleIn),
        averagingDown: Boolean(item.averagingDown),
      };
    }),
    plans: mapRows(row.plans, (item, index) => {
      const ticker = str(item.ticker).trim().toUpperCase();
      if (!ticker) return null;
      return {
        id: str(item.id) || `plan-${index}`,
        ticker,
        entry: str(item.entry),
        entryTiming: str(item.entryTiming),
        stop: str(item.stop),
        stopTiming: str(item.stopTiming),
        takeProfit: str(item.takeProfit),
        takeProfitTiming: str(item.takeProfitTiming),
        scaleInPrices: str(item.scaleInPrices),
        note: str(item.note),
        updatedAt: str(item.updatedAt),
      };
    }),
    scorecards: mapRows(row.scorecards, (item) => {
      const ticker = str(item.ticker).trim().toUpperCase();
      if (!ticker) return null;
      const clamp = (value: unknown) => Math.min(10, Math.max(0, num(value, 0) ?? 0));
      return {
        ticker,
        value: clamp(item.value),
        growth: clamp(item.growth),
        profitability: clamp(item.profitability),
        priceAction: clamp(item.priceAction),
        moatNote: str(item.moatNote),
        managementNote: str(item.managementNote),
        updatedAt: str(item.updatedAt),
      };
    }),
    watchlist: mapRows(row.watchlist, (item, index) => {
      const ticker = str(item.ticker).trim().toUpperCase();
      if (!ticker) return null;
      return { id: str(item.id) || `watch-${index}`, ticker, name: str(item.name) || ticker, note: str(item.note) };
    }),
    settings: settingsOf(row.settings, holdings.length > 0 || (Array.isArray(row.cashFlows) && row.cashFlows.length > 0) || (Array.isArray(row.trades) && row.trades.length > 0)),
    quotes: {},
    fx: (() => {
      const fx = rec(row.fx);
      const rate = num(fx?.rate, null);
      if (!fx || rate == null || rate <= 0) return null;
      return { rate, date: str(fx.date), fetchedAt: str(fx.fetchedAt), source: str(fx.source) || "backup" };
    })(),
    fxHistory: Array.isArray(row.fxHistory)
      ? row.fxHistory
          .flatMap((item) => {
            const fx = rec(item);
            const rate = num(fx?.rate, null);
            const date = str(fx?.date);
            if (!fx || !date || rate == null || rate <= 0) return [];
            return [{ date, rate }];
          })
          .sort((a, b) => a.date.localeCompare(b.date))
      : [],
    priceHistory: (() => {
      const bag = rec(row.priceHistory);
      if (!bag) return {};
      const out: Notebook["priceHistory"] = {};
      for (const [ticker, value] of Object.entries(bag)) {
        const series = rec(value);
        if (!series || !Array.isArray(series.points)) continue;
        const points = series.points.flatMap((point) => {
          const rowPoint = rec(point);
          const date = str(rowPoint?.date);
          const close = num(rowPoint?.close, null);
          if (!date || close == null || close <= 0) return [];
          return [{ date, close }];
        });
        points.sort((a, b) => a.date.localeCompare(b.date));
        if (!points.length) continue;
        const source = series.source === "yahoo" || series.source === "yahoo-proxy" ? series.source : "cnbc";
        out[ticker.toUpperCase()] = {
          points,
          adjusted: Boolean(series.adjusted),
          source,
          fetchedAt: str(series.fetchedAt),
        };
      }
      return out;
    })(),
    equitySnapshots: mapRows(row.equitySnapshots, (item) => {
      const date = str(item.date);
      const equity = num(item.equityHkd, null);
      if (!date || equity == null) return null;
      return { date, equityHkd: equity };
    }),
  };
}

export function notebookFromImport(input: unknown): Notebook {
  const row = rec(input);
  if (row && row.app === "investment-notebook" && row.notebook) return migrate(row.notebook);
  return migrate(input);
}

export function isBackupFile(input: unknown): input is BackupFile {
  const row = rec(input);
  return Boolean(row && row.app === "investment-notebook" && row.notebook);
}
