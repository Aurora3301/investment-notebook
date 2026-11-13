import { useMemo, useState } from "react";
import {
  isBroadSpEtf,
  isLeveredEtf,
  monthPerformance,
  passesConservativeFilter,
  positionRisk,
  suggestSize,
  valuePortfolio,
  type PositionRisk,
} from "../lib/calc";
import { monthStartHK, todayHK } from "../lib/dates";
import { hkd, num, parseDecimal, pct, usd } from "../lib/format";
import type { Holding, StyleId } from "../lib/types";
import { useNotebook } from "../state/store";
import { Card, Field, GhostButton, PrimaryButton, Segmented } from "../ui/ui";

export function RiskPage() {
  const { data, update } = useNotebook();
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const month = monthPerformance({
    monthStartEquity: data.settings.monthStartEquityHkd,
    monthStartDate: data.settings.monthStartDate,
    equityHkd: valuation.equityHkd,
    cashFlows: data.cashFlows,
    knockoutPct: data.settings.monthlyKnockoutPct,
  });
  const risks = valuation.positions
    .filter((position) => position.holding.shares > 0)
    .map((position) => ({
      position,
      risk: positionRisk({
        holding: position.holding,
        priceUsd: position.priceUsd,
        equityHkd: valuation.equityHkd,
        fx: valuation.fx,
        riskPct: data.settings.riskPct,
      }),
    }));
  const used = risks.reduce((sum, item) => sum + item.risk.usedHkd, 0);
  const cap = valuation.fx ? (valuation.equityHkd * data.settings.riskPct) / 100 : 0;
  const monthBudget = data.settings.monthStartEquityHkd ? (data.settings.monthStartEquityHkd * data.settings.monthlyKnockoutPct) / 100 : null;
  const monthUsed = month.pnlHkd != null && month.pnlHkd < 0 ? -month.pnlHkd : 0;

  return (
    <div>
      <Card title="2% / 6%">
        <p className="muted">
          2% 是單筆交易最多可以虧的戶口比例，避免一次虧損毀掉整個戶口。6% 是相對本月起始資產的回撤，避免連虧毀掉整個月。
        </p>
        <div className="grid2">
          <div className="stat">
            <span>單筆上限 {data.settings.riskPct}%</span>
            <b className="num">{hkd(cap)}</b>
          </div>
          <div className="stat">
            <span>已用風險</span>
            <b className="num">{hkd(used)}</b>
          </div>
          <div className="stat">
            <span>本月虧損預算</span>
            <b className="num">{monthBudget == null ? "未鎖定" : hkd(monthBudget)}</b>
          </div>
          <div className="stat">
            <span>本月已用 / 剩餘</span>
            <b className="num">{monthBudget == null ? "—" : `${hkd(monthUsed)} / ${hkd(Math.max(0, monthBudget - monthUsed))}`}</b>
          </div>
        </div>
        {month.knockedOut ? (
          <p className="banner bad">本月回撤已達 {data.settings.monthlyKnockoutPct}%。建議平倉，並停止交易至月底。</p>
        ) : (
          <p className="muted">本月回撤 {month.drawdownPct == null ? "未鎖定起始資產" : pct(month.drawdownPct)}。入金不會掩飾虧損。</p>
        )}
        <div className="actions">
          <PrimaryButton
            type="button"
            onClick={() =>
              update((book) => ({
                ...book,
                settings: {
                  ...book.settings,
                  monthStartEquityHkd: valuation.equityHkd,
                  monthStartDate: todayHK(),
                },
              }))
            }
          >
            鎖定今日為本月起始
          </PrimaryButton>
          <GhostButton
            type="button"
            onClick={() =>
              update((book) => ({
                ...book,
                settings: { ...book.settings, monthStartDate: monthStartHK(), monthStartEquityHkd: valuation.equityHkd },
              }))
            }
          >
            用本月 1 日
          </GhostButton>
        </div>
      </Card>

      <Card title="雙重止蝕">
        <p className="muted">心理止蝕由你填。強制止蝕是虧損剛好等於戶口 {data.settings.riskPct}% 的價格。獲利後可以把止蝕移到打和，釋放這 2% 給新倉。</p>
        <div className="stack">
          {risks.map(({ position, risk }) => (
            <StopRow key={position.holding.id} holding={position.holding} price={position.priceUsd} risk={risk} fx={valuation.fx} />
          ))}
          {risks.length === 0 ? <p className="muted">未有持股。</p> : null}
        </div>
      </Card>

      <Constructors equityHkd={valuation.equityHkd} fx={valuation.fx} />
      <Sizer equityHkd={valuation.equityHkd} fx={valuation.fx} riskPct={data.settings.riskPct} names={data.holdings.filter((item) => item.shares > 0).length} />
    </div>
  );
}

