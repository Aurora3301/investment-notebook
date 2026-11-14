import { AIMessageChunk, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { advise, type AdviceResult } from "./advice";
import { parsePartialJson } from "./partialJson";
import type { Notebook } from "./types";

/**
 * Three-stage on-device advice chain for learning LangChain's stream shape:
 *
 * 1. Lookup, LangGraph streamMode "updates". Nodes only read the notebook
 *    already in memory (CNBC quotes were refreshed by the caller).
 * 2. Report, the chat model's stream(). Each chunk is the "messages" stream:
 *    the text of the JSON report. A hosted ChatOpenAI would show up here as
 *    LangGraph streamMode "messages" / on_chat_model_stream. This local model
 *    does not, because the graph tracer collapses it into one end event, so
 *    we read model.stream() directly and label those chunks "messages".
 * 3. parsePartialJson closes the unfinished JSON so the UI can draw fields
 *    before the last token arrives.
 *
 * LocalJsonChatModel never opens a socket. Do not swap in a hosted chat
 * model: the report contains holdings, costs, and notes.
 */

export interface AdviceReport {
  quoteNote: string;
  summary: string;
  findings: { title: string; detail: string }[];
  checks: { name: string; status: "ok" | "warn" | "unknown"; detail: string }[];
  disclaimer: string;
}

export type AdviceStreamEvent =
  | { mode: "updates"; step: string; detail: string }
  | { mode: "messages"; text: string; partial: Partial<AdviceReport> | undefined };

const DISCLAIMER = "以上只供個人參考，不是持牌投資建議。價格只用 CNBC 最近報價同你自己輸入的成本，全部在這部裝置計算。";

export function toAdviceReport(result: AdviceResult): AdviceReport {
  const body = result.answer
    .replace(result.quoteNote, "")
    .replace(DISCLAIMER, "")
    .trim()
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const checks: AdviceReport["checks"] = [];
  if (result.quoteNote.includes("未有 CNBC") || result.quoteNote.includes("未完全成功") || result.quoteNote.includes("過時")) {
    checks.push({ name: "報價", status: "unknown", detail: result.quoteNote });
  } else {
    checks.push({ name: "報價", status: "ok", detail: result.quoteNote });
  }
  if (result.answer.includes("低於當時成本")) {
    checks.push({ name: "溝貨", status: "warn", detail: "買賣紀錄有低於成本、而且沒有預先分注的買入。" });
  }
  if (result.answer.includes("已到") && result.answer.includes("停手線")) {
    checks.push({ name: "本月回撤", status: "warn", detail: "本月回撤已到停手線。" });
  }
  return {
    quoteNote: result.quoteNote,
    summary: body[0] ?? result.quoteNote,
    findings: body.map((detail, index) => ({
      title: result.retrieved[Math.min(index, Math.max(result.retrieved.length - 1, 0))] ?? `要點 ${index + 1}`,
      detail,
    })),
    checks,
    disclaimer: DISCLAIMER,
  };
}

class LocalJsonChatModel extends BaseChatModel {
  constructor(private readonly json: string) {
    super({});
  }

  _llmType(): string {
    return "local-notebook-json";
  }

  async _generate(): Promise<ChatResult> {
    return {
      generations: [{ text: this.json, message: new AIMessageChunk(this.json) }],
    };
  }

  async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
    const size = 36;
    for (let index = 0; index < this.json.length; index += size) {
      const text = this.json.slice(index, index + size);
      yield new ChatGenerationChunk({
        text,
        message: new AIMessageChunk({ content: text }),
      });
    }
  }
}

const AdviceState = Annotation.Root({
  question: Annotation<string>,
  quoteNote: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
  retrieved: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  reportJson: Annotation<string>({ reducer: (_left, right) => right, default: () => "" }),
});

function compileAdviceGraph(notebook: Notebook, opts: { liveErrors: string[]; refreshed: boolean }) {
  return new StateGraph(AdviceState)
    .addNode("lookupQuotes", (state) => {
      const result = advise(notebook, state.question, opts);
      return { quoteNote: result.quoteNote };
    })
    .addNode("lookupFacts", (state) => {
      const result = advise(notebook, state.question, opts);
      return { retrieved: result.retrieved };
    })
    .addEdge(START, "lookupQuotes")
    .addEdge("lookupQuotes", "lookupFacts")
    .addEdge("lookupFacts", END)
    .compile();
}

function textOf(message: BaseMessage | string): string {
  if (typeof message === "string") return message;
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : "text" in part ? String(part.text ?? "") : "")).join("");
  }
  return "";
}

function updateDetail(step: string, value: unknown): string {
  if (!value || typeof value !== "object") return step;
  const record = value as Record<string, unknown>;
  if (typeof record.quoteNote === "string") return record.quoteNote;
  if (Array.isArray(record.retrieved)) return record.retrieved.join("、");
  if (typeof record.reportJson === "string") return "JSON 報告已完成";
  return step;
}

export async function* streamAdviceReport(
  notebook: Notebook,
  question: string,
  opts: { liveErrors: string[]; refreshed: boolean },
): AsyncGenerator<AdviceStreamEvent> {
  const prepared = advise(notebook, question, opts);
  const reportJson = JSON.stringify(toAdviceReport(prepared));
  const graph = compileAdviceGraph(notebook, opts);
  // Phase 1: LangGraph streamMode "updates".
  const updates = await graph.stream(
    { question, quoteNote: "", retrieved: [], reportJson: "" },
    { streamMode: "updates" },
  );
  for await (const event of updates) {
    if (!event || typeof event !== "object") continue;
    const step = Object.keys(event)[0] ?? "lookup";
    yield { mode: "updates", step, detail: updateDetail(step, (event as Record<string, unknown>)[step]) };
  }
  // Phase 2: chat-model message stream. Chunks are the JSON report.
  const model = new LocalJsonChatModel(reportJson);
  const messages = await model.stream([new HumanMessage("用已在本機備好的 JSON 報告作答。")]);
  let buffer = "";
  for await (const chunk of messages) {
    const text = textOf(chunk);
    if (!text) continue;
    buffer += text;
    const partial = parsePartialJson(buffer);
    yield {
      mode: "messages",
      text,
      partial: partial && typeof partial === "object" ? (partial as Partial<AdviceReport>) : undefined,
    };
  }
}

export function finalReport(events: AdviceStreamEvent[]): AdviceReport | undefined {
  const raw = events.filter((event) => event.mode === "messages").map((event) => event.text).join("");
  const parsed = parsePartialJson(raw);
  if (!parsed || typeof parsed !== "object" || !("quoteNote" in parsed)) return undefined;
  return parsed as AdviceReport;
}
