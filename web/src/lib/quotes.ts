import type { FxQuote, Notebook, PricePoint, PriceSeries, Quote } from "./types";
import { addDays, nyDate, todayHK, usCloseIso } from "./dates";

const HISTORY_START = "2010-01-01";
const CNBC_QUOTE = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol";
const FRANKFURTER = "https://api.frankfurter.dev/v2/rates";

export interface MarketUpdate {
  quotes: Record<string, Quote>;
  fx: FxQuote | null;
  fxHistory: { date: string; rate: number }[];
  priceHistory: Record<string, PriceSeries>;
  errors: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function message(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "逾時";
    return error.message || "失敗";
  }
  return "失敗";
}

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function parseLooseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/[$,]/g, "").replace(/^\+/, "");
  if (!text || text.toUpperCase() === "N/A" || text === "—" || text === "-") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** CNBC prints caps as 31.912B / 5.157T. */
export function parseMarketCap(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/[$,\s]/g, "").toUpperCase();
  const match = text.match(/^([0-9]*\.?[0-9]+)([KMBT])?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const mult = match[2] === "K" ? 1e3 : match[2] === "M" ? 1e6 : match[2] === "B" ? 1e9 : match[2] === "T" ? 1e12 : 1;
  return n * mult;
}

export function parseChangePct(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  return parseLooseNumber(raw.replace("%", ""));
}

function sessionLabel(raw: string): string {
  const map: Record<string, string> = {
    PRE_MKT: "盤前",
    REGULAR: "交易時段",
    REG_MKT: "交易時段",
    POST_MKT: "盤後",
    POST: "盤後",
    CLOSED: "已收市",
  };
  return map[raw] ?? (raw || "最近收市");
}

