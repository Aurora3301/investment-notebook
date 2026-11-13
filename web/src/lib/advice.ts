import {
  isBroadSpEtf,
  monthPerformance,
  performanceSummary,
  positionRisk,
  valuePortfolio,
  type PositionValue,
} from "./calc";
import { addDays, formatHK, todayHK } from "./dates";
import { hkd, pct, sharesText, usd } from "./format";
import { CYCLE_INFO, type Notebook } from "./types";

/**
 * On-device retrieval for short portfolio checks.
 * The caller refreshes CNBC last prices and Frankfurter FX first.
 * This module never fetches, and it never sends the notebook anywhere.
 * Answers only quote prices that are already on the device. Missing or
 * stale quotes are named as such instead of being filled in.
 */

export interface AdviceResult {
  answer: string;
  retrieved: string[];
  quoteNote: string;
}

const RULES = {
  risk: "單筆最多虧總戶口的風險百分比（預設 2%），不是該倉位市值的 2%。本月回撤相對起始資產達到上限（預設 6%）時，應平倉並停止交易至月底。獲利後可以把止蝕移到打和，釋放該筆風險。",
  gates: "每隻持股有四個關卡，預設叫關卡一至關卡四，用紅、黃、綠同備註自己記。名稱可以在設定修改。",
  score: "選股評分四項各 10 分：企業價值、成長能力、盈利能力、價格走勢，合計 40。另有護城河同管理層筆記。",
  average: "低於現有成本再買入，而且沒有預先寫下的分注，就是溝貨。獲利後加倉，或者買入價已寫在分注計劃，則不是。",
  balanced: "均衡型大約 8 至 10 隻，倉位約等於（總資產 ÷ 隻數）÷ Beta。Beta 愈高，倉位愈小。",
  conservative: "保守型大約 40% 未加槓桿的寬基標普 ETF、20% 現金、40% 個股。個股宜市值大於 100 億美元、Beta 小於 1。檢查點是五年，不是 2% 止蝕。",
  aggressive: "進取型大約 5 隻，每隻止蝕對應總資產約 6%，五隻同時觸發約 30%。不用衍生工具。",
  macro: "復甦偏向週期股與價值股；擴張偏向成長股與週期股；高峰滯漲偏向防守股與現金；衰退偏向價值股、防守股與現金。通脹傳導次序是 PMI，然後 PPI，然後 CPI。",
};

export function advise(notebook: Notebook, question: string, opts: { liveErrors: string[]; refreshed: boolean }): AdviceResult {
  const asked = question.trim();
  const valuation = valuePortfolio(notebook);
  const today = todayHK();
  const quoteNote = describeQuotes(notebook, valuation.positions, opts, today);
  const retrieved = retrieve(notebook, asked);
  if (!asked) {
    return {
      quoteNote,
      retrieved,
      answer: `${quoteNote}\n\n請先寫一條問題，例如「而家個組合點」或「有冇溝貨」。\n\n以上只供個人參考，不是持牌投資建議。價格只用 CNBC 最近報價同你自己輸入的成本，全部在這部裝置計算。`,
    };
  }
  const parts = [quoteNote, "", answerBody(notebook, valuation, asked, retrieved, today)];
  parts.push("", "以上只供個人參考，不是持牌投資建議。價格只用 CNBC 最近報價同你自己輸入的成本，全部在這部裝置計算。");
  return { quoteNote, retrieved, answer: parts.filter((line) => line !== undefined).join("\n") };
}

function describeQuotes(
  notebook: Notebook,
  positions: PositionValue[],
  opts: { liveErrors: string[]; refreshed: boolean },
  today: string,
): string {
  const open = positions.filter((position) => position.holding.shares > 0);
  const missing = open.filter((position) => position.priceSource !== "quote" && position.holding.manualPriceUsd == null).map((position) => position.holding.ticker);
  const stale = open
    .filter((position) => {
      const quote = notebook.quotes[position.holding.ticker];
      if (!quote || position.holding.manualPriceUsd != null) return false;
      const day = formatHK(quote.asOf).slice(0, 10);
      return day < addDays(today, -3);
    })
    .map((position) => position.holding.ticker);
  const lines: string[] = [];
  if (!opts.refreshed || opts.liveErrors.length) {
    lines.push(`今次 CNBC 或匯率更新未完全成功${opts.liveErrors.length ? `（${opts.liveErrors.join("；")}）` : ""}。下面唔會估新價。`);
  } else {
    lines.push("已先向 CNBC 更新現價，美元兌港元用 Frankfurter。");
  }
  if (!notebook.fx) lines.push("裝置上未有美元兌港元，港元市值唔會計，亦唔會估一個匯率。");
  if (missing.length) lines.push(`未有 CNBC 現價，唔會當市價用：${missing.join("、")}。`);
  if (stale.length) lines.push(`報價日期早過三日，請當過時：${stale.join("、")}。`);
  return lines.join("");
}

