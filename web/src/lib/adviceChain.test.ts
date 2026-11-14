import { describe, expect, it } from "vitest";
import { advise } from "./advice";
import { finalReport, streamAdviceReport, toAdviceReport } from "./adviceChain";
import { createDemo } from "./demo";
import { parsePartialJson } from "./partialJson";

describe("partial JSON", () => {
  it("reads fields before the document is closed", () => {
    const partial = parsePartialJson('{"quoteNote": "已更新", "summary": "現金結餘');
    expect(partial).toMatchObject({ quoteNote: "已更新", summary: "現金結餘" });
  });

  it("keeps a finished finding while the next one is still open", () => {
    const partial = parsePartialJson('{"findings": [{"title": "持股", "detail": "AAPL 25 股"}, {"title": "風險"');
    const findings = (partial as { findings: { title: string }[] }).findings;
    expect(findings[0]?.title).toBe("持股");
    expect(findings[1]?.title).toBe("風險");
  });
});

describe("langchain advice stream", () => {
  it("emits lookup updates before the JSON message stream", async () => {
    const demo = createDemo();
    const events = [];
    for await (const event of streamAdviceReport(demo, "有冇溝貨", { liveErrors: [], refreshed: false })) {
      events.push(event);
    }
    const modes = events.map((event) => event.mode);
    expect(modes.indexOf("updates")).toBeGreaterThanOrEqual(0);
    expect(modes.indexOf("updates")).toBeLessThan(modes.indexOf("messages"));
    expect(modes.filter((mode) => mode === "messages").length).toBeGreaterThan(3);
    const report = finalReport(events);
    expect(report?.quoteNote).toContain("未有 CNBC");
    expect(report?.disclaimer).toContain("不是持牌投資建議");
    expect(JSON.stringify(report)).not.toContain("大叔");
    const plain = advise(demo, "有冇溝貨", { liveErrors: [], refreshed: false });
    expect(toAdviceReport(plain).summary.length).toBeGreaterThan(0);
  });
});