function quoteAsOf(row: Record<string, unknown>): string {
  const last = typeof row.last_time === "string" ? row.last_time : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return usCloseIso(last);
  if (last.includes("T")) {
    const parsed = new Date(last);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const stamp = typeof row.last_timedate === "string" ? row.last_timedate : "";
  const match = stamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    const iso = `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    return usCloseIso(iso);
  }
  return new Date().toISOString();
}

export function parseCnbcQuotes(payload: unknown): Quote[] {
  const root = asRecord(payload);
  if (!root) return [];
  const buckets = [
    asRecord(root.FormattedQuoteResult)?.FormattedQuote,
    asRecord(root.QuickQuoteResult)?.QuickQuote,
    asRecord(root.ITVQuoteResult)?.ITVQuote,
  ];
  const list = buckets.find(Array.isArray) as Record<string, unknown>[] | undefined;
  if (!list) return [];
  const quotes: Quote[] = [];
  for (const row of list) {
    const ticker = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    const price = parseLooseNumber(typeof row.last === "string" ? row.last.replace(/[$,]/g, "") : row.last);
    if (!ticker || price == null || price <= 0) continue;
    const code = row.code;
    if (code != null && String(code) !== "0" && String(code) !== "") continue;
    quotes.push({
      ticker,
      priceUsd: price,
      asOf: quoteAsOf(row),
      currency: typeof row.currencyCode === "string" && row.currencyCode ? row.currencyCode : "USD",
      changePct: parseChangePct(row.change_pct),
      name: typeof row.name === "string" ? row.name : ticker,
      beta: parseLooseNumber(row.beta),
      marketCapUsd: parseMarketCap(row.mktcapView),
      session: sessionLabel(typeof row.curmktstatus === "string" ? row.curmktstatus : ""),
      source: "CNBC",
    });
  }
  return quotes;
}

export function parseCnbcBars(payload: unknown): PricePoint[] {
  const bars = asRecord(asRecord(payload)?.barData)?.priceBars;
  if (!Array.isArray(bars)) return [];
  const points: PricePoint[] = [];
  for (const bar of bars) {
    const row = asRecord(bar);
    if (!row) continue;
    const ms = typeof row.tradeTimeinMills === "number" ? row.tradeTimeinMills : Number(row.tradeTimeinMills);
    const close = parseLooseNumber(row.close);
    if (!Number.isFinite(ms) || close == null || close <= 0) continue;
    points.push({ date: nyDate(ms), close });
  }
  return dedupePoints(points);
}

export function parseFrankfurter(payload: unknown): { date: string; rate: number }[] {
  if (!Array.isArray(payload)) return [];
  const rows: { date: string; rate: number }[] = [];
  for (const item of payload) {
    const row = asRecord(item);
    const date = typeof row?.date === "string" ? row.date : "";
    const rate = typeof row?.rate === "number" ? row.rate : Number(row?.rate);
    if (!date || !Number.isFinite(rate) || rate <= 0) continue;
    if (row?.quote && row.quote !== "HKD") continue;
    rows.push({ date, rate });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function unwrapProxy(payload: unknown): unknown {
  const row = asRecord(payload);
  if (!row || !("contents" in row)) return payload;
  if (typeof row.contents === "string") {
    try {
      return JSON.parse(row.contents);
    } catch {
      return payload;
    }
  }
  return row.contents ?? payload;
}

export function parseYahooChart(payload: unknown): PricePoint[] {
  const chart = asRecord(asRecord(payload)?.chart);
  const result = chart?.result;
  const node = asRecord(Array.isArray(result) ? result[0] : null);
  if (!node) return [];
  const timestamps = Array.isArray(node.timestamp) ? node.timestamp : [];
  const indicators = asRecord(node.indicators);
  const quote = asRecord(Array.isArray(indicators?.quote) ? indicators.quote[0] : null);
  const adjWrap = asRecord(Array.isArray(indicators?.adjclose) ? indicators.adjclose[0] : null);
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const adjusted = Array.isArray(adjWrap?.adjclose) ? adjWrap.adjclose : [];
  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ms = Number(timestamps[i]) * (Number(timestamps[i]) < 10_000_000_000 ? 1000 : 1);
    const adj = typeof adjusted[i] === "number" ? adjusted[i] : null;
    const raw = typeof closes[i] === "number" ? closes[i] : null;
    const close = adj ?? raw;
    if (!Number.isFinite(ms) || close == null || !(close > 0)) continue;
    points.push({ date: nyDate(ms), close });
  }
  return dedupePoints(points);
}

export function dedupePoints(points: PricePoint[]): PricePoint[] {
  const map = new Map<string, number>();
  for (const point of points) {
    if (!point.date || !(point.close > 0)) continue;
    map.set(point.date, point.close);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, close]) => ({ date, close }));
}

export function seriesFresh(series: PriceSeries | undefined, today: string): boolean {
  if (!series || series.points.length < 30) return false;
  const age = Date.now() - Date.parse(series.fetchedAt);
  if (!Number.isFinite(age) || age > 18 * 3600 * 1000) return false;
  const last = series.points[series.points.length - 1]?.date ?? "";
  return last >= addDays(today, -5);
}

export function fxFresh(history: { date: string }[], today: string): boolean {
  if (history.length < 100) return false;
  return (history[history.length - 1]?.date ?? "") >= addDays(today, -4);
}

export function quoteSymbols(data: Notebook): string[] {
  const set = new Set<string>(["VOO"]);
  for (const holding of data.holdings) if (holding.ticker) set.add(holding.ticker);
  for (const item of data.watchlist) if (item.ticker) set.add(item.ticker);
  for (const trade of data.trades) if (trade.ticker) set.add(trade.ticker);
  return [...set];
}

export function historySymbols(data: Notebook): string[] {
  const set = new Set<string>(["VOO"]);
  for (const holding of data.holdings) if (holding.shares > 0 && holding.ticker) set.add(holding.ticker);
  for (const trade of data.trades) if (trade.ticker) set.add(trade.ticker);
  return [...set];
}

function compact(iso: string): string {
  return iso.replace(/-/g, "");
}

async function fetchCnbcQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return [];
  const url = `${CNBC_QUOTE}?symbols=${symbols.map(encodeURIComponent).join("%7C")}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=0&output=json`;
  return parseCnbcQuotes(await fetchJson(url, 12000));
}

async function fetchCnbcHistory(symbol: string, start: string, end: string): Promise<PricePoint[]> {
  const url = `https://ts-api.cnbc.com/harmony/app/bars/${encodeURIComponent(symbol)}/1D/${compact(start)}000000/${compact(end)}000000/unadjusted/gmt.json`;
  return parseCnbcBars(await fetchJson(url, 20000));
}

async function fetchFxLatest(): Promise<FxQuote> {
  const rows = parseFrankfurter(await fetchJson(`${FRANKFURTER}?base=USD&quotes=HKD`, 12000));
  const last = rows[rows.length - 1];
  if (!last) throw new Error("沒有匯率");
  return { rate: last.rate, date: last.date, fetchedAt: new Date().toISOString(), source: "Frankfurter / 歐洲央行" };
}

async function fetchFxHistory(start: string, end: string): Promise<{ date: string; rate: number }[]> {
  const rows = parseFrankfurter(await fetchJson(`${FRANKFURTER}?base=USD&quotes=HKD&from=${start}&to=${end}`, 20000));
  if (rows.length < 10) throw new Error("歷史匯率太短");
  return rows;
}

async function fetchYahooAdjusted(symbol: string, start: string, end: string): Promise<{ points: PricePoint[]; source: "yahoo" | "yahoo-proxy" } | null> {
  const period1 = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000);
  const period2 = Math.floor(Date.parse(`${end}T23:59:59Z`) / 1000);
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`;
  try {
    const points = parseYahooChart(await fetchJson(yahoo, 8000));
    if (points.length > 50) return { points, source: "yahoo" };
  } catch {
    /* Browser CORS usually rejects Yahoo. */
  }
  try {
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahoo)}`;
    const points = parseYahooChart(unwrapProxy(await fetchJson(proxied, 15000)));
    if (points.length > 50) return { points, source: "yahoo-proxy" };
  } catch {
    /* Proxy is optional. */
  }
  return null;
}

