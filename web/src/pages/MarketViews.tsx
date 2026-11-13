import { useMemo, useState } from "react";
import { buildEquityCurve, performanceSummary, valuePortfolio, vooBenchmark } from "../lib/calc";
import { addDays, todayHK } from "../lib/dates";
import { hkd, num, pct } from "../lib/format";
import { useNotebook } from "../state/store";
import { LineChart, thinPoints } from "../ui/ui";

const COLORS = ["#6fce7a", "#6a6de0", "#8e93f0", "#5aa7e0", "#7d8cff", "#9aa4f5", "#4aa3c8", "#b0b6ff"];

export function AllocationView({ onClose }: { onClose: () => void }) {
  const { data } = useNotebook();
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const rows = [
    { key: "cash", label: "現金", value: Math.max(0, data.cashHkd) },
    ...valuation.positions
      .filter((position) => position.holding.shares > 0 && position.mvHkd > 0)
      .sort((a, b) => b.mvHkd - a.mvHkd)
      .map((position) => ({ key: position.holding.id, label: position.holding.ticker, value: position.mvHkd })),
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <section className="sheet-page">
      <header className="sheet-head">
        <button className="text-btn" type="button" onClick={onClose}>關閉</button>
        <h1>配置比例</h1>
      </header>
      {total <= 0 ? <p className="muted">未有現金或持股。</p> : null}
      <div className="alloc-stack">
        {rows.map((row, index) => (
          <div key={row.key} className="alloc-block" style={{ background: COLORS[index % COLORS.length], flexGrow: Math.max(row.value, total * 0.08) }}>
            <strong className="num">{total > 0 ? `${Math.round((row.value / total) * 100)}%` : "—"}</strong>
            <span>{row.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrendSheet({ onClose }: { onClose: () => void }) {
  const { data } = useNotebook();
  const [range, setRange] = useState<"30" | "180" | "365" | "all">("365");
  const [pane, setPane] = useState<"curve" | "pnl">("curve");
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const asOf = todayHK();
  const summary = useMemo(() => performanceSummary(data.cashFlows, valuation.equityHkd, asOf), [data.cashFlows, valuation.equityHkd, asOf]);
  const series = data.priceHistory.VOO;
  const benchmark = useMemo(() => {
    if (!series) return null;
    return vooBenchmark({
      cashFlows: data.cashFlows,
      asOf,
      points: series.points,
      adjusted: series.adjusted,
      source: series.source,
      fxHistory: data.fxHistory,
      fxFallback: valuation.fx,
    });
  }, [series, data.cashFlows, data.fxHistory, asOf, valuation.fx]);
  const curve = useMemo(
    () =>
      buildEquityCurve({
        cashFlows: data.cashFlows,
        trades: data.trades,
        priceHistory: Object.fromEntries(Object.entries(data.priceHistory).map(([ticker, item]) => [ticker, item.points])),
        fxHistory: data.fxHistory,
        fxFallback: valuation.fx,
        asOf,
        startingCapitalHkd: data.settings.startingCapitalHkd,
      }),
    [data, valuation.fx, asOf],
  );
  const cutoff = range === "all" ? "0000-01-01" : addDays(asOf, range === "30" ? -30 : range === "180" ? -180 : -365);
  const points = thinPoints(curve.points.filter((point) => point.date >= cutoff)).map((point) => ({ date: point.date, value: point.index }));
  const bars = valuation.positions.filter((position) => position.holding.shares > 0);
  const maxBar = Math.max(1, ...bars.map((position) => Math.abs(position.plHkd)));
  const priceLabel = !series
    ? "未有 VOO 歷史價。"
    : series.adjusted
      ? "VOO 為 Yahoo 調整收市價，已含股息再投資。現價仍來自 CNBC。"
      : "VOO 為 CNBC 收市價，未含股息再投資。";

  return (
    <div className="modal" role="dialog" aria-label="趨勢">
      <div className="modal-card">
        <header className="sheet-head">
          <h1>趨勢</h1>
          <button className="text-btn" type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="seg">
          <button type="button" aria-pressed={pane === "curve"} onClick={() => setPane("curve")}>資金曲線</button>
          <button type="button" aria-pressed={pane === "pnl"} onClick={() => setPane("pnl")}>盈虧</button>
        </div>
        {pane === "curve" ? (
          <>
            <LineChart points={points} label="調整後資金指數" />
            <div className="pills">
              {(["30", "180", "365", "all"] as const).map((id) => (
                <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)}>
                  {id === "30" ? "30天" : id === "180" ? "6月" : id === "365" ? "1年" : "全部"}
                </button>
              ))}
            </div>
            <div className="quiet-stats">
              <div><span>戶口 XIRR</span><b className="num amount">{summary.xirr == null ? "—" : pct(summary.xirr)}</b></div>
              <div><span>VOO XIRR</span><b className="num amount">{benchmark?.xirr == null ? "—" : pct(benchmark.xirr)}</b></div>
              <div><span>差距</span><b className="num amount">{summary.xirr != null && benchmark?.xirr != null ? pct(summary.xirr - benchmark.xirr) : "—"}</b></div>
            </div>
            <p className="fineprint">
              指數起點 100，最新 {curve.points.length ? num(curve.points[curve.points.length - 1].index, 1) : "—"}。入金不會造成跳升。{priceLabel}
            </p>
          </>
        ) : (
          <div className="bars">
            {bars.length === 0 ? <p className="muted">未有持股盈虧。</p> : null}
            {bars.map((position) => (
              <div key={position.holding.id} className="bar-row">
                <span>{position.holding.ticker}</span>
                <div className="bar-track">
                  <i style={{ width: `${(Math.abs(position.plHkd) / maxBar) * 100}%`, opacity: position.plHkd >= 0 ? 1 : 0.45 }} />
                </div>
                <b className="amount num">{hkd(position.plHkd)}</b>
              </div>
            ))}
            <p className="fineprint">未實現盈虧 <span className="amount">{hkd(valuation.unrealizedHkd)}</span>。簡單累計 {summary.simpleReturn == null ? "—" : pct(summary.simpleReturn)}。</p>
          </div>
        )}
      </div>
    </div>
  );
}
