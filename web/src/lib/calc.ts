import type { CashFlow, Holding, Notebook, PricePoint, Quote, Trade } from "./types";
import { BROAD_SP_ETFS, LEVERED_ETFS } from "./types";
import { dayCount } from "./dates";

export interface DatedAmount {
  date: string;
  amount: number;
}

/** Excel-compatible XIRR. Day count is actual/365. Amount sign is investor cash flow. */
export function xirr(flows: DatedAmount[], guess = 0.1): number | null {
  const merged = new Map<string, number>();
  for (const flow of flows) {
    if (!flow.date || !Number.isFinite(flow.amount) || flow.amount === 0) continue;
    merged.set(flow.date, (merged.get(flow.date) ?? 0) + flow.amount);
  }
  const rows = [...merged.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) return null;
  if (!rows.some((row) => row.amount < 0) || !rows.some((row) => row.amount > 0)) return null;

  const t0 = rows[0].date;
  const years = (date: string) => dayCount(t0, date) / 365;
  const npv = (rate: number) =>
    rows.reduce((sum, row) => sum + row.amount / (1 + rate) ** years(row.date), 0);
  const dnpv = (rate: number) =>
    rows.reduce((sum, row) => sum + (-years(row.date) * row.amount) / (1 + rate) ** (years(row.date) + 1), 0);

  const guesses = [guess, 0.1, -0.5, 0.5, 1, -0.2, 0.2];
  for (const start of guesses) {
    let rate = start;
    let ok = true;
    for (let i = 0; i < 60; i += 1) {
      const base = 1 + rate;
      if (base <= 1e-6) {
        ok = false;
        break;
      }
      const y = npv(rate);
      const dy = dnpv(rate);
      if (!Number.isFinite(y) || !Number.isFinite(dy) || Math.abs(dy) < 1e-12) {
        ok = false;
        break;
      }
      const next = rate - y / dy;
      if (!Number.isFinite(next)) {
        ok = false;
        break;
      }
      if (Math.abs(next - rate) < 1e-10) return next;
      rate = next < -0.999999 ? -0.999999 : next;
    }
    if (ok && Math.abs(npv(rate)) < 1e-6) return rate;
  }

  let lo = -0.999999;
  let hi = 1;
  let flo = npv(lo);
  while (flo * npv(hi) > 0 && hi < 1e6) hi = hi * 2 + 1;
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-8) return mid;
    if (flo * fm <= 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

export function lookupOnOrBefore<T extends { date: string }>(rows: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.date <= date) best = row;
    else break;
  }
  return best;
}

