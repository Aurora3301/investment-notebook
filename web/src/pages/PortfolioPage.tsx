import { useEffect, useMemo, useState } from "react";
import { valuePortfolio } from "../lib/calc";
import { todayHK, formatHK } from "../lib/dates";
import { demoWatchlist } from "../lib/demo";
import { cleanTicker, hkd, num, pct, sharesText, usd, parseDecimal, uid } from "../lib/format";
import { emptyGates, SECTORS, type Holding } from "../lib/types";
import { useNotebook } from "../state/store";
import { useChrome } from "../ui/chrome";
import { Card, Field, GhostButton, PrimaryButton, gateLabel, nextGate } from "../ui/ui";

export function PortfolioPage() {
  const { data, marketBusy, refreshMarket } = useNotebook();
  const { hidden, toggleHidden } = useChrome();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<"cash" | "stocks" | "watch" | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [hero, setHero] = useState(0);
  const [pull, setPull] = useState(0);
  const pullStart = useState<number | null>(null);
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const touchY = pullStart[0];
  const setTouchY = pullStart[1];

  const detail = data.holdings.find((holding) => holding.id === detailId);
  if (detail) return <HoldingDetail holding={detail} onBack={() => setDetailId(null)} />;
  if (adding) return <HoldingEditor holding={null} onClose={() => setAdding(false)} />;

  const openHoldings = valuation.positions.filter((position) => position.holding.shares > 0).sort((a, b) => b.mvHkd - a.mvHkd);
  const quoteTimes = Object.values(data.quotes).map((quote) => quote.asOf).filter(Boolean).sort();
  const latestQuote = quoteTimes.at(-1);
  const updated = latestQuote ? formatHK(latestQuote).slice(0, 10) : "未更新";
  const heroChoices = [
    { label: "我的總資產 (HKD)", value: valuation.fx ? plain(valuation.equityHkd) : "—" },
    { label: "股票市值 (HKD)", value: valuation.fx ? plain(valuation.stockHkd) : "—" },
    { label: "未實現盈虧 (HKD)", value: valuation.fx ? plain(valuation.unrealizedHkd) : "—" },
    { label: "現金 (HKD)", value: plain(data.cashHkd) },
  ];
  const current = heroChoices[hero % heroChoices.length];
  const stockNames = openHoldings.map((position) => position.holding.ticker).slice(0, 3).join("、") || "未有持股";
  const watchNames = data.watchlist.map((item) => item.ticker).slice(0, 3).join("、") || "未有觀察";

  return (
    <div
      onTouchStart={(event) => {
        if (window.scrollY <= 0) setTouchY(event.touches[0]?.clientY ?? null);
      }}
      onTouchMove={(event) => {
        if (touchY == null || window.scrollY > 0) return;
        setPull(Math.max(0, Math.min(90, (event.touches[0]?.clientY ?? touchY) - touchY)));
      }}
      onTouchEnd={() => {
        if (pull > 64 && !marketBusy) void refreshMarket({ forceHistory: true });
        setPull(0);
        setTouchY(null);
      }}
    >
      <p className="pull">{marketBusy ? "更新報價中…" : pull > 64 ? "放開以更新" : pull > 8 ? "下拉更新報價" : ""}</p>
      <section className="balance">
        <button className="plus" type="button" aria-label="新增" onClick={() => setAddMenu(true)}>+</button>
        <div className="eyebrow">
          <button className="hero-hit" type="button" onClick={() => setHero((value) => (value + 1) % heroChoices.length)}>{current.label}</button>
          <button className="eye" type="button" aria-label={hidden ? "顯示金額" : "隱藏金額"} onClick={toggleHidden}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
        <button className="hero-hit" type="button" onClick={() => setHero((value) => (value + 1) % heroChoices.length)}>
          <h1 className="num amount">{current.value}</h1>
        </button>
      </section>
      {data.settings.onboarding === "demo" ? <p className="ribbon">示範資料，並非真實持倉。</p> : null}
      <div className="rail-row">
        <div className="rail" aria-hidden="true">
          <i style={{ background: "#6fce7a", flexGrow: Math.max(data.cashHkd, 1) }} />
          <i style={{ background: "#6a6de0", flexGrow: Math.max(valuation.stockHkd, 1) }} />
          <i style={{ background: "#9aa4f5", flexGrow: 1 }} />
        </div>
        <div className="cat-stack">
          <button className="cat" type="button" onClick={() => setOpen(open === "cash" ? null : "cash")}>
            <div className="between"><h2>現金</h2><span className="figure amount num">{plain(data.cashHkd)}</span></div>
            <div className="subline">港元結餘{data.cashFlows.length ? ` · ${data.cashFlows.length} 筆入帳` : ""}</div>
            <div className="meta">{updated}</div>
          </button>
          <button className="cat" type="button" onClick={() => setOpen(open === "stocks" ? null : "stocks")}>
            <div className="between"><h2>持股</h2><span className="figure amount num">{valuation.fx ? plain(valuation.stockHkd) : "—"}</span></div>
            <div className="subline">{stockNames}</div>
            <Dots count={openHoldings.length} />
            <div className="meta">{updated}</div>
          </button>
          <button className="cat" type="button" onClick={() => setOpen(open === "watch" ? null : "watch")}>
            <div className="between"><h2>觀察名單</h2><span className="figure num">{data.watchlist.length}</span></div>
            <div className="subline">{watchNames}</div>
            <Dots count={data.watchlist.length} />
            <div className="meta">{data.fx ? `美元兌港元 ${num(data.fx.rate, 4)}` : "未有匯率"}</div>
          </button>
        </div>
      </div>
      {open === "cash" ? <CashCard /> : null}
      {open === "stocks" ? (
        <Card title="持股">
          {openHoldings.length === 0 ? <p className="muted">未有持股。按右上角加號新增。</p> : null}
          <div className="stack">
            {openHoldings.map((position) => (
              <button key={position.holding.id} className="row-btn" type="button" onClick={() => setDetailId(position.holding.id)}>
                <div className="between">
                  <div><span className="ticker">{position.holding.ticker}</span><span className="name">{position.holding.name}</span></div>
                  <strong className="amount">{position.plPct == null ? "—" : pct(position.plPct)}</strong>
                </div>
                <div className="muted">
                  {sharesText(position.holding.shares)} 股 · 成本 <span className="amount">{usd(position.holding.avgCostUsd)}</span>
                  {position.priceSource === "manual" ? " · 手動價" : position.priceSource === "cost" ? " · 暫用成本" : <> · <span className="amount">{usd(position.priceUsd ?? 0)}</span></>}
                </div>
                <div className="between">
                  <span className="amount">{hkd(position.mvHkd)}</span>
                  <span className="muted">比重 {position.weight == null ? "—" : pct(position.weight, 1)}</span>
                </div>
              </button>
            ))}
            {data.holdings.filter((holding) => holding.shares <= 0).map((holding) => (
              <button key={holding.id} className="row-btn" type="button" onClick={() => setDetailId(holding.id)}>{holding.ticker} · 已平倉</button>
            ))}
          </div>
        </Card>
      ) : null}
      {open === "watch" ? <WatchCard /> : null}
      {addMenu ? (
        <div className="modal" role="dialog" aria-label="新增">
          <div className="modal-card">
            <header className="sheet-head"><h1>新增</h1><button className="text-btn" type="button" onClick={() => setAddMenu(false)}>關閉</button></header>
            <button className="row-btn" type="button" onClick={() => { setAddMenu(false); setAdding(true); }}>新增持股</button>
            <button className="row-btn" type="button" onClick={() => { setAddMenu(false); setOpen("cash"); }}>記入現金或入金</button>
            <button className="row-btn" type="button" onClick={() => { setAddMenu(false); setOpen("watch"); }}>加入觀察名單</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function plain(value: number): string {
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function Dots({ count }: { count: number }) {
  const shown = Math.min(3, Math.max(count, 0));
  if (shown === 0) return null;
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: shown }, (_, index) => <i key={index} className={index === 0 ? "on" : ""} />)}
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
