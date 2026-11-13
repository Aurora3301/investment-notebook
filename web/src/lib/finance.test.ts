import { describe, expect, it } from "vitest";
import { applyTrade, buildEquityCurve, forcedStopUsd, isAveragingDown, monthPerformance, performanceSummary, suggestSize, vooBenchmark, xirr } from "./calc";
import { nyDate, usCloseIso } from "./dates";
import { advise } from "./advice";
import { createDemo } from "./demo";
import { todayHK } from "./dates";
import { migrate } from "./normalize";
import { parseChangePct, parseCnbcQuotes, parseFrankfurter, parseMarketCap, parseYahooChart, yahooHistoryCovers } from "./quotes";
import { emptyNotebook } from "./types";

describe("xirr", () => {
  it("matches the Excel sample on actual/365", () => {
    const rate = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(rate).toBeCloseTo(0.3733625335, 6);
  });

  it("uses a 366-day leap-year span", () => {
    const rate = xirr([
      { date: "2020-01-01", amount: -10000 },
      { date: "2021-01-01", amount: 12000 },
    ]);
    expect(rate).toBeCloseTo(1.2 ** (365 / 366) - 1, 8);
  });

  it("treats deposits as outflows when summarizing a portfolio", () => {
    const summary = performanceSummary(
      [{ id: "1", date: "2024-01-02", amountHkd: 10000, note: "" }],
      11000,
      "2025-01-02",
    );
    expect(summary.profit).toBe(1000);
    expect(summary.simpleReturn).toBeCloseTo(0.1, 8);
    expect(summary.xirr).toBeGreaterThan(0);
  });
});

describe("risk", () => {
  it("places the forced stop where loss equals 2% of the account", () => {
    const stop = forcedStopUsd(100, 10, 100000, 8, 2);
    expect(stop).toBeCloseTo(75, 6);
  });

  it("ignores new deposits when measuring the monthly drawdown", () => {
    const hit = monthPerformance({
      monthStartEquity: 100000,
      monthStartDate: "2026-11-01",
      equityHkd: 110000,
      cashFlows: [{ date: "2026-11-05", amountHkd: 20000 }],
      knockoutPct: 6,
    });
    expect(hit.drawdownPct).toBeCloseTo(0.1, 8);
    expect(hit.knockedOut).toBe(true);
    const ok = monthPerformance({
      monthStartEquity: 100000,
      monthStartDate: "2026-11-01",
      equityHkd: 96000,
      cashFlows: [],
      knockoutPct: 6,
    });
    expect(ok.knockedOut).toBe(false);
  });
});

describe("averaging down", () => {
  it("flags a buy below cost only when no scale-in plan exists", () => {
    expect(
      isAveragingDown({ priorShares: 10, priorAvg: 100, side: "buy", price: 90, plannedScaleIn: false, scaleInPrices: "" }),
    ).toBe(true);
    expect(
      isAveragingDown({ priorShares: 10, priorAvg: 100, side: "buy", price: 110, plannedScaleIn: false, scaleInPrices: "" }),
    ).toBe(false);
    expect(
      isAveragingDown({ priorShares: 10, priorAvg: 100, side: "buy", price: 90, plannedScaleIn: true, scaleInPrices: "" }),
    ).toBe(false);
    expect(
      isAveragingDown({ priorShares: 10, priorAvg: 100, side: "buy", price: 90, plannedScaleIn: false, scaleInPrices: "90" }),
    ).toBe(false);
    expect(
      isAveragingDown({ priorShares: 0, priorAvg: 0, side: "buy", price: 90, plannedScaleIn: false, scaleInPrices: "" }),
    ).toBe(false);
  });
});