async function pool(symbols: string[], limit: number, task: (symbol: string) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, symbols.length) }, async () => {
    while (index < symbols.length) {
      const current = symbols[index];
      index += 1;
      await task(current);
    }
  });
  await Promise.all(workers);
}

export async function refreshMarketData(current: Notebook, opts?: { forceHistory?: boolean }): Promise<MarketUpdate> {
  const today = todayHK();
  const errors: string[] = [];
  const symbols = quoteSymbols(current);
  let freshQuotes: Quote[] = [];
  let fx = current.fx;
  const results = await Promise.allSettled([fetchCnbcQuotes(symbols), fetchFxLatest()]);
  if (results[0].status === "fulfilled") freshQuotes = results[0].value;
  else errors.push(`報價：${message(results[0].reason)}`);
  if (results[1].status === "fulfilled") fx = results[1].value;
  else errors.push(`匯率：${message(results[1].reason)}`);

  const quotes: Record<string, Quote> = { ...current.quotes };
  for (const quote of freshQuotes) quotes[quote.ticker] = quote;

  let fxHistory = current.fxHistory;
  if (opts?.forceHistory || !fxFresh(fxHistory, today)) {
    try {
      fxHistory = await fetchFxHistory(HISTORY_START, today);
    } catch (error) {
      errors.push(`歷史匯率：${message(error)}`);
    }
  }

  const priceHistory: Record<string, PriceSeries> = { ...current.priceHistory };
  const needed = historySymbols(current);
  await pool(needed, 3, async (symbol) => {
    if (!opts?.forceHistory && seriesFresh(priceHistory[symbol], today)) return;
    try {
      const points = await fetchCnbcHistory(symbol, HISTORY_START, today);
      if (points.length) {
        priceHistory[symbol] = {
          points,
          adjusted: false,
          source: "cnbc",
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      errors.push(`${symbol} 歷史價：${message(error)}`);
    }
  });

  const earliestFlow = current.cashFlows.map((flow) => flow.date).sort()[0];
  try {
    const adjusted = await fetchYahooAdjusted("VOO", HISTORY_START, today);
    if (adjusted && adjusted.points.length > 100) {
      const first = adjusted.points[0]?.date ?? "";
      const covers = !earliestFlow || first <= earliestFlow;
      if (covers) {
        priceHistory.VOO = {
          points: adjusted.points,
          adjusted: true,
          source: adjusted.source,
          fetchedAt: new Date().toISOString(),
        };
      }
    }
  } catch {
    /* CNBC close remains the working series. */
  }

  return { quotes, fx, fxHistory, priceHistory, errors };
}