function StopRow({ holding, price, risk, fx }: { holding: Holding; price: number | null; risk: PositionRisk; fx: number | null }) {
  const { update } = useNotebook();
  const [text, setText] = useState(holding.psychStopUsd == null ? "" : String(holding.psychStopUsd));
  const save = (psych: number | null, breakeven: boolean) => {
    update((book) => ({
      ...book,
      holdings: book.holdings.map((item) =>
        item.id === holding.id
          ? { ...item, psychStopUsd: psych, breakevenStop: breakeven && psych != null && psych >= item.avgCostUsd - 1e-9 }
          : item,
      ),
    }));
  };
  return (
    <div className="row-btn">
      <div className="between">
        <strong>{holding.ticker}</strong>
        <span className={risk.overCap ? "down" : undefined}>已用 {hkd(risk.usedHkd)}{risk.freed ? " · 已打和" : ""}</span>
      </div>
      <p className="muted">
        現價 {price == null ? "—" : usd(price)} · 成本 {usd(holding.avgCostUsd)}
        <br />
        強制止蝕 {risk.forcedStop == null ? "—" : risk.forcedStop <= 0 ? "歸零仍未用盡單筆上限" : usd(risk.forcedStop)}
        {fx == null ? " · 未有匯率" : ""}
      </p>
      {risk.overCap ? <p className="banner soft">心理止蝕寬過強制止蝕，單筆虧損可以超過戶口上限。</p> : null}
      <Field label="心理止蝕（美元）">
        <input inputMode="decimal" value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <div className="actions">
        <PrimaryButton
          type="button"
          onClick={() => {
            const value = parseDecimal(text);
            save(value, false);
          }}
        >
          儲存止蝕
        </PrimaryButton>
        <GhostButton
          type="button"
          disabled={price == null || price < holding.avgCostUsd}
          onClick={() => {
            setText(String(holding.avgCostUsd));
            save(holding.avgCostUsd, true);
          }}
        >
          移至打和
        </GhostButton>
      </div>
    </div>
  );
}

