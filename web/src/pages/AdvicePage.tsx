import { useState } from "react";
import { streamAdviceReport, type AdviceReport } from "../lib/adviceChain";
import { uid } from "../lib/format";
import type { AdviceTurn } from "../lib/types";
import { useNotebook } from "../state/store";
import { PrimaryButton } from "../ui/ui";

const PROMPTS = ["而家個組合點？", "2% 同 6% 使咗幾多？", "有冇溝貨？", "邊隻比重最高？"];

export function AdvicePage() {
  const { data, update, refreshMarket, marketBusy } = useNotebook();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "lookup" | "report">("idle");
  const [updates, setUpdates] = useState<string[]>([]);
  const [live, setLive] = useState<Partial<AdviceReport> | undefined>();

  const ask = async (text: string) => {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true);
    setError("");
    setPhase("lookup");
    setUpdates([]);
    setLive(undefined);
    try {
      const refreshed = await refreshMarket();
      let partial: Partial<AdviceReport> | undefined;
      const seen: string[] = [];
      for await (const event of streamAdviceReport(refreshed.book, asked, {
        liveErrors: refreshed.liveErrors,
        refreshed: refreshed.liveErrors.length === 0,
      })) {
        if (event.mode === "updates") {
          seen.push(event.detail);
          setUpdates([...seen]);
          setPhase("lookup");
        } else {
          partial = event.partial ?? partial;
          setLive(partial);
          setPhase("report");
        }
      }
      const turn: AdviceTurn = {
        id: uid(),
        at: new Date().toISOString(),
        question: asked,
        answer: renderSaved(partial),
        quoteNote: partial?.quoteNote ?? "",
      };
      update((book) => ({ ...book, adviceTurns: [...book.adviceTurns, turn].slice(-40) }));
      setQuestion("");
      setLive(undefined);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "未能在這部裝置完成回答");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  };

  const turns = [...data.adviceTurns].reverse();

  return (
    <div>
      <section className="card">
        <h2>本機建議</h2>
        <p className="muted">
          回答前會先用 CNBC 更新現價，美元兌港元用 Frankfurter。持倉、成本、筆記同呢段對話都只留在這部裝置，不會送到雲端模型。結果只供個人參考，不是持牌投資建議。
        </p>
        <div className="actions">
          {PROMPTS.map((prompt) => (
            <button key={prompt} className="btn-tiny" type="button" disabled={busy || marketBusy} onClick={() => void ask(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>你的問題</span>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：AAPL 的止蝕同比重" />
        </label>
        <div className="actions">
          <PrimaryButton type="button" disabled={busy || marketBusy || !question.trim()} onClick={() => void ask(question)}>
            {busy || marketBusy ? "先更新 CNBC 報價…" : "在這部裝置回答"}
          </PrimaryButton>
        </div>
        {error ? <p className="banner soft">{error}</p> : null}
        {phase !== "idle" ? <p className="muted">{phase === "lookup" ? "第一階段：查本機資料" : "第二階段：邊收 JSON 邊畫出報告"}</p> : null}
        {updates.length ? (
          <ul className="muted">
            {updates.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        {live ? <ReportView report={live} /> : null}
      </section>
      <div className="stack" style={{ marginTop: 12 }}>
        {turns.length === 0 ? <p className="muted">未有問答。可以先載入示範資料再試。</p> : null}
        {turns.map((turn) => (
          <article key={turn.id} className="card">
            <p><strong>{turn.question}</strong></p>
            <p style={{ whiteSpace: "pre-wrap" }}>{turn.answer}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function renderSaved(report: Partial<AdviceReport> | undefined): string {
  if (!report) return "";
  const findings = (report.findings ?? []).map((item) => item.detail).filter(Boolean);
  return [report.quoteNote, report.summary, ...findings, report.disclaimer].filter(Boolean).join("\n\n");
}

function ReportView({ report }: { report: Partial<AdviceReport> }) {
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {report.quoteNote ? <p className="banner info">{report.quoteNote}</p> : null}
      {report.summary ? <p>{report.summary}</p> : null}
      {(report.findings ?? []).map((item) => (
        <article key={`${item.title}-${item.detail.slice(0, 24)}`} className="row-btn">
          <strong>{item.title}</strong>
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{item.detail}</p>
        </article>
      ))}
      {(report.checks ?? []).map((item) => (
        <p key={item.name} className={item.status === "warn" ? "banner soft" : "muted"}>{item.name}：{item.detail}</p>
      ))}
      {report.disclaimer ? <p className="fineprint">{report.disclaimer}</p> : null}
    </div>
  );
}
