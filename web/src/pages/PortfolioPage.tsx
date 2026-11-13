import { useEffect, useMemo, useState } from "react";
import { performanceSummary, valuePortfolio, vooBenchmark } from "../lib/calc";
import { todayHK, formatHK } from "../lib/dates";
import { demoWatchlist } from "../lib/demo";
import { cleanTicker, hkd, num, pct, sharesText, usd, parseDecimal, uid } from "../lib/format";
import { emptyGates, SECTORS, type Holding } from "../lib/types";
import { useNotebook } from "../state/store";
import { Card, Field, GhostButton, PrimaryButton, gateLabel, nextGate } from "../ui/ui";

export function PortfolioPage() {
  const { data, marketBusy, refreshMarket } = useNotebook();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  const detail = data.holdings.find((holding) => holding.id === detailId);
  if (detail) return <HoldingDetail holding={detail} onBack={() => setDetailId(null)} />;
  if (adding) return <HoldingEditor holding={null} onClose={() => setAdding(false)} />;

  const quoteTimes = Object.values(data.quotes).map((quote) => quote.asOf).filter(Boolean).sort();
  const latestQuote = quoteTimes.at(-1);
  const priceLabel = !series
    ? "未有 VOO 歷史價。按「更新報價」後先可以比較。"
    : series.adjusted
      ? series.source === "yahoo-proxy"
        ? "VOO 用 Yahoo 調整收市價（總回報）。瀏覽器直接讀 Yahoo 被擋，所以經備援代理，網址只含代號。"
        : "VOO 用 Yahoo 調整收市價（含股息的總回報）。"
      : "VOO 用 CNBC 收市價。這條系列未含股息再投資，對照回報會略低於真正的總回報。";

  return (
    <div>
      <section className="hero">
        <div className="label">總資產（港元）</div>
        <div className="total num">{valuation.fx ? hkd(valuation.equityHkd) : "待匯率"}</div>
        <div className="sub num">{valuation.equityUsd != null ? `美元等值 ${usd(valuation.equityUsd, 0)}` : "未有美元匯率"}</div>
        <div className="row">
          <div>
            <div className="label">未實現盈虧</div>
            <div className={valuation.unrealizedHkd >= 0 ? "up" : "down"}>{hkd(valuation.unrealizedHkd)}</div>
          </div>
          <div>
            <div className="label">股票市值</div>
            <div>{hkd(valuation.stockHkd)}</div>
          </div>
        </div>
        <p className="sub">{latestQuote ? `股價截至 ${formatHK(latestQuote)} 香港時間` : "未有報價"}</p>
        <p className="sub">
          {data.fx ? `美元兌港元 ${num(data.fx.rate, 4)}（${data.fx.date}）` : "未有美元兌港元"}
          {valuation.provisional ? " · 有持倉暫用成本" : ""}
        </p>
        <div className="actions">
          <PrimaryButton type="button" disabled={marketBusy} onClick={() => void refreshMarket({ forceHistory: true })}>
            {marketBusy ? "更新中…" : "更新報價"}
          </PrimaryButton>
        </div>
      </section>

      <Card title="回報 vs 標普">
        <div className="grid2">
          <Stat label="戶口 XIRR" value={summary.xirr == null ? "—" : pct(summary.xirr)} />
          <Stat label="VOO XIRR" value={benchmark?.xirr == null ? "—" : pct(benchmark.xirr)} />
          <Stat
            label="差距"
            value={summary.xirr != null && benchmark?.xirr != null ? pct(summary.xirr - benchmark.xirr) : "—"}
          />
          <Stat label="簡單累計" value={summary.simpleReturn == null ? "—" : pct(summary.simpleReturn)} />
          <Stat label="累計入金" value={hkd(summary.grossDeposits)} />
          <Stat label="現值" value={hkd(summary.equityHkd)} />
          <Stat label="盈虧" value={hkd(summary.profit)} />
          <Stat label="淨投入" value={hkd(summary.netInvested)} />
        </div>
        <p className="muted">
          XIRR 用實際日數除以 365，同 Excel 一樣。入金是流出，提款是流入，終值是今日股票加現金。{priceLabel}
          {benchmark?.capped ? " 有提款多過當時的 VOO 市值，對照只計提得到的部分。" : ""}
          {benchmark?.missing.length ? " 有日子缺價格或匯率，該筆未計入 VOO。" : ""}
        </p>
      </Card>

      <CashCard />

      <Card
        title="持股"
        extra={
          <button className="btn-tiny" type="button" onClick={() => setAdding(true)}>
            新增
          </button>
        }
      >
        {valuation.positions.filter((position) => position.holding.shares > 0).length === 0 ? (
          <p className="muted">未有持股。可以新增，或者在設定載入示範資料。</p>
        ) : (
          <div className="stack">
            {valuation.positions
              .filter((position) => position.holding.shares > 0)
              .sort((a, b) => b.mvHkd - a.mvHkd)
              .map((position) => (
                <button key={position.holding.id} className="row-btn" type="button" onClick={() => setDetailId(position.holding.id)}>
                  <div className="between">
                    <div>
                      <span className="ticker">{position.holding.ticker}</span>
                      <span className="name">{position.holding.name}</span>
                    </div>
                    <strong className={position.plHkd >= 0 ? "up" : "down"}>{position.plPct == null ? "—" : pct(position.plPct)}</strong>
                  </div>
                  <div className="muted">
                    {sharesText(position.holding.shares)} 股 · 成本 {usd(position.holding.avgCostUsd)}
                    {position.priceSource === "manual" ? " · 手動價" : position.priceSource === "cost" ? " · 暫用成本" : ` · ${usd(position.priceUsd ?? 0)}`}
                  </div>
                  <div className="between">
                    <span>{hkd(position.mvHkd)}</span>
                    <span className="muted">比重 {position.weight == null ? "—" : pct(position.weight, 1)}</span>
                  </div>
                </button>
              ))}
          </div>
        )}
        {data.holdings.some((holding) => holding.shares <= 0) ? <p className="muted">已平倉的代號仍留在筆記，可在下方持股紀錄打開。</p> : null}
        <div className="stack" style={{ marginTop: 8 }}>
          {data.holdings
            .filter((holding) => holding.shares <= 0)
            .map((holding) => (
              <button key={holding.id} className="row-btn" type="button" onClick={() => setDetailId(holding.id)}>
                {holding.ticker} · 已平倉
              </button>
            ))}
        </div>
      </Card>

      <WatchCard />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

function CashCard() {
  const { data, update } = useNotebook();
  const [cash, setCash] = useState(String(data.cashHkd));
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayHK());
  const [kind, setKind] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sync, setSync] = useState(true);
  useEffect(() => {
    setCash(String(data.cashHkd));
  }, [data.cashHkd]);

  return (
    <Card title="港元現金">
      <Field label="現金結餘">
        <input inputMode="decimal" value={cash} onChange={(event) => setCash(event.target.value)} />
      </Field>
      <div className="actions">
        <PrimaryButton
          type="button"
          onClick={() => {
            const next = parseDecimal(cash);
            if (next == null) return;
            update((book) => ({ ...book, cashHkd: next }));
          }}
        >
          儲存結餘
        </PrimaryButton>
        <GhostButton type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "收起入帳" : "記入入金／提款"}
        </GhostButton>
      </div>
      <p className="muted">直接改結餘不會當成入金。計 XIRR 請另記入金或提款。</p>
      {open ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <Field label="日期">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <div className="seg">
            <button type="button" aria-pressed={kind === "in"} onClick={() => setKind("in")}>入金</button>
            <button type="button" aria-pressed={kind === "out"} onClick={() => setKind("out")}>提款</button>
          </div>
          <Field label="金額（港元）">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="備註">
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={sync} onChange={(event) => setSync(event.target.checked)} />
            同時調整現金結餘
          </label>
          <PrimaryButton
            type="button"
            onClick={() => {
              const value = parseDecimal(amount);
              if (value == null || value <= 0 || !date) return;
              const signed = kind === "in" ? value : -value;
              update((book) => ({
                ...book,
                cashHkd: sync ? book.cashHkd + signed : book.cashHkd,
                cashFlows: [...book.cashFlows, { id: uid(), date, amountHkd: signed, note }],
              }));
              setAmount("");
              setNote("");
              if (sync) setCash(String((parseDecimal(cash) ?? data.cashHkd) + signed));
            }}
          >
            儲存
          </PrimaryButton>
        </div>
      ) : null}
      <div className="stack" style={{ marginTop: 10 }}>
        {[...data.cashFlows].sort((a, b) => b.date.localeCompare(a.date)).map((flow) => (
          <div key={flow.id} className="between">
            <div>
              <strong>{flow.date}</strong>
              <div className="muted">{flow.note || (flow.amountHkd >= 0 ? "入金" : "提款")}</div>
            </div>
            <div>
              <span className={flow.amountHkd >= 0 ? "up" : "down"}>{hkd(flow.amountHkd)}</span>
              <button
                className="btn-tiny btn-ghost"
                type="button"
                onClick={() =>
                  update((book) => ({
                    ...book,
                    cashHkd: book.cashHkd - flow.amountHkd,
                    cashFlows: book.cashFlows.filter((item) => item.id !== flow.id),
                  }))
                }
              >
                刪除並扣回
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WatchCard() {
  const { data, update } = useNotebook();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  return (
    <Card title="觀察名單">
      {data.watchlist.length === 0 ? (
        <GhostButton type="button" onClick={() => update((book) => ({ ...book, watchlist: demoWatchlist() }))}>
          加入示範觀察名單（OKTA、PANW、CRWD、VST、VRT）
        </GhostButton>
      ) : null}
      <div className="stack" style={{ marginTop: 8 }}>
        {data.watchlist.map((item) => (
          <div key={item.id} className="between">
            <div>
              <span className="ticker">{item.ticker}</span>
              <span className="name">{item.name}</span>
              <div className="muted">{data.quotes[item.ticker] ? usd(data.quotes[item.ticker].priceUsd) : "未有報價"}</div>
            </div>
            <button className="btn-tiny btn-ghost" type="button" onClick={() => update((book) => ({ ...book, watchlist: book.watchlist.filter((row) => row.id !== item.id) }))}>
              移除
            </button>
          </div>
        ))}
      </div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <Field label="代號">
          <input value={ticker} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(event) => setTicker(event.target.value)} />
        </Field>
        <Field label="名稱">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
      </div>
      <div className="actions">
        <PrimaryButton
          type="button"
          onClick={() => {
            const symbol = cleanTicker(ticker);
            if (!symbol) return;
            update((book) => ({
              ...book,
              watchlist: [...book.watchlist.filter((item) => item.ticker !== symbol), { id: uid(), ticker: symbol, name: name.trim() || symbol, note: "" }],
            }));
            setTicker("");
            setName("");
          }}
        >
          加入
        </PrimaryButton>
      </div>
    </Card>
  );
}

function HoldingEditor({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const { update } = useNotebook();
  const [ticker, setTicker] = useState(holding?.ticker ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [shares, setShares] = useState(holding ? String(holding.shares) : "");
  const [cost, setCost] = useState(holding ? String(holding.avgCostUsd) : "");
  const [sector, setSector] = useState(holding?.sector ?? "");
  const [notes, setNotes] = useState(holding?.notes ?? "");
  const [error, setError] = useState("");

  return (
    <Card title={holding ? `編輯 ${holding.ticker}` : "新增持股"}>
      <div className="stack">
        <Field label="代號">
          <input value={ticker} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(event) => setTicker(event.target.value)} />
        </Field>
        <Field label="名稱">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid2">
          <Field label="股數">
            <input inputMode="decimal" value={shares} onChange={(event) => setShares(event.target.value)} />
          </Field>
          <Field label="平均成本（美元）">
            <input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
          </Field>
        </div>
        <Field label="行業">
          <select value={sector} onChange={(event) => setSector(event.target.value)}>
            <option value="">未填</option>
            {SECTORS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="備註">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {error ? <p className="banner soft">{error}</p> : null}
        <div className="actions">
          <PrimaryButton
            type="button"
            onClick={() => {
              const symbol = cleanTicker(ticker);
              const shareCount = parseDecimal(shares);
              const avg = parseDecimal(cost);
              if (!symbol || shareCount == null || shareCount < 0 || avg == null || avg < 0) {
                setError("請填代號、股數同成本。");
                return;
              }
              update((book) => {
                if (holding) {
                  return {
                    ...book,
                    holdings: book.holdings.map((item) =>
                      item.id === holding.id ? { ...item, ticker: symbol, name: name.trim() || symbol, shares: shareCount, avgCostUsd: avg, sector, notes } : item,
                    ),
                  };
                }
                const created: Holding = {
                  id: uid(),
                  ticker: symbol,
                  name: name.trim() || symbol,
                  shares: shareCount,
                  avgCostUsd: avg,
                  notes,
                  sector,
                  beta: null,
                  marketCapUsd: null,
                  betaManual: false,
                  marketCapManual: false,
                  psychStopUsd: null,
                  breakevenStop: false,
                  conviction: false,
                  manualPriceUsd: null,
                  gates: emptyGates(),
                  keyDates: [],
                };
                return { ...book, holdings: [...book.holdings, created] };
              });
              onClose();
            }}
          >
            儲存
          </PrimaryButton>
          <GhostButton type="button" onClick={onClose}>
            返回
          </GhostButton>
        </div>
      </div>
    </Card>
  );
}

function HoldingDetail({ holding, onBack }: { holding: Holding; onBack: () => void }) {
  const { data, update } = useNotebook();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [manual, setManual] = useState(holding.manualPriceUsd == null ? "" : String(holding.manualPriceUsd));
  const [beta, setBeta] = useState(holding.beta == null ? "" : String(holding.beta));
  const [cap, setCap] = useState(holding.marketCapUsd == null ? "" : String(holding.marketCapUsd / 1e9));
  const position = valuePortfolio(data).positions.find((item) => item.holding.id === holding.id);
  const titles = data.settings.gateTitles;

  const patch = (partial: Partial<Holding>) => {
    update((book) => ({
      ...book,
      holdings: book.holdings.map((item) => (item.id === holding.id ? { ...item, ...partial } : item)),
    }));
  };

  if (editing) return <HoldingEditor holding={holding} onClose={() => setEditing(false)} />;

  return (
    <div>
      <GhostButton type="button" onClick={onBack}>
        返回組合
      </GhostButton>
      <Card title={`${holding.ticker} ${holding.name}`}>
        <p className="muted">
          {sharesText(holding.shares)} 股 · 成本 {usd(holding.avgCostUsd)} · 市值 {position ? hkd(position.mvHkd) : "—"} ·{" "}
          {position?.plPct == null ? "—" : pct(position.plPct)}
        </p>
        <div className="actions">
          <GhostButton type="button" onClick={() => setEditing(true)}>
            編輯股數／成本
          </GhostButton>
          {confirmDelete ? (
            <button
              className="btn-warn"
              type="button"
              onClick={() => {
                update((book) => ({ ...book, holdings: book.holdings.filter((item) => item.id !== holding.id) }));
                onBack();
              }}
            >
              確定刪除持股
            </button>
          ) : (
            <GhostButton type="button" onClick={() => setConfirmDelete(true)}>
              刪除
            </GhostButton>
          )}
        </div>
      </Card>

      <Card title="報價與參數">
        <p className="muted">手動價格只留在這部裝置，下次成功更新報價也不會覆蓋，直到你清除。</p>
        <div className="grid2">
          <Field label="手動價格（美元）">
            <input inputMode="decimal" value={manual} onChange={(event) => setManual(event.target.value)} />
          </Field>
          <Field label="Beta">
            <input inputMode="decimal" value={beta} onChange={(event) => setBeta(event.target.value)} />
          </Field>
          <Field label="市值（十億美元）">
            <input inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={holding.conviction} onChange={(event) => patch({ conviction: event.target.checked })} />
          這是最高把握的一隻（均衡型剩餘現金會建議加在這裡）
        </label>
        <div className="actions">
          <PrimaryButton
            type="button"
            onClick={() => {
              const price = parseDecimal(manual);
              const betaValue = parseDecimal(beta);
              const capB = parseDecimal(cap);
              patch({
                manualPriceUsd: price != null && price > 0 ? price : null,
                beta: betaValue,
                betaManual: betaValue != null,
                marketCapUsd: capB != null ? capB * 1e9 : null,
                marketCapManual: capB != null,
              });
            }}
          >
            儲存參數
          </PrimaryButton>
          <GhostButton type="button" onClick={() => { setManual(""); patch({ manualPriceUsd: null }); }}>
            改回自動報價
          </GhostButton>
        </div>
      </Card>

      <Card title="四關法">
        <p className="muted">來源：大叔美股筆記。預設只叫關卡一至關卡四，可在設定改名。這組顏色與阿樂的選股四原則無關。</p>
        <div className="gates">
          {holding.gates.map((gate, index) => (
            <div className="gate" key={titles[index]}>
              <button type="button" className={`swatch ${gate.color}`} onClick={() => {
                const gates = holding.gates.map((item, gateIndex) => (gateIndex === index ? { ...item, color: nextGate(item.color) } : item)) as Holding["gates"];
                patch({ gates });
              }}>
                {gateLabel(gate.color)}
              </button>
              <input
                value={gate.note}
                placeholder={titles[index]}
                onChange={(event) => {
                  const gates = holding.gates.map((item, gateIndex) => (gateIndex === index ? { ...item, note: event.target.value } : item)) as Holding["gates"];
                  patch({ gates });
                }}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="筆記與重要日子">
        <Field label="個股筆記">
          <textarea value={holding.notes} onChange={(event) => patch({ notes: event.target.value })} />
        </Field>
        <div className="stack" style={{ marginTop: 8 }}>
          {holding.keyDates.map((item) => (
            <div key={item.id} className="between">
              <span>{item.date}　{item.label}</span>
              <button className="btn-tiny btn-ghost" type="button" onClick={() => patch({ keyDates: holding.keyDates.filter((row) => row.id !== item.id) })}>
                刪除
              </button>
            </div>
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="日期">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="說明，例如業績">
            <input value={label} onChange={(event) => setLabel(event.target.value)} />
          </Field>
        </div>
        <div className="actions">
          <PrimaryButton
            type="button"
            onClick={() => {
              if (!date) return;
              patch({ keyDates: [...holding.keyDates, { id: uid(), date, label }] });
              setDate("");
              setLabel("");
            }}
          >
            加入日子
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