describe("sizing and benchmark", () => {
  it("shrinks the balanced slot when beta is higher", () => {
    const high = suggestSize({ style: "balanced", equityHkd: 800000, names: 8, beta: 2, priceUsd: 100, fx: 8, riskPct: 2 });
    const flat = suggestSize({ style: "balanced", equityHkd: 800000, names: 8, beta: 1, priceUsd: 100, fx: 8, riskPct: 2 });
    expect(high.targetHkd).toBeCloseTo(50000, 4);
    expect(flat.targetHkd).toBeCloseTo(100000, 4);
  });

  it("buys VOO with the same HKD cash flows", () => {
    const result = vooBenchmark({
      cashFlows: [{ id: "1", date: "2024-01-02", amountHkd: 8000, note: "" }],
      asOf: "2025-01-02",
      points: [
        { date: "2024-01-02", close: 100 },
        { date: "2025-01-02", close: 110 },
      ],
      adjusted: true,
      source: "test",
      fxHistory: [
        { date: "2024-01-02", rate: 8 },
        { date: "2025-01-02", rate: 8 },
      ],
      fxFallback: 8,
    });
    expect(result.shares).toBeCloseTo(10, 6);
    expect(result.terminalHkd).toBeCloseTo(8800, 4);
    expect(result.xirr).toBeCloseTo(1.1 ** (365 / 366) - 1, 6);
  });
});

describe("equity curve", () => {
  it("does not treat deposits as investment growth", () => {
    const curve = buildEquityCurve({
      cashFlows: [
        { id: "a", date: "2024-01-02", amountHkd: 1000, note: "" },
        { id: "b", date: "2024-02-01", amountHkd: 1000, note: "" },
      ],
      trades: [],
      priceHistory: {},
      fxHistory: [{ date: "2024-01-01", rate: 7.8 }],
      fxFallback: 7.8,
      asOf: "2024-03-01",
      startingCapitalHkd: null,
    });
    const last = curve.points[curve.points.length - 1];
    expect(last.equityHkd).toBeCloseTo(2000, 4);
    expect(last.index).toBeCloseTo(100, 4);
  });

  it("compounds a price change across the whole account", () => {
    const curve = buildEquityCurve({
      cashFlows: [{ id: "a", date: "2024-01-02", amountHkd: 7800, note: "" }],
      trades: [
        {
          id: "t",
          date: "2024-01-02",
          ticker: "AAA",
          side: "buy",
          shares: 10,
          priceUsd: 100,
          feesUsd: 0,
          note: "",
          plannedScaleIn: false,
          averagingDown: false,
        },
      ],
      priceHistory: { AAA: [{ date: "2024-01-03", close: 110 }] },
      fxHistory: [{ date: "2024-01-01", rate: 7.8 }],
      fxFallback: 7.8,
      asOf: "2024-01-03",
      startingCapitalHkd: null,
    });
    const last = curve.points[curve.points.length - 1];
    expect(last.equityHkd).toBeCloseTo(8580, 4);
    expect(last.index).toBeCloseTo(110, 4);
  });
});

describe("trades and migration", () => {
  it("recomputes average cost and cash when a buy is applied", () => {
    const start = emptyNotebook();
    start.cashHkd = 8000;
    start.fx = { rate: 8, date: "2024-01-02", fetchedAt: "", source: "test" };
    const next = applyTrade(
      start,
      {
        id: "t",
        date: "2024-01-02",
        ticker: "AAA",
        side: "buy",
        shares: 10,
        priceUsd: 50,
        feesUsd: 0,
        note: "",
        plannedScaleIn: false,
        averagingDown: false,
      },
      true,
    );
    expect(next.holdings[0]?.shares).toBe(10);
    expect(next.holdings[0]?.avgCostUsd).toBeCloseTo(50, 6);
    expect(next.cashHkd).toBeCloseTo(8000 - 10 * 50 * 8, 4);
  });

  it("fills defaults for an older empty document", () => {
    const notebook = migrate({});
    expect(notebook.schemaVersion).toBe(1);
    expect(notebook.settings.onboarding).toBe("pending");
    const withHolding = migrate({ holdings: [{ ticker: "AAPL", shares: 1, avgCostUsd: 1 }] });
    expect(withHolding.settings.onboarding).toBe("empty");
    expect(withHolding.holdings[0]?.gates).toHaveLength(4);
    expect(notebook.settings.gateTitles).toEqual(["關卡一", "關卡二", "關卡三", "關卡四"]);
    expect(notebook.settings.riskPct).toBe(2);
  });

  it("keeps the demo book obviously separate from a blank start", () => {
    const demo = createDemo();
    expect(demo.settings.onboarding).toBe("demo");
    expect(demo.watchlist.map((item) => item.ticker)).toEqual(["OKTA", "PANW", "CRWD", "VST", "VRT"]);
    expect(demo.trades.some((trade) => trade.averagingDown)).toBe(true);
  });
});