export function sortByDate<T extends { date: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

export function fxOn(history: readonly { date: string; rate: number }[], date: string, fallback: number | null): number | null {
  const hit = lookupOnOrBefore(history, date);
  if (hit && hit.rate > 0) return hit.rate;
  return fallback && fallback > 0 ? fallback : null;
}

export function priceOn(points: readonly PricePoint[], date: string): { price: number; usedDate: string } | null {
  const hit = lookupOnOrBefore(points, date);
  if (!hit || hit.close <= 0) return null;
  return { price: hit.close, usedDate: hit.date };
}

export function isBroadSpEtf(ticker: string): boolean {
  return (BROAD_SP_ETFS as readonly string[]).includes(ticker.toUpperCase());
}

export function isLeveredEtf(ticker: string): boolean {
  return (LEVERED_ETFS as readonly string[]).includes(ticker.toUpperCase());
}

export interface PositionValue {
  holding: Holding;
  priceUsd: number | null;
  priceSource: "manual" | "quote" | "cost";
  mvHkd: number;
  costHkd: number;
  plHkd: number;
  plPct: number | null;
  weight: number | null;
}

export interface PortfolioValue {
  positions: PositionValue[];
  stockHkd: number;
  cashHkd: number;
  equityHkd: number;
  equityUsd: number | null;
  fx: number | null;
  provisional: boolean;
  unrealizedHkd: number;
}

export function currentFx(data: Pick<Notebook, "fx" | "settings">): number | null {
  if (data.fx && data.fx.rate > 0) return data.fx.rate;
  if (data.settings.manualUsdHkd && data.settings.manualUsdHkd > 0) return data.settings.manualUsdHkd;
  return null;
}

export function markPrice(holding: Holding, quote: Quote | undefined): { price: number | null; source: PositionValue["priceSource"] } {
  if (holding.manualPriceUsd != null && holding.manualPriceUsd > 0) {
    return { price: holding.manualPriceUsd, source: "manual" };
  }
  if (quote && quote.priceUsd > 0) return { price: quote.priceUsd, source: "quote" };
  if (holding.avgCostUsd > 0) return { price: holding.avgCostUsd, source: "cost" };
  return { price: null, source: "cost" };
}

export function valuePortfolio(data: Notebook): PortfolioValue {
  const fx = currentFx(data);
  const provisionalMissingFx = fx == null;
  const rate = fx ?? 0;
  let stockHkd = 0;
  let unrealizedHkd = 0;
  let provisional = provisionalMissingFx;
  const positions: PositionValue[] = data.holdings.map((holding) => {
    const marked = markPrice(holding, data.quotes[holding.ticker]);
    if (marked.source === "cost") provisional = true;
    const price = marked.price;
    const mvUsd = price == null ? 0 : holding.shares * price;
    const costUsd = holding.shares * holding.avgCostUsd;
    const mvHkd = rate > 0 ? mvUsd * rate : 0;
    const costHkd = rate > 0 ? costUsd * rate : 0;
    const plHkd = mvHkd - costHkd;
    stockHkd += mvHkd;
    unrealizedHkd += plHkd;
    const plPct = holding.avgCostUsd > 0 && price != null ? price / holding.avgCostUsd - 1 : null;
    return {
      holding,
      priceUsd: price,
      priceSource: marked.source,
      mvHkd,
      costHkd,
      plHkd,
      plPct,
      weight: null,
    };
  });
  const equityHkd = stockHkd + data.cashHkd;
  for (const position of positions) {
    position.weight = equityHkd > 0 ? position.mvHkd / equityHkd : null;
  }
  return {
    positions,
    stockHkd,
    cashHkd: data.cashHkd,
    equityHkd,
    equityUsd: rate > 0 ? equityHkd / rate : null,
    fx: fx,
    provisional,
    unrealizedHkd,
  };
}

export interface PerformanceSummary {
  grossDeposits: number;
  withdrawals: number;
  netInvested: number;
  equityHkd: number;
  profit: number;
  simpleReturn: number | null;
  xirr: number | null;
}

export function performanceSummary(cashFlows: CashFlow[], equityHkd: number, asOf: string): PerformanceSummary {
  let grossDeposits = 0;
  let withdrawals = 0;
  const flows: DatedAmount[] = [];
  for (const flow of cashFlows) {
    if (flow.date > asOf) continue;
    if (flow.amountHkd > 0) grossDeposits += flow.amountHkd;
    if (flow.amountHkd < 0) withdrawals += -flow.amountHkd;
    flows.push({ date: flow.date, amount: -flow.amountHkd });
  }
  const netInvested = grossDeposits - withdrawals;
  if (equityHkd !== 0) flows.push({ date: asOf, amount: equityHkd });
  const profit = equityHkd - netInvested;
  return {
    grossDeposits,
    withdrawals,
    netInvested,
    equityHkd,
    profit,
    simpleReturn: netInvested > 0 ? profit / netInvested : null,
    xirr: xirr(flows),
  };
}

export interface BenchmarkResult {
  xirr: number | null;
  terminalHkd: number | null;
  shares: number;
  capped: boolean;
  missing: string[];
  adjusted: boolean;
  source: string;
}

export function vooBenchmark(input: {
  cashFlows: CashFlow[];
  asOf: string;
  points: PricePoint[];
  adjusted: boolean;
  source: string;
  fxHistory: { date: string; rate: number }[];
  fxFallback: number | null;
}): BenchmarkResult {
  const missing: string[] = [];
  let shares = 0;
  let capped = false;
  const flows: DatedAmount[] = [];
  const sorted = sortByDate(input.cashFlows).filter((flow) => flow.date <= input.asOf && flow.amountHkd !== 0);
  for (const flow of sorted) {
    const fx = fxOn(input.fxHistory, flow.date, input.fxFallback);
    const px = priceOn(input.points, flow.date);
    if (fx == null || px == null) {
      missing.push(flow.date);
      continue;
    }
    if (flow.amountHkd > 0) {
      shares += flow.amountHkd / fx / px.price;
      flows.push({ date: flow.date, amount: -flow.amountHkd });
    } else {
      const wantUsd = Math.abs(flow.amountHkd) / fx;
      const haveUsd = shares * px.price;
      const sellUsd = Math.min(wantUsd, haveUsd);
      if (sellUsd + 1e-6 < wantUsd) capped = true;
      shares = Math.max(0, shares - sellUsd / px.price);
      const sellHkd = sellUsd * fx;
      if (sellHkd > 0) flows.push({ date: flow.date, amount: sellHkd });
    }
  }
  const endFx = fxOn(input.fxHistory, input.asOf, input.fxFallback);
  const endPx = priceOn(input.points, input.asOf);
  if (endFx == null || endPx == null) {
    missing.push(input.asOf);
    return { xirr: null, terminalHkd: null, shares, capped, missing, adjusted: input.adjusted, source: input.source };
  }
  const terminalHkd = shares * endPx.price * endFx;
  flows.push({ date: input.asOf, amount: terminalHkd });
  return {
    xirr: xirr(flows),
    terminalHkd,
    shares,
    capped,
    missing,
    adjusted: input.adjusted,
    source: input.source,
  };
}

export function forcedStopUsd(
  avgCostUsd: number,
  shares: number,
  equityHkd: number,
  fx: number,
  riskPct: number,
): number | null {
  if (shares <= 0 || fx <= 0 || equityHkd <= 0) return null;
  const capHkd = (equityHkd * riskPct) / 100;
  const perShareUsd = capHkd / fx / shares;
  return avgCostUsd - perShareUsd;
}

export interface PositionRisk {
  usedHkd: number;
  capHkd: number;
  overCap: boolean;
  forcedStop: number | null;
  activeStop: number | null;
  freed: boolean;
}

export function positionRisk(input: {
  holding: Holding;
  priceUsd: number | null;
  equityHkd: number;
  fx: number | null;
  riskPct: number;
}): PositionRisk {
  const capHkd = input.fx && input.equityHkd > 0 ? (input.equityHkd * input.riskPct) / 100 : 0;
  const forced = input.fx ? forcedStopUsd(input.holding.avgCostUsd, input.holding.shares, input.equityHkd, input.fx, input.riskPct) : null;
  if (input.holding.shares <= 0 || !input.fx) {
    return { usedHkd: 0, capHkd, overCap: false, forcedStop: forced, activeStop: input.holding.psychStopUsd, freed: false };
  }
  const profitable =
    input.priceUsd != null && input.holding.avgCostUsd > 0 && input.priceUsd >= input.holding.avgCostUsd - 1e-9;
  const breakeven =
    input.holding.breakevenStop ||
    (input.holding.psychStopUsd != null && input.holding.psychStopUsd >= input.holding.avgCostUsd - 1e-9 && profitable);
  if (breakeven) {
    return { usedHkd: 0, capHkd, overCap: false, forcedStop: forced, activeStop: input.holding.avgCostUsd, freed: true };
  }
  const costToZero = input.holding.shares * input.holding.avgCostUsd * input.fx;
  if (input.holding.psychStopUsd == null) {
    return {
      usedHkd: Math.min(capHkd, Math.max(0, costToZero)),
      capHkd,
      overCap: false,
      forcedStop: forced,
      activeStop: null,
      freed: false,
    };
  }
  const usedHkd = Math.max(0, input.holding.avgCostUsd - input.holding.psychStopUsd) * input.holding.shares * input.fx;
  return {
    usedHkd,
    capHkd,
    overCap: usedHkd > capHkd + 0.5,
    forcedStop: forced,
    activeStop: input.holding.psychStopUsd,
    freed: false,
  };
}

export interface MonthResult {
  drawdownPct: number | null;
  pnlHkd: number | null;
  netFlowHkd: number;
  knockedOut: boolean;
}

export function monthPerformance(input: {
  monthStartEquity: number | null;
  monthStartDate: string | null;
  equityHkd: number;
  cashFlows: Pick<CashFlow, "date" | "amountHkd">[];
  knockoutPct: number;
}): MonthResult {
  if (input.monthStartEquity == null || input.monthStartEquity <= 0 || !input.monthStartDate) {
    return { drawdownPct: null, pnlHkd: null, netFlowHkd: 0, knockedOut: false };
  }
  const netFlowHkd = input.cashFlows
    .filter((flow) => flow.date > input.monthStartDate!)
    .reduce((sum, flow) => sum + flow.amountHkd, 0);
  const adjusted = input.equityHkd - netFlowHkd;
  const pnlHkd = adjusted - input.monthStartEquity;
  const drawdownPct = pnlHkd >= 0 ? 0 : -pnlHkd / input.monthStartEquity;
  return {
    drawdownPct,
    pnlHkd,
    netFlowHkd,
    knockedOut: drawdownPct >= input.knockoutPct / 100 - 1e-12,
  };
}

export function isAveragingDown(input: {
  priorShares: number;
  priorAvg: number;
  side: "buy" | "sell";
  price: number;
  plannedScaleIn: boolean;
  scaleInPrices: string;
}): boolean {
  if (input.side !== "buy") return false;
  if (input.priorShares <= 0 || input.priorAvg <= 0) return false;
  if (input.price >= input.priorAvg - 1e-9) return false;
  if (input.plannedScaleIn) return false;
  if (input.scaleInPrices.trim().length > 0) return false;
  return true;
}

export function balancedTargetHkd(equityHkd: number, names: number, beta: number): number | null {
  if (equityHkd <= 0 || names <= 0 || beta <= 0) return null;
  return equityHkd / names / beta;
}

export function sharesForHkd(targetHkd: number, priceUsd: number, fx: number): number | null {
  if (targetHkd <= 0 || priceUsd <= 0 || fx <= 0) return null;
  return targetHkd / (priceUsd * fx);
}

export function aggressiveStopUsd(priceUsd: number, shares: number, equityHkd: number, fx: number, sleevePct = 6): number | null {
  if (priceUsd <= 0 || shares <= 0 || equityHkd <= 0 || fx <= 0) return null;
  const lossUsd = (equityHkd * sleevePct) / 100 / fx;
  return priceUsd - lossUsd / shares;
}

export interface ClosedLot {
  ticker: string;
  openDate: string;
  closeDate: string;
  shares: number;
  pnlUsd: number;
  rMultiple: number | null;
}

export function closedTrades(input: {
  trades: Trade[];
  equityAt: (date: string) => number | null;
  fxAt: (date: string) => number | null;
  rPct: number;
}): ClosedLot[] {
  const lots: Record<string, { shares: number; price: number; date: string }[]> = {};
  const closed: ClosedLot[] = [];
  for (const trade of sortByDate(input.trades)) {
    const book = (lots[trade.ticker] ??= []);
    if (trade.side === "buy") {
      const feePer = trade.shares > 0 ? trade.feesUsd / trade.shares : 0;
      book.push({ shares: trade.shares, price: trade.priceUsd + feePer, date: trade.date });
      continue;
    }
    let left = trade.shares;
    const sellFeePer = trade.shares > 0 ? trade.feesUsd / trade.shares : 0;
    while (left > 1e-8 && book.length) {
      const lot = book[0];
      const take = Math.min(left, lot.shares);
      const pnl = (trade.priceUsd - sellFeePer - lot.price) * take;
      const equity = input.equityAt(lot.date);
      const fx = input.fxAt(lot.date);
      let rMultiple: number | null = null;
      if (equity != null && equity > 0 && fx != null && fx > 0 && input.rPct > 0) {
        const riskUsd = (equity * input.rPct) / 100 / fx;
        if (riskUsd > 0) rMultiple = pnl / riskUsd;
      }
      closed.push({
        ticker: trade.ticker,
        openDate: lot.date,
        closeDate: trade.date,
        shares: take,
        pnlUsd: pnl,
        rMultiple,
      });
      lot.shares -= take;
      left -= take;
      if (lot.shares <= 1e-8) book.shift();
    }
  }
  return closed;
}

export function expectancyR(winRatePct: number, avgWinR: number, avgLossR: number): number | null {
  if (![winRatePct, avgWinR, avgLossR].every(Number.isFinite)) return null;
  const p = winRatePct / 100;
  if (p < 0 || p > 1) return null;
  return p * avgWinR - (1 - p) * Math.abs(avgLossR);
}

export interface CurvePoint {
  date: string;
  equityHkd: number;
  index: number;
  estimated: boolean;
}

export function buildEquityCurve(input: {
  cashFlows: CashFlow[];
  trades: Trade[];
  priceHistory: Record<string, PricePoint[]>;
  fxHistory: { date: string; rate: number }[];
  fxFallback: number | null;
  asOf: string;
  startingCapitalHkd: number | null;
}): { points: CurvePoint[]; estimated: boolean; note: string } {
  const trades = sortByDate(input.trades).filter((trade) => trade.date <= input.asOf);
  const flows = sortByDate(input.cashFlows).filter((flow) => flow.date <= input.asOf);
  const eventDates = new Set<string>();
  for (const trade of trades) eventDates.add(trade.date);
  for (const flow of flows) eventDates.add(flow.date);
  eventDates.add(input.asOf);
  const sampleSource = Object.values(input.priceHistory).sort((a, b) => b.length - a.length)[0] ?? [];
  for (let i = 0; i < sampleSource.length; i += 5) {
    const date = sampleSource[i].date;
    if (date <= input.asOf) eventDates.add(date);
  }
  const dates = [...eventDates].sort();
  const shares: Record<string, number> = {};
  const avg: Record<string, number> = {};
  let cash = input.cashFlows.length === 0 && input.startingCapitalHkd ? input.startingCapitalHkd : 0;
  let ti = 0;
  let fi = 0;
  let index = 100;
  let prev: number | null = null;
  let estimated = input.fxFallback == null && input.fxHistory.length === 0;
  const points: CurvePoint[] = [];
  const rateFor = (date: string) => {
    const rate = fxOn(input.fxHistory, date, input.fxFallback);
    if (rate == null) {
      estimated = true;
      return input.fxFallback ?? 7.8;
    }
    if (input.fxHistory.length === 0) estimated = true;
    return rate;
  };

  for (const date of dates) {
    let external = 0;
    while (fi < flows.length && flows[fi].date <= date) {
      if (flows[fi].date === date) external += flows[fi].amountHkd;
      cash += flows[fi].amountHkd;
      fi += 1;
    }
    while (ti < trades.length && trades[ti].date <= date) {
      const trade = trades[ti];
      const fx = rateFor(trade.date);
      const held = shares[trade.ticker] ?? 0;
      if (trade.side === "buy") {
        const next = held + trade.shares;
        const prevAvg = avg[trade.ticker] ?? 0;
        avg[trade.ticker] = next > 0 ? (held * prevAvg + trade.shares * trade.priceUsd + trade.feesUsd) / next : 0;
        shares[trade.ticker] = next;
        cash -= (trade.shares * trade.priceUsd + trade.feesUsd) * fx;
      } else {
        const sold = Math.min(held, trade.shares);
        shares[trade.ticker] = held - sold;
        const fee = trade.shares > 0 ? (trade.feesUsd * sold) / trade.shares : 0;
        cash += (sold * trade.priceUsd - fee) * fx;
      }
      ti += 1;
    }
    let market = 0;
    let pointEstimated = false;
    const fx = rateFor(date);
    for (const [ticker, qty] of Object.entries(shares)) {
      if (qty <= 1e-8) continue;
      const px = priceOn(input.priceHistory[ticker] ?? [], date);
      if (px) market += qty * px.price * fx;
      else {
        pointEstimated = true;
        estimated = true;
        market += qty * (avg[ticker] ?? 0) * fx;
      }
    }
    const equity = cash + market;
    if (prev != null && prev > 0) {
      const ret = (equity - prev - external) / prev;
      if (Number.isFinite(ret)) index *= 1 + ret;
    }
    points.push({ date, equityHkd: equity, index, estimated: pointEstimated });
    prev = equity;
  }
  const firstActive = points.findIndex((point) => Math.abs(point.equityHkd) > 0.5);
  const trimmed = firstActive > 0 ? points.slice(firstActive) : points;
  const note = estimated
    ? "部分日子未有市價或匯率，曲線用成本或後備匯率補上，只供看形狀。"
    : "入金與提款已從升幅剔除，斜線代表整個戶口，而不是單一一隻股票。";
  return { points: trimmed, estimated, note };
}

export function netSharesByTicker(trades: Trade[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const trade of trades) {
    const sign = trade.side === "buy" ? 1 : -1;
    out[trade.ticker] = (out[trade.ticker] ?? 0) + sign * trade.shares;
  }
  return out;
}

export function passesConservativeFilter(holding: Holding): { cap: boolean; beta: boolean } {
  const cap = holding.marketCapUsd != null && holding.marketCapUsd > 10_000_000_000;
  const beta = holding.beta != null && holding.beta < 1;
  return { cap, beta };
}

export interface SizeSuggestion {
  targetHkd: number | null;
  shares: number | null;
  stopUsd: number | null;
  note: string;
}

export function suggestSize(input: {
  style: "balanced" | "conservative" | "aggressive";
  equityHkd: number;
  names: number;
  beta: number;
  priceUsd: number;
  fx: number;
  riskPct: number;
}): SizeSuggestion {
  const { style, equityHkd, priceUsd, fx } = input;
  if (equityHkd <= 0 || priceUsd <= 0 || fx <= 0) {
    return { targetHkd: null, shares: null, stopUsd: null, note: "請先有總資產、股價同匯率。" };
  }
  if (style === "conservative") {
    const targetHkd = equityHkd * 0.1;
    const shares = sharesForHkd(targetHkd, priceUsd, fx);
    return {
      targetHkd,
      shares,
      stopUsd: null,
      note: "保守型個股建議約總資產 10%。檢查點是五年，不是 2% 止蝕。仍要自行核對市值大於 100 億美元、Beta 小於 1。",
    };
  }
  if (style === "aggressive") {
    const targetHkd = equityHkd / 5;
    const shares = sharesForHkd(targetHkd, priceUsd, fx);
    const stopUsd = shares ? aggressiveStopUsd(priceUsd, shares, equityHkd, fx, 6) : null;
    return {
      targetHkd,
      shares,
      stopUsd,
      note: "進取型五隻等權。每隻止蝕對應總資產 6%，五隻同時觸發約 30%。不使用衍生工具。平倉後重新分成五份。",
    };
  }
  const names = Math.min(10, Math.max(8, input.names || 8));
  if (input.beta <= 0) {
    return { targetHkd: null, shares: null, stopUsd: null, note: "均衡型需要正數 Beta。Beta 愈高，倉位愈小。" };
  }
  const targetHkd = balancedTargetHkd(equityHkd, names, input.beta);
  const shares = targetHkd ? sharesForHkd(targetHkd, priceUsd, fx) : null;
  const stopUsd =
    shares && targetHkd ? forcedStopUsd(priceUsd, shares, equityHkd, fx, input.riskPct) : null;
  return {
    targetHkd,
    shares,
    stopUsd,
    note: `均衡型用建議隻數 ${names}：目標市值 ≈（總資產 ÷ N）÷ Beta。Beta 高過 1 的總和通常小於總資產，剩餘現金加到最高把握的那一隻。止蝕仍跟 2% / 6%。`,
  };
}

/** Apply a validated trade. Buy updates average cost; sell does not. */
export function applyTrade(data: Notebook, trade: Trade, sync: boolean): Notebook {
  const trades = [...data.trades, trade];
  if (!sync) return { ...data, trades };
  const fx = fxOn(data.fxHistory, trade.date, currentFx(data));
  let cashHkd = data.cashHkd;
  if (fx != null) {
    if (trade.side === "buy") cashHkd -= (trade.shares * trade.priceUsd + trade.feesUsd) * fx;
    else cashHkd += (trade.shares * trade.priceUsd - trade.feesUsd) * fx;
  }
  const holdings = data.holdings.map((holding) => ({ ...holding, keyDates: [...holding.keyDates], gates: [...holding.gates] as Holding["gates"] }));
  let holding = holdings.find((item) => item.ticker === trade.ticker);
  if (!holding && trade.side === "buy") {
    holding = {
      id: trade.id,
      ticker: trade.ticker,
      name: data.watchlist.find((item) => item.ticker === trade.ticker)?.name || trade.ticker,
      shares: 0,
      avgCostUsd: 0,
      notes: "",
      sector: "",
      beta: null,
      marketCapUsd: null,
      betaManual: false,
      marketCapManual: false,
      psychStopUsd: null,
      breakevenStop: false,
      conviction: false,
      manualPriceUsd: null,
      gates: [
        { color: "unset", note: "" },
        { color: "unset", note: "" },
        { color: "unset", note: "" },
        { color: "unset", note: "" },
      ],
      keyDates: [],
    };
    holdings.push(holding);
  }
  if (holding && trade.side === "buy") {
    const next = holding.shares + trade.shares;
    holding.avgCostUsd = next > 0 ? (holding.shares * holding.avgCostUsd + trade.shares * trade.priceUsd + trade.feesUsd) / next : 0;
    holding.shares = next;
    if (trade.priceUsd >= holding.avgCostUsd) holding.breakevenStop = false;
  } else if (holding && trade.side === "sell") {
    holding.shares = Math.max(0, holding.shares - trade.shares);
  }
  return { ...data, trades, holdings, cashHkd };
}