function retrieve(notebook: Notebook, question: string): string[] {
  const q = question.toLowerCase();
  const tags = ["本機持股同現金"];
  if (/風險|止蝕|回撤|2%|6%|打和/.test(question)) tags.push("本機風險規則");
  if (/溝|加倉|平均/.test(question)) tags.push("本機買賣紀錄");
  if (/評分|選股|40|企業|護城河/.test(q) || /評分|選股/.test(question)) tags.push("本機評分");
  if (/計劃|止賺|入場|分注/.test(question)) tags.push("本機交易計劃");
  if (/周期|復甦|擴張|高峰|衰退/.test(question)) tags.push("本機周期");
  if (/比重|配置|均衡|保守|進取|倉位/.test(question)) tags.push("本機配置規則");
  if (/回報|xirr|標普|voo/i.test(question)) tags.push("本機回報");
  const tickers = new Set<string>();
  for (const holding of notebook.holdings) {
    if (question.toUpperCase().includes(holding.ticker)) tickers.add(holding.ticker);
  }
  for (const ticker of tickers) tags.push(`本機 ${ticker}`);
  return tags;
}

function answerBody(
  notebook: Notebook,
  valuation: ReturnType<typeof valuePortfolio>,
  question: string,
  retrieved: string[],
  today: string,
): string {
  const chunks: string[] = [];
  const wantAll = retrieved.length <= 2;
  if (wantAll || retrieved.some((tag) => tag.startsWith("本機持股") || tag.startsWith("本機 "))) {
    chunks.push(portfolioChunk(notebook, valuation));
  }
  if (wantAll || retrieved.includes("本機風險規則")) chunks.push(riskChunk(notebook, valuation));
  if (wantAll || retrieved.includes("本機買賣紀錄")) chunks.push(averageChunk(notebook));
  if (retrieved.includes("本機評分") || /評分|選股/.test(question)) chunks.push(scoreChunk(notebook, question));
  if (retrieved.includes("本機交易計劃") || /計劃|止賺|入場/.test(question)) chunks.push(planChunk(notebook, question));
  if (retrieved.includes("本機周期") || /周期|復甦|擴張|高峰|衰退/.test(question)) chunks.push(macroChunk(notebook));
  if (retrieved.includes("本機配置規則") || /比重|配置|均衡|保守|進取/.test(question)) chunks.push(allocationChunk(notebook, valuation));
  if (retrieved.includes("本機回報") || /回報|xirr|標普|voo/i.test(question)) chunks.push(returnChunk(notebook, valuation, today));
  for (const holding of notebook.holdings) {
    if (question.toUpperCase().includes(holding.ticker)) chunks.push(holdingChunk(notebook, valuation, holding.ticker));
  }
  return chunks.filter(Boolean).join("\n\n");
}

function portfolioChunk(notebook: Notebook, valuation: ReturnType<typeof valuePortfolio>): string {
  const lines = [`現金結餘 ${notebook.fx ? hkd(notebook.cashHkd) : `${notebook.cashHkd} 港元（未有匯率，呢個係你輸入的結餘）`}。`];
  const openForPrice = valuation.positions.filter((position) => position.holding.shares > 0);
  const fullyPriced = openForPrice.every((position) => position.priceSource === "quote" || position.holding.manualPriceUsd != null);
  if (notebook.fx && fullyPriced) {
    lines.push(`總資產 ${hkd(valuation.equityHkd)}，股票市值 ${hkd(valuation.stockHkd)}。匯率 ${notebook.fx.rate}（${notebook.fx.date}）。`);
  } else if (!fullyPriced) {
    lines.push("有持股未有 CNBC 現價，所以唔報總市值，避免把成本當成市價。");
  }
  const open = valuation.positions.filter((position) => position.holding.shares > 0);
  if (!open.length) lines.push("未有持股。");
  for (const position of open) {
    lines.push(positionLine(notebook, position));
  }
  return lines.join("\n");
}

