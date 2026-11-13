import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { valuePortfolio } from "../lib/calc";
import { todayHK } from "../lib/dates";
import { loadNotebook, saveNotebook } from "../lib/db";
import { refreshMarketData } from "../lib/quotes";
import { emptyNotebook, type Holding, type Notebook, type Quote } from "../lib/types";

interface Store {
  ready: boolean;
  dbError: string | null;
  data: Notebook;
  marketError: string | null;
  marketBusy: boolean;
  update: (fn: (data: Notebook) => Notebook) => void;
  replace: (data: Notebook) => void;
  refreshMarket: (opts?: { forceHistory?: boolean }) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function enrichHolding(holding: Holding, quotes: Record<string, Quote>): Holding {
  const quote = quotes[holding.ticker];
  if (!quote) return holding;
  return {
    ...holding,
    name: holding.name && holding.name !== holding.ticker ? holding.name : quote.name || holding.name,
    beta: holding.betaManual ? holding.beta : (quote.beta ?? holding.beta),
    marketCapUsd: holding.marketCapManual ? holding.marketCapUsd : (quote.marketCapUsd ?? holding.marketCapUsd),
  };
}

export function NotebookProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Notebook>(emptyNotebook);
  const [ready, setReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const pending = useRef<Notebook | null>(null);
  const timer = useRef<number | null>(null);
  const booted = useRef(false);

  const persist = useCallback((next: Notebook) => {
    pending.current = next;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const snapshot = pending.current;
      if (!snapshot) return;
      void saveNotebook(snapshot).catch(() => setDbError("無法寫入 IndexedDB，這次改動可能未能保存。"));
    }, 200);
  }, []);

  useEffect(() => {
    let cancel = false;
    void loadNotebook()
      .then((loaded) => {
        if (!cancel && loaded) setData(loaded);
      })
      .catch(() => {
        if (!cancel) setDbError("這部瀏覽器未能開啟 IndexedDB。你可以繼續查看，但重新整理後資料會消失。");
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    const flush = () => {
      if (pending.current) void saveNotebook(pending.current).catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      cancel = true;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const update = useCallback(
    (fn: (current: Notebook) => Notebook) => {
      setData((prev) => {
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    (next: Notebook) => {
      setData(next);
      pending.current = next;
      void saveNotebook(next).catch(() => setDbError("無法寫入 IndexedDB。"));
    },
    [],
  );

  const refreshMarket = useCallback(
    async (opts?: { forceHistory?: boolean }) => {
      setMarketBusy(true);
      setMarketError(null);
      try {
        const result = await refreshMarketData(dataRef.current, opts);
        setData((prev) => {
          const next: Notebook = {
            ...prev,
            quotes: result.quotes,
            fx: result.fx ?? prev.fx,
            fxHistory: result.fxHistory,
            priceHistory: result.priceHistory,
            holdings: prev.holdings.map((holding) => enrichHolding(holding, result.quotes)),
          };
          const today = todayHK();
          const equity = valuePortfolio(next).equityHkd;
          next.equitySnapshots = [...next.equitySnapshots.filter((item) => item.date !== today), { date: today, equityHkd: equity }].slice(-800);
          persist(next);
          return next;
        });
        if (result.errors.length) setMarketError(result.errors.join("　"));
      } catch (error) {
        setMarketError(error instanceof Error ? error.message : "更新失敗");
      } finally {
        setMarketBusy(false);
      }
    },
    [persist],
  );

  useEffect(() => {
    if (!ready || booted.current) return;
    if (data.settings.onboarding === "pending") return;
    booted.current = true;
    void refreshMarket();
  }, [ready, data.settings.onboarding, refreshMarket]);

  const value: Store = { ready, dbError, data, marketError, marketBusy, update, replace, refreshMarket };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotebook(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("手帳尚未準備好");
  return ctx;
}
