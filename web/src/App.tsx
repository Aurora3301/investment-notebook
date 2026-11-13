import { useEffect, useMemo, useState } from "react";
import { monthPerformance, valuePortfolio } from "./lib/calc";
import { createDemo } from "./lib/demo";
import { emptyNotebook } from "./lib/types";
import { JournalPage } from "./pages/JournalPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { RiskPage } from "./pages/RiskPage";
import { ScorePage } from "./pages/ScorePage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotebookProvider, useNotebook } from "./state/store";
import { Icon } from "./ui/ui";

type Tab = "portfolio" | "risk" | "score" | "journal" | "settings";

const TABS: { id: Tab; label: string; icon: "portfolio" | "risk" | "score" | "journal" | "settings" }[] = [
  { id: "portfolio", label: "組合", icon: "portfolio" },
  { id: "risk", label: "風險", icon: "risk" },
  { id: "score", label: "選股", icon: "score" },
  { id: "journal", label: "筆記", icon: "journal" },
  { id: "settings", label: "設定", icon: "settings" },
];

function readTab(): Tab {
  const hash = location.hash.replace("#", "");
  return TABS.some((tab) => tab.id === hash) ? (hash as Tab) : "portfolio";
}

export function App() {
  return (
    <NotebookProvider>
      <Shell />
    </NotebookProvider>
  );
}

function Shell() {
  const { ready, dbError, data, marketError, replace } = useNotebook();
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    const onHash = () => setTab(readTab());
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
            <button className="btn" type="button" onClick={() => replace(createDemo())}>
              載入示範資料
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                const blank = emptyNotebook();
                blank.settings.onboarding = "empty";
                replace(blank);
              }}
            >
              由空白開始
            </button>
          </div>
          <p className="muted">示範資料是虛構的，可以隨時清除。這不是投資建議，亦不是任何導師的官方產品。</p>
        </div>
      </div>
    );
  }

  const select = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", `#${next}`);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>投資手帳</h1>
          <span className="pill">只存這部裝置</span>
        </div>
        {data.settings.onboarding === "demo" ? <div className="ribbon">示範資料，並非真實持倉。可在設定清除。</div> : null}
        {dbError ? <div className="banner soft">{dbError}</div> : null}
        {marketError ? <div className="banner soft">{marketError}</div> : null}
        {month.knockedOut ? (
          <div className="banner bad">本月回撤已達 {data.settings.monthlyKnockoutPct}%。建議平倉，並停止交易至月底。</div>
        ) : null}
      </header>
      <main>
        {tab === "portfolio" ? <PortfolioPage /> : null}
        {tab === "risk" ? <RiskPage /> : null}
        {tab === "score" ? <ScorePage /> : null}
        {tab === "journal" ? <JournalPage /> : null}
        {tab === "settings" ? <SettingsPage /> : null}
      </main>
      <nav className="nav" aria-label="主要">
        {TABS.map((item) => (
          <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => select(item.id)}>
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
