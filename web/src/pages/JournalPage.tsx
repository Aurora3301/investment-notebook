import { useMemo, useState } from "react";
import {
  applyTrade,
  buildEquityCurve,
  closedTrades,
  currentFx,
  expectancyR,
  fxOn,
  isAveragingDown,
  netSharesByTicker,
  positionRisk,
  valuePortfolio,
} from "../lib/calc";
import { todayHK } from "../lib/dates";
import { cleanTicker, hkd, num, parseDecimal, pct, uid, usd } from "../lib/format";
import { CYCLE_INFO, type CycleStage, type TradePlan } from "../lib/types";
import { useNotebook } from "../state/store";
import { Card, Field, LineChart, PrimaryButton, Segmented, thinPoints } from "../ui/ui";

export function JournalPage() {
  const { data } = useNotebook();
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const fx = currentFx(data);
  const curve = useMemo(
    () =>
      buildEquityCurve({
        cashFlows: data.cashFlows,
        trades: data.trades,
        priceHistory: Object.fromEntries(Object.entries(data.priceHistory).map(([ticker, series]) => [ticker, series.points])),
        fxHistory: data.fxHistory,
        fxFallback: fx,
        asOf: todayHK(),
        startingCapitalHkd: data.settings.startingCapitalHkd,
      }),
    [data, fx],
  );
  const equityAt = (date: string) => {
    const prior = curve.points.filter((point) => point.date <= date);
    return prior.length ? prior[prior.length - 1].equityHkd : data.settings.startingCapitalHkd;
  };
  const closed = closedTrades({
    trades: data.trades,
    equityAt,
    fxAt: (date) => fxOn(data.fxHistory, date, fx),
    rPct: data.settings.rPct,
  });
  const wins = closed.filter((lot) => lot.pnlUsd > 0);
  const losses = closed.filter((lot) => lot.pnlUsd < 0);
  const journalWin = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgWinR = average(wins.map((lot) => lot.rMultiple).filter((value): value is number => value != null));
  const avgLossR = average(losses.map((lot) => lot.rMultiple).filter((value): value is number => value != null));
  const journalEv = journalWin != null && avgWinR != null && avgLossR != null ? expectancyR(journalWin, avgWinR, avgLossR) : null;
  const assumed =
    data.settings.winRatePct != null && data.settings.avgWinR != null && data.settings.avgLossR != null
      ? expectancyR(data.settings.winRatePct, data.settings.avgWinR, data.settings.avgLossR)
      : null;
  const openRisk = valuation.positions
    .filter((position) => position.holding.shares > 0)
    .reduce((sum, position) => {
      return (
        sum +
        positionRisk({
          holding: position.holding,
          priceUsd: position.priceUsd,
          equityHkd: valuation.equityHkd,
          fx: valuation.fx,
          riskPct: data.settings.rPct,
        }).usedHkd
      );
    }, 0);
  const mismatch = shareMismatch();

  function shareMismatch() {
    const nets = netSharesByTicker(data.trades);
    const rows: string[] = [];
    const seen = new Set<string>();
    for (const holding of data.holdings) {
      seen.add(holding.ticker);
      const net = nets[holding.ticker] ?? 0;
      if (Math.abs(net - holding.shares) > 0.0001) rows.push(`${holding.ticker}：日誌 ${num(net, 2)} 股，持股欄 ${num(holding.shares, 2)} 股`);
    }
    for (const [ticker, net] of Object.entries(nets)) {
      if (!seen.has(ticker) && Math.abs(net) > 0.0001) rows.push(`${ticker}：日誌有 ${num(net, 2)} 股，持股欄未有`);
    }
    return rows;
  }

  const chartPoints = thinPoints(curve.points).map((point) => ({ date: point.date, value: point.index }));

  return (
    <div>
      <MacroCard />
      <Card title="交易計劃">
        <blockquote className="quote">可以有分注計劃但絕不臨時溝貨。</blockquote>
        <blockquote className="quote">When in doubt, just get out.</blockquote>
        <PlanEditor />
      </Card>
      <TradeForm />
      <Card title="交易日誌">
        {mismatch.length ? <p className="banner soft">日誌淨股數同持股欄不一致。{mismatch.join("；")}。持股可手動改，日誌不會自動覆蓋。</p> : null}
        <div className="stack">
          {[...data.trades].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map((trade) => (
            <div key={trade.id} className="row-btn">
              <div className="between">
                <strong>{trade.date} {trade.ticker} {trade.side === "buy" ? "買入" : "賣出"}</strong>
                <span>{usd(trade.priceUsd)}</span>
              </div>
              <p className="muted">
                {num(trade.shares, 4)} 股 · 費用 {usd(trade.feesUsd)} {trade.note ? `· ${trade.note}` : ""}
              </p>
              {trade.averagingDown ? <p className="banner soft">溝貨：低於成本買入，而且沒有預先寫下的分注計劃。</p> : null}
            </div>
          ))}
          {data.trades.length === 0 ? <p className="muted">未有買賣。入金在組合頁的現金帳。</p> : null}
        </div>
      </Card>
      <Card title="資金曲線">
        <p className="muted">穩定斜線向上。升幅套用在整個戶口，入金不會造成跳升。{curve.note}</p>
        <LineChart points={chartPoints} label="調整後資金指數" />
        <p className="muted">
          指數起點 100，最新 {curve.points.length ? num(curve.points[curve.points.length - 1].index, 1) : "—"}。
          重建結餘未必等於你手動記入的現金。
        </p>
      </Card>
      <Card title="R 與期望值">
        <p className="muted">
          R 用平倉盈虧除以開倉時戶口的 {data.settings.rPct}%。起始資金 {data.settings.startingCapitalHkd == null ? "未填" : hkd(data.settings.startingCapitalHkd)}，只在沒有入金紀錄時當作曲線起點。
        </p>
        <div className="grid2">
          <div className="stat"><span>已平倉筆數</span><b>{closed.length}</b></div>
          <div className="stat"><span>日誌勝率</span><b>{journalWin == null ? "—" : `${num(journalWin, 1)}%`}</b></div>
          <div className="stat"><span>日誌期望值</span><b>{journalEv == null ? "—" : `${num(journalEv, 2)} R`}</b></div>
          <div className="stat"><span>假設期望值</span><b>{assumed == null ? "—" : `${num(assumed, 2)} R`}</b></div>
          <div className="stat"><span>止蝕同時觸發</span><b>{valuation.equityHkd > 0 ? pct(openRisk / valuation.equityHkd) : "—"}</b></div>
        </div>
        <p className="muted">假設勝率同平均盈虧在設定裡填。止蝕同時觸發是未平倉風險佔總資產的比例，用來感受最大潛在回撤，不是預測。</p>
      </Card>
    </div>
  );
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function MacroCard() {
  const { data, update } = useNotebook();
  const stage = data.settings.cycleStage;
  const info = stage === "unset" ? null : CYCLE_INFO[stage];
  return (
    <Card title="周期提示">
      <p className="muted">自己選階段。本版沒有自動判斷。通脹傳導的次序是 PMI，然後 PPI，然後 CPI。</p>
      <div className="stack">
        {(Object.keys(CYCLE_INFO) as Exclude<CycleStage, "unset">[]).map((id) => (
          <button
            key={id}
            type="button"
            className="row-btn"
            onClick={() => update((book) => ({ ...book, settings: { ...book.settings, cycleStage: id } }))}
            aria-pressed={stage === id}
          >
            <strong>{CYCLE_INFO[id].label}</strong>
            <div className="muted">{CYCLE_INFO[id].tilt}</div>
          </button>
        ))}
      </div>
      {info ? <p className="banner info">現選{info.label}：偏向{info.tilt}</p> : <p className="muted">未選擇。</p>}
    </Card>
  );
}

function PlanEditor() {
  const { data, update } = useNotebook();
  const tickers = [...new Set([...data.holdings.map((item) => item.ticker), ...data.watchlist.map((item) => item.ticker), ...data.plans.map((item) => item.ticker)])];
  const [ticker, setTicker] = useState(tickers[0] ?? "");
  const existing = data.plans.find((plan) => plan.ticker === ticker);
  const [form, setForm] = useState<TradePlan>(existing ?? emptyPlan(ticker));
  const load = (symbol: string) => {
    setTicker(symbol);
    setForm(data.plans.find((plan) => plan.ticker === symbol) ?? emptyPlan(symbol));
  };
  return (
    <div className="stack">
      {data.plans.map((plan) => (
        <button key={plan.id} className="row-btn" type="button" onClick={() => load(plan.ticker)}>
          <strong>{plan.ticker}</strong>
          <div className="muted">入場 {plan.entry || "—"} · 止蝕 {plan.stop || "—"} · 止賺 {plan.takeProfit || "—"}</div>
          {plan.scaleInPrices ? <div className="muted">預先分注：{plan.scaleInPrices}</div> : <div className="muted">未寫分注</div>}
        </button>
      ))}
      <Field label="代號">
        <input value={form.ticker} autoCapitalize="characters" onChange={(event) => setForm({ ...form, ticker: event.target.value.toUpperCase() })} />
      </Field>
      <div className="grid2">
        <Field label="入場"><input value={form.entry} onChange={(event) => setForm({ ...form, entry: event.target.value })} /></Field>
        <Field label="入場時機"><input value={form.entryTiming} onChange={(event) => setForm({ ...form, entryTiming: event.target.value })} /></Field>
        <Field label="止蝕"><input value={form.stop} onChange={(event) => setForm({ ...form, stop: event.target.value })} /></Field>
        <Field label="止蝕時機"><input value={form.stopTiming} onChange={(event) => setForm({ ...form, stopTiming: event.target.value })} /></Field>
        <Field label="止賺"><input value={form.takeProfit} onChange={(event) => setForm({ ...form, takeProfit: event.target.value })} /></Field>
        <Field label="止賺時機"><input value={form.takeProfitTiming} onChange={(event) => setForm({ ...form, takeProfitTiming: event.target.value })} /></Field>
      </div>
      <Field label="預先寫下的分注價（可留空）">
        <input value={form.scaleInPrices} onChange={(event) => setForm({ ...form, scaleInPrices: event.target.value })} />
      </Field>
      <Field label="備註">
        <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      </Field>
      <PrimaryButton
        type="button"
        onClick={() => {
          const symbol = cleanTicker(form.ticker);
          if (!symbol) return;
          const next = { ...form, ticker: symbol, id: form.id || uid(), updatedAt: new Date().toISOString() };
          update((book) => ({ ...book, plans: [...book.plans.filter((plan) => plan.ticker !== symbol), next] }));
        }}
      >
        儲存計劃
      </PrimaryButton>
    </div>
  );
}

function emptyPlan(ticker: string): TradePlan {
  return {
    id: "",
    ticker,
    entry: "",
    entryTiming: "",
    stop: "",
    stopTiming: "",
    takeProfit: "",
    takeProfitTiming: "",
    scaleInPrices: "",
    note: "",
    updatedAt: "",
  };
}

function TradeForm() {
  const { data, update } = useNotebook();
  const [date, setDate] = useState(todayHK());
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("0");
  const [note, setNote] = useState("");
  const [planned, setPlanned] = useState(false);
  const [sync, setSync] = useState(true);
  const [error, setError] = useState("");
  const symbol = cleanTicker(ticker);
  const holding = data.holdings.find((item) => item.ticker === symbol);
  const plan = data.plans.find((item) => item.ticker === symbol);
  const priceValue = parseDecimal(price);
  const warn =
    priceValue != null &&
    isAveragingDown({
      priorShares: holding?.shares ?? 0,
      priorAvg: holding?.avgCostUsd ?? 0,
      side,
      price: priceValue,
      plannedScaleIn: planned,
      scaleInPrices: plan?.scaleInPrices ?? "",
    });

  return (
    <Card title="記一筆買賣">
      <div className="stack">
        <Field label="日期"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="代號">
          <input value={ticker} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(event) => setTicker(event.target.value)} />
        </Field>
        <Segmented
          value={side}
          onChange={setSide}
          options={[
            { id: "buy", label: "買入" },
            { id: "sell", label: "賣出" },
          ]}
        />
        <div className="grid2">
          <Field label="股數"><input inputMode="decimal" value={shares} onChange={(event) => setShares(event.target.value)} /></Field>
          <Field label="價格（美元）"><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
          <Field label="費用（美元）"><input inputMode="decimal" value={fees} onChange={(event) => setFees(event.target.value)} /></Field>
        </div>
        <Field label="備註"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        {side === "buy" ? (
          <label className="check">
            <input type="checkbox" checked={planned} onChange={(event) => setPlanned(event.target.checked)} />
            這筆是預先寫下的分注，不是臨時溝貨
          </label>
        ) : null}
        <label className="check">
          <input type="checkbox" checked={sync} onChange={(event) => setSync(event.target.checked)} />
          同步持股與現金
        </label>
        {warn ? <p className="banner soft">這筆買入低於現有成本，而且計劃裡沒有預先分注。這是溝貨。獲利後加倉則沒有這個警告。</p> : null}
        {error ? <p className="banner soft">{error}</p> : null}
        <PrimaryButton
          type="button"
          onClick={() => {
            const shareCount = parseDecimal(shares);
            const px = parseDecimal(price);
            const fee = parseDecimal(fees) ?? 0;
            if (!symbol || !date || shareCount == null || shareCount <= 0 || px == null || px < 0 || fee < 0) {
              setError("請填日期、代號、股數同價格。");
              return;
            }
            if (sync && side === "sell" && (holding?.shares ?? 0) + 1e-8 < shareCount) {
              setError("持股不足，未能同步。可以先改持股，或取消同步只記日誌。");
              return;
            }
            if (sync && fxOn(data.fxHistory, date, currentFx(data)) == null) {
              setError("未有匯率，未能同步現金。可先更新報價、在設定填手動匯率，或取消同步只記日誌。");
              return;
            }
            const trade = {
              id: uid(),
              date,
              ticker: symbol,
              side,
              shares: shareCount,
              priceUsd: px,
              feesUsd: fee,
              note,
              plannedScaleIn: planned,
              averagingDown: Boolean(warn),
            };
            update((book) => applyTrade(book, trade, sync));
            setShares("");
            setPrice("");
            setNote("");
            setPlanned(false);
            setError("");
          }}
        >
          儲存交易
        </PrimaryButton>
      </div>
    </Card>
  );
}