function Constructors({ equityHkd, fx }: { equityHkd: number; fx: number | null }) {
  const { data } = useNotebook();
  const [style, setStyle] = useState<StyleId>("balanced");
  const open = data.holdings.filter((holding) => holding.shares > 0);
  const rate = fx ?? 0;
  const rows = open.map((holding) => {
    const price = holding.manualPriceUsd ?? data.quotes[holding.ticker]?.priceUsd ?? holding.avgCostUsd;
    const mv = rate > 0 ? holding.shares * price * rate : 0;
    return { holding, mv, weight: equityHkd > 0 ? mv / equityHkd : 0 };
  });
  const etf = rows.filter((row) => isBroadSpEtf(row.holding.ticker));
  const stocks = rows.filter((row) => !isBroadSpEtf(row.holding.ticker));
  const etfWeight = etf.reduce((sum, row) => sum + row.weight, 0);
  const stockWeight = stocks.reduce((sum, row) => sum + row.weight, 0);
  const cashWeight = equityHkd > 0 ? data.cashHkd / equityHkd : 0;
  const names = Math.min(10, Math.max(8, open.length || 8));
  const sectors = new Set(open.map((holding) => holding.sector).filter(Boolean));
  const conviction = open.find((holding) => holding.conviction);

  return (
    <Card title="三個組合模板">
      <p className="muted">只處理股票同現金。不要求期權、黃金或債券。模板用來對照你的手帳，不會自動落盤。</p>
      <Segmented
        value={style}
        onChange={setStyle}
        options={[
          { id: "balanced", label: "均衡" },
          { id: "conservative", label: "保守" },
          { id: "aggressive", label: "進取" },
        ]}
      />
      {style === "balanced" ? (
        <div>
          <p className="muted">
            建議 8–10 隻、多過一個行業。現有 {open.length} 隻，涵蓋 {sectors.size} 個已填行業。公式用 N = {names}：市值 ≈（總資產 ÷ N）÷ Beta。
          </p>
          <div className="table-wrap"><table>
            <thead>
              <tr><th>代號</th><th>建議</th><th>現況</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const beta = row.holding.beta && row.holding.beta > 0 ? row.holding.beta : null;
                const target = beta ? equityHkd / names / beta : null;
                return (
                  <tr key={row.holding.id}>
                    <td>{row.holding.ticker}{row.holding.conviction ? " · 最高把握" : ""}</td>
                    <td>{target == null ? "缺 Beta" : hkd(target)}</td>
                    <td>{hkd(row.mv)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="muted">
            {conviction
              ? `Beta 高過 1 時，公式合計通常小於總資產，剩餘現金建議加到 ${conviction.ticker}。`
              : "未標示最高把握，剩餘現金未知加到哪一隻。可在持股裡勾選。"}
            止蝕仍跟 2% / 6%。
          </p>
        </div>
      ) : null}
      {style === "conservative" ? (
        <div>
          <div className="table-wrap"><table>
            <thead>
              <tr><th>部分</th><th>模板</th><th>現況</th></tr>
            </thead>
            <tbody>
              <tr><td>寬基標普 ETF</td><td>40%</td><td>{pct(etfWeight, 1)}</td></tr>
              <tr><td>現金</td><td>20%</td><td>{pct(cashWeight, 1)}</td></tr>
              <tr><td>個股</td><td>40%（約 4 隻 × 10%）</td><td>{pct(stockWeight, 1)} · {stocks.length} 隻</td></tr>
            </tbody>
          </table></div>
          <div className="stack" style={{ marginTop: 8 }}>
            {stocks.map((row) => {
              const filter = passesConservativeFilter(row.holding);
              return (
                <p key={row.holding.id} className="muted">
                  {row.holding.ticker}：市值 {row.holding.marketCapUsd == null ? "未知" : filter.cap ? "大於 100 億美元" : "未過 100 億美元"}
                  ，Beta {row.holding.beta == null ? "未知" : filter.beta ? `${num(row.holding.beta, 2)}，低過 1` : `${num(row.holding.beta, 2)}，不是低過 1`}。
                  檢查點是五年，不是 2% 止蝕。
                  {isLeveredEtf(row.holding.ticker) ? " 這隻似槓桿或反向 ETF，不屬於這個模板。" : ""}
                </p>
              );
            })}
          </div>
          <p className="muted">寬基優先用 VOO，SPY、IVV、SPLG 都算未加槓桿的標普 ETF。</p>
        </div>
      ) : null}
      {style === "aggressive" ? (
        <div>
          <p className="muted">五隻，每隻止蝕等於總資產 6%，全書風險約 30%。平倉後重新分成總資產的五分之一。不用衍生工具。</p>
          <p className={open.length === 5 ? "muted" : "banner soft"}>現有 {open.length} 隻有倉位。模板是 5 隻。</p>
          <div className="table-wrap"><table>
            <thead>
              <tr><th>代號</th><th>目標</th><th>現況</th><th>6% 止蝕價</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => {
                const price = row.holding.manualPriceUsd ?? data.quotes[row.holding.ticker]?.priceUsd ?? row.holding.avgCostUsd;
                const stop = fx && price > 0 ? price - (equityHkd * 0.06) / fx / row.holding.shares : null;
                return (
                  <tr key={row.holding.id}>
                    <td>{row.holding.ticker}</td>
                    <td>{hkd(equityHkd / 5)}</td>
                    <td>{hkd(row.mv)}</td>
                    <td>{stop == null ? "—" : stop <= 0 ? "倉位太細" : usd(stop)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      ) : null}
    </Card>
  );
}

function Sizer({ equityHkd, fx, riskPct, names }: { equityHkd: number; fx: number | null; riskPct: number; names: number }) {
  const [style, setStyle] = useState<StyleId>("balanced");
  const [count, setCount] = useState(String(names || 8));
  const [beta, setBeta] = useState("1");
  const [price, setPrice] = useState("");
  const suggestion = fx
    ? suggestSize({
        style,
        equityHkd,
        names: parseDecimal(count) ?? names,
        beta: parseDecimal(beta) ?? 0,
        priceUsd: parseDecimal(price) ?? 0,
        fx,
        riskPct,
      })
    : null;
  return (
    <Card title="倉位計算器">
      <Segmented
        value={style}
        onChange={setStyle}
        options={[
          { id: "balanced", label: "均衡" },
          { id: "conservative", label: "保守" },
          { id: "aggressive", label: "進取" },
        ]}
      />
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="隻數 N">
          <input inputMode="decimal" value={count} onChange={(event) => setCount(event.target.value)} />
        </Field>
        <Field label="Beta">
          <input inputMode="decimal" value={beta} onChange={(event) => setBeta(event.target.value)} />
        </Field>
        <Field label="股價（美元）">
          <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
        </Field>
      </div>
      {fx == null ? <p className="muted">未有匯率，未能換算股數。</p> : null}
      {suggestion ? (
        <div>
          <p>
            建議市值 <strong className="num">{suggestion.targetHkd == null ? "—" : hkd(suggestion.targetHkd)}</strong>
            {" · "}
            約 <strong className="num">{suggestion.shares == null ? "—" : num(suggestion.shares, 2)}</strong> 股
            {suggestion.stopUsd != null ? ` · 參考止蝕 ${usd(suggestion.stopUsd)}` : ""}
          </p>
          <p className="muted">{suggestion.note}</p>
        </div>
      ) : null}
    </Card>
  );
}
