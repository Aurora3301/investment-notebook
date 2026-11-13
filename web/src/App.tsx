import { useEffect, useMemo, useState } from "react";
import { monthPerformance, valuePortfolio } from "./lib/calc";
import { createDemo } from "./lib/demo";
import { emptyNotebook } from "./lib/types";
import { AllocationView, TrendSheet } from "./pages/MarketViews";
import { JournalPage } from "./pages/JournalPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { RiskPage } from "./pages/RiskPage";
import { ScorePage } from "./pages/ScorePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ChromeProvider } from "./ui/chrome";
import { NotebookProvider, useNotebook } from "./state/store";

type View = "home" | "allocation" | "risk" | "score" | "journal" | "settings";

const TITLES: Record<Exclude<View, "home" | "allocation">, string> = {
  risk: "風險",
  score: "選股",
  journal: "筆記",
  settings: "設定",
};

function readView(): View {
  const hash = location.hash.replace("#", "");
  if (hash === "portfolio") return "home";
  if (hash === "home" || hash === "allocation" || hash === "risk" || hash === "score" || hash === "journal" || hash === "settings") return hash;
  return "home";
}

export function App() {
  return (
    <ChromeProvider>
      <NotebookProvider>
        <Shell />
      </NotebookProvider>
    </ChromeProvider>
  );
}

function Shell() {
  const { ready, dbError, data, marketError, replace } = useNotebook();
  const [view, setView] = useState<View>(readView);
  const [trend, setTrend] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const onHash = () => setView(readView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const valuation = useMemo(() => valuePortfolio(data), [data]);
  const month = monthPerformance({
    monthStartEquity: data.settings.monthStartEquityHkd,
    monthStartDate: data.settings.monthStartDate,
    equityHkd: valuation.equityHkd,
    cashFlows: data.cashFlows,
    knockoutPct: data.settings.monthlyKnockoutPct,
  });

  if (!ready) return <div className="boot">正在讀取這部裝置上的手帳…</div>;
  if (data.settings.onboarding === "pending") {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h1>投資手帳</h1>
          <p>組合、風險同筆記只放在這部裝置。沒有帳戶，也不會把持股送到伺服器。</p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => replace(createDemo())}>載入示範資料</button>
            <button className="btn-ghost" type="button" onClick={() => { const blank = emptyNotebook(); blank.settings.onboarding = "empty"; replace(blank); }}>由空白開始</button>
          </div>
          <p className="muted">示範資料是虛構的，可以隨時清除。這不是投資建議，亦不是任何導師的官方產品。</p>
        </div>
      </div>
    );
  }

  const select = (next: View) => {
    setView(next);
    setMore(false);
    setTrend(false);
    history.replaceState(null, "", `#${next}`);
  };

  return (
    <div className="app">
      {view !== "home" && view !== "allocation" ? (
        <div className="subhead">
          <button className="text-btn" type="button" onClick={() => select("home")}>總覽</button>
          <h1>{TITLES[view]}</h1>
        </div>
      ) : null}
      {dbError ? <div className="banner soft">{dbError}</div> : null}
      {marketError ? <div className="banner soft">{marketError}</div> : null}
      {month.knockedOut ? <div className="banner bad">本月回撤已達 {data.settings.monthlyKnockoutPct}%。建議平倉，並停止交易至月底。</div> : null}
      <main>
        {view === "home" ? <PortfolioPage /> : null}
        {view === "allocation" ? <AllocationView onClose={() => select("home")} /> : null}
        {view === "risk" ? <RiskPage /> : null}
        {view === "score" ? <ScorePage /> : null}
        {view === "journal" ? <JournalPage /> : null}
        {view === "settings" ? <SettingsPage /> : null}
      </main>
      <nav className="dock" aria-label="主要">
        <button type="button" aria-label="配置" aria-current={view === "allocation"} onClick={() => select(view === "allocation" ? "home" : "allocation")}>
          <BarsIcon />
        </button>
        <button type="button" aria-label="趨勢" aria-current={trend} onClick={() => { setTrend(true); setMore(false); }}>
          <TrendIcon />
        </button>
        <button type="button" aria-label="更多" aria-current={more} onClick={() => setMore((value) => !value)}>
          <MoreIcon />
        </button>
      </nav>
      {trend ? <TrendSheet onClose={() => setTrend(false)} /> : null}
      {more ? (
        <div className="menu-card" role="menu">
          <button className="row-btn" type="button" onClick={() => select("risk")}>風險</button>
          <button className="row-btn" type="button" onClick={() => select("score")}>選股</button>
          <button className="row-btn" type="button" onClick={() => select("journal")}>筆記</button>
          <button className="row-btn" type="button" onClick={() => select("settings")}>設定</button>
        </div>
      ) : null}
    </div>
  );
}

function BarsIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 13h4v7H4zm6-5h4v12h-4zm6-4h4v16h-4z" /></svg>;
}
function TrendIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 16l5-5 3 3 8-8" /></svg>;
}
function MoreIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18" cy="12" r="1.6" fill="currentColor" /></svg>;
}
