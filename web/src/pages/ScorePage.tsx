import { useMemo, useState } from "react";
import { cleanTicker } from "../lib/format";
import type { Scorecard } from "../lib/types";
import { useNotebook } from "../state/store";
import { Card, Field, GhostButton, PrimaryButton } from "../ui/ui";

const PRINCIPLES = [
  { key: "value", label: "企業價值" },
  { key: "growth", label: "成長能力" },
  { key: "profitability", label: "盈利能力" },
  { key: "priceAction", label: "價格走勢" },
] as const;

function blank(ticker: string): Scorecard {
  return {
    ticker,
    value: 0,
    growth: 0,
    profitability: 0,
    priceAction: 0,
    moatNote: "",
    managementNote: "",
    updatedAt: new Date().toISOString(),
  };
}

export function ScorePage() {
  const { data, update } = useNotebook();
  const [extra, setExtra] = useState("");
  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const holding of data.holdings) set.add(holding.ticker);
    for (const item of data.watchlist) set.add(item.ticker);
    for (const card of data.scorecards) set.add(card.ticker);
    return [...set].sort();
  }, [data.holdings, data.watchlist, data.scorecards]);
  const [current, setCurrent] = useState(tickers[0] ?? "");
  const active = current || tickers[0] || "";
  const card = data.scorecards.find((item) => item.ticker === active) ?? (active ? blank(active) : null);
  const total = card ? card.value + card.growth + card.profitability + card.priceAction : 0;

  const save = (next: Scorecard) => {
    update((book) => ({
      ...book,
      scorecards: [...book.scorecards.filter((item) => item.ticker !== next.ticker), { ...next, updatedAt: new Date().toISOString() }],
    }));
  };

  return (
    <div>
      <Card title="選股評分（40 分）">
        <p className="muted">阿樂選股四大原則，每項 10 分，來源《投資唔講廢話》2021。這不是大叔美股筆記的四關法。</p>
        {tickers.length === 0 ? <p className="muted">先在組合加入持股或觀察名單。</p> : null}
        <div className="stack">
          {tickers.map((ticker) => {
            const item = data.scorecards.find((score) => score.ticker === ticker);
            const sum = item ? item.value + item.growth + item.profitability + item.priceAction : 0;
            return (
              <button key={ticker} className="row-btn" type="button" onClick={() => setCurrent(ticker)}>
                <div className="between">
                  <strong>{ticker}</strong>
                  <span>{item ? `${sum} / 40` : "未評"}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="actions">
          <Field label="加入其他代號">
            <input value={extra} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(event) => setExtra(event.target.value)} />
          </Field>
          <PrimaryButton
            type="button"
            onClick={() => {
              const ticker = cleanTicker(extra);
              if (!ticker) return;
              save(blank(ticker));
              setCurrent(ticker);
              setExtra("");
            }}
          >
            開一張評分卡
          </PrimaryButton>
        </div>
      </Card>
      {card && active ? (
        <Card title={`${active} · ${total} / 40`}>
          {PRINCIPLES.map((principle) => (
            <div className="score" key={principle.key}>
              <header>
                <span>{principle.label}</span>
                <strong>{card[principle.key]} / 10</strong>
              </header>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={card[principle.key]}
                aria-label={principle.label}
                onChange={(event) => save({ ...card, [principle.key]: Number(event.target.value) })}
              />
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${card[principle.key] * 10}%` }} />
              </div>
            </div>
          ))}
          <Field label="護城河筆記">
            <textarea value={card.moatNote} onChange={(event) => save({ ...card, moatNote: event.target.value })} />
          </Field>
          <Field label="管理層筆記">
            <textarea value={card.managementNote} onChange={(event) => save({ ...card, managementNote: event.target.value })} />
          </Field>
          <div className="actions">
            <GhostButton type="button" onClick={() => update((book) => ({ ...book, scorecards: book.scorecards.filter((item) => item.ticker !== active) }))}>
              清除這張卡
            </GhostButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