function positionLine(notebook: Notebook, position: PositionValue): string {
  const holding = position.holding;
  const cost = `成本 ${usd(holding.avgCostUsd)}`;
  const quote = notebook.quotes[holding.ticker];
  const manual = holding.manualPriceUsd;
  if (manual != null && manual > 0) {
    return `${holding.ticker} ${sharesText(holding.shares)} 股，${cost}，手動價 ${usd(manual)}（唔係今次 CNBC 報價）。`;
  }
  if (quote && position.priceSource === "quote") {
    const when = formatHK(quote.asOf);
    const pl = position.plPct == null ? "" : `，未實現 ${pct(position.plPct)}`;
    const weight = position.weight == null || !notebook.fx ? "" : `，比重 ${pct(position.weight, 1)}`;
    return `${holding.ticker} ${sharesText(holding.shares)} 股，${cost}，CNBC 現價 ${usd(quote.priceUsd)}（${when} 香港時間）${pl}${weight}。`;
  }
  return `${holding.ticker} ${sharesText(holding.shares)} 股，${cost}。未有 CNBC 現價，所以唔報市價同盈虧。`;
}

function riskChunk(notebook: Notebook, valuation: ReturnType<typeof valuePortfolio>): string {
  const missingQuote = valuation.positions.some((position) => position.holding.shares > 0 && position.priceSource !== "quote" && position.holding.manualPriceUsd == null);
  if (!notebook.fx || valuation.equityHkd <= 0 || missingQuote) {
    return `風險檢查需要匯率同每隻持股的 CNBC 現價。而家未齊，唔會計一個總風險數字，亦唔會估價。規則：${RULES.risk}`;
  }
  const cap = (valuation.equityHkd * notebook.settings.riskPct) / 100;
  const rows = valuation.positions.filter((position) => position.holding.shares > 0);
  const risks = rows.map((position) =>
    positionRisk({
      holding: position.holding,
      priceUsd: position.priceSource === "quote" || position.holding.manualPriceUsd != null ? position.priceUsd : null,
      equityHkd: valuation.equityHkd,
      fx: notebook.fx?.rate ?? null,
      riskPct: notebook.settings.riskPct,
    }),
  );
  const used = risks.reduce((sum, risk) => sum + risk.usedHkd, 0);
  const month = monthPerformance({
    monthStartEquity: notebook.settings.monthStartEquityHkd,
    monthStartDate: notebook.settings.monthStartDate,
    equityHkd: valuation.equityHkd,
    cashFlows: notebook.cashFlows,
    knockoutPct: notebook.settings.monthlyKnockoutPct,
  });
  const lines = [
    `單筆上限 ${notebook.settings.riskPct}% 約 ${hkd(cap)}。已用風險約 ${hkd(used)}。`,
    month.drawdownPct == null
      ? "未鎖定本月起始資產，所以未計 6% 停手。"
      : month.knockedOut
        ? `本月回撤 ${pct(month.drawdownPct)}，已到 ${notebook.settings.monthlyKnockoutPct}% 停手線。`
        : `本月回撤 ${pct(month.drawdownPct)}，未到 ${notebook.settings.monthlyKnockoutPct}% 停手線。`,
    RULES.risk,
  ];
  rows.forEach((position, index) => {
    const risk = risks[index];
    if (!risk) return;
    const stop = risk.forcedStop == null ? "未能計強制止蝕" : risk.forcedStop <= 0 ? "歸零仍未用盡單筆上限" : `強制止蝕約 ${usd(risk.forcedStop)}`;
    lines.push(`${position.holding.ticker}：${stop}。${risk.overCap ? "心理止蝕寬過單筆上限。" : risk.freed ? "已打和，呢筆風險已釋放。" : `已用約 ${hkd(risk.usedHkd)}。`}`);
  });
  return lines.join("\n");
}

function averageChunk(notebook: Notebook): string {
  const flagged = notebook.trades.filter((trade) => trade.averagingDown);
  if (!flagged.length) return `買賣紀錄裡未有標成溝貨的交易。${RULES.average}`;
  const lines = flagged.map((trade) => `${trade.date} ${trade.ticker} 以 ${usd(trade.priceUsd)} 買入 ${sharesText(trade.shares)} 股，低於當時成本，而且沒有預先分注。`);
  lines.push(RULES.average);
  return lines.join("\n");
}