describe("on-device advice", () => {
  it("does not invent a price when CNBC has not quoted the holding", () => {
    const demo = createDemo();
    const result = advise(demo, "AAPL 而家點", { liveErrors: ["報價：失敗"], refreshed: false });
    expect(result.answer).toContain("未有 CNBC 現價");
    expect(result.answer).toContain("唔報市價");
    expect(result.answer).not.toContain("$210");
    expect(result.answer).not.toContain("大叔");
    expect(result.answer).not.toContain("阿樂");
    expect(result.answer).toContain("25");
  });

  it("uses the refreshed CNBC price and flags averaging down", () => {
    const demo = createDemo();
    demo.fx = { rate: 7.8, date: todayHK(), fetchedAt: new Date().toISOString(), source: "test" };
    demo.quotes.AAPL = {
      ticker: "AAPL",
      priceUsd: 210,
      asOf: new Date().toISOString(),
      currency: "USD",
      changePct: null,
      name: "Apple",
      beta: 1.1,
      marketCapUsd: null,
      session: "已收市",
      source: "CNBC",
    };
    const result = advise(demo, "有冇溝貨", { liveErrors: [], refreshed: true });
    expect(result.answer).toContain("210.00");
    expect(result.answer).toContain("JNJ");
    expect(result.quoteNote).toContain("CNBC");
  });
});

describe("quote parsing", () => {
  it("reads a CNBC quote without needing a position", () => {
    const quotes = parseCnbcQuotes({
      FormattedQuoteResult: {
        FormattedQuote: [
          {
            symbol: "AAPL",
            last: "354.88",
            change_pct: "-0.14%",
            name: "Apple Inc.",
            beta: "1.09",
            mktcapView: "5.157T",
            currencyCode: "USD",
            last_time: "2026-11-12",
            curmktstatus: "PRE_MKT",
            code: 0,
          },
        ],
      },
    });
    expect(quotes[0]?.priceUsd).toBeCloseTo(354.88, 2);
    expect(quotes[0]?.changePct).toBeCloseTo(-0.14, 4);
    expect(quotes[0]?.marketCapUsd).toBeCloseTo(5.157e12, -6);
    expect(quotes[0]?.session).toBe("盤前");
  });

  it("parses market cap suffixes and FX rows", () => {
    expect(parseMarketCap("31.912B")).toBeCloseTo(31.912e9, 0);
    expect(parseChangePct("-0.3365")).toBeCloseTo(-0.3365, 4);
    const fx = parseFrankfurter([{ date: "2026-11-13", base: "USD", quote: "HKD", rate: 7.85 }]);
    expect(fx[0]).toEqual({ date: "2026-11-13", rate: 7.85 });
  });

  it("prefers adjusted close and dates the bar in New York", () => {
    expect(nyDate(1704171600000)).toBe("2024-01-02");
    expect(usCloseIso("2024-01-02")).toBe("2024-01-02T21:00:00.000Z");
    const points = parseYahooChart({
      chart: {
        result: [
          {
            timestamp: [1704171600],
            indicators: {
              quote: [{ close: [434.01] }],
              adjclose: [{ adjclose: [419.54] }],
            },
          },
        ],
      },
    });
    expect(points[0]?.close).toBeCloseTo(419.54, 2);
    expect(points[0]?.date).toBe("2024-01-02");
  });

  it("keeps a short Yahoo series from replacing CNBC history", () => {
    const points = Array.from({ length: 40 }, (_, index) => ({ date: `2024-01-${String(index + 1).padStart(2, "0")}`, close: 100 }));
    expect(yahooHistoryCovers(points, "2024-03-01")).toBe(false);
    const long = Array.from({ length: 120 }, (_, index) => ({
      date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10),
      close: 100,
    }));
    expect(yahooHistoryCovers(long, "2024-03-01")).toBe(true);
    expect(yahooHistoryCovers(long, "2023-01-01")).toBe(false);
  });
});