function scoreChunk(notebook: Notebook, question: string): string {
  const cards = notebook.scorecards.filter((card) => question.toUpperCase().includes(card.ticker) || !/[A-Z]{1,5}/.test(question.toUpperCase()));
  if (!cards.length) return `未有已儲存的評分。${RULES.score}`;
  const lines = cards.map((card) => {
    const total = card.value + card.growth + card.profitability + card.priceAction;
    return `${card.ticker}：企業價值 ${card.value}、成長 ${card.growth}、盈利 ${card.profitability}、走勢 ${card.priceAction}，合計 ${total}/40。`;
  });
  lines.push(RULES.score);
  return lines.join("\n");
}

function planChunk(notebook: Notebook, question: string): string {
  const plans = notebook.plans.filter((plan) => question.toUpperCase().includes(plan.ticker) || notebook.plans.length <= 3);
  if (!plans.length) return "未有交易計劃。";
  return plans
    .map((plan) => `${plan.ticker}：入場 ${plan.entry || "未填"}，止蝕 ${plan.stop || "未填"}，止賺 ${plan.takeProfit || "未填"}，預先分注 ${plan.scaleInPrices || "沒有"}。`)
    .join("\n");
}

function macroChunk(notebook: Notebook): string {
  const stage = notebook.settings.cycleStage;
  const picked = stage === "unset" ? "你未選周期階段。" : `你而家選的是${CYCLE_INFO[stage].label}：${CYCLE_INFO[stage].tilt}`;
  return `${picked}\n${RULES.macro}`;
}

function allocationChunk(notebook: Notebook, valuation: ReturnType<typeof valuePortfolio>): string {
  if (!notebook.fx) return `未有匯率，唔計比重。${RULES.balanced} ${RULES.conservative} ${RULES.aggressive}`;
  const open = valuation.positions.filter((position) => position.holding.shares > 0 && position.priceSource === "quote");
  const lines = open.map((position) => `${position.holding.ticker} 比重 ${position.weight == null ? "—" : pct(position.weight, 1)}`);
  const cashWeight = valuation.equityHkd > 0 ? notebook.cashHkd / valuation.equityHkd : 0;
  const etf = open.filter((position) => isBroadSpEtf(position.holding.ticker)).reduce((sum, position) => sum + (position.weight ?? 0), 0);
  lines.push(`現金比重 ${pct(cashWeight, 1)}。寬基標普 ETF 比重 ${pct(etf, 1)}。持股 ${open.length} 隻。`);
  lines.push(RULES.balanced, RULES.conservative, RULES.aggressive);
  return lines.join("\n");
}

function returnChunk(notebook: Notebook, valuation: ReturnType<typeof valuePortfolio>, today: string): string {
  if (!notebook.fx) return "未有匯率，唔計港元回報，亦唔會估。";
  const summary = performanceSummary(notebook.cashFlows, valuation.equityHkd, today);
  const provisional = valuation.positions.some((position) => position.holding.shares > 0 && position.priceSource !== "quote" && position.holding.manualPriceUsd == null);
  return [
    provisional ? "有持股未有 CNBC 現價，所以呢個回報唔完整。" : "回報用而家的 CNBC 現價同你的入金紀錄。",
    `淨投入 ${hkd(summary.netInvested)}，現值 ${hkd(summary.equityHkd)}，盈虧 ${hkd(summary.profit)}。`,
    `戶口 XIRR ${summary.xirr == null ? "未能計算" : pct(summary.xirr)}。VOO 對照要有歷史價先計到，呢度唔估。`,
  ].join("\n");
}

function holdingChunk(notebook: Notebook, valuation: ReturnType<typeof valuePortfolio>, ticker: string): string {
  const position = valuation.positions.find((item) => item.holding.ticker === ticker);
  if (!position) return "";
  const holding = position.holding;
  const gates = holding.gates.map((gate, index) => `${notebook.settings.gateTitles[index]}：${gate.color === "unset" ? "未評" : gate.color === "green" ? "綠" : gate.color === "yellow" ? "黃" : "紅"}${gate.note ? `（${gate.note}）` : ""}`);
  const notes = holding.notes ? `筆記：${holding.notes}` : "";
  return [positionLine(notebook, position), gates.join("，"), notes, RULES.gates].filter(Boolean).join("\n");
}
