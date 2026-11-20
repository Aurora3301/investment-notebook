import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { valuePortfolio } from "../lib/calc";
import { todayHK } from "../lib/dates";
import { loadStoredNotebook, readLocalNotebook, saveNotebook, writeLocalNotebook } from "../lib/db";
import { fetchHistoryMarket, fetchLiveMarket, tryYahooVooHistory, yahooHistoryCovers } from "../lib/quotes";
import { emptyNotebook, type Holding, type Notebook, type Quote } from "../lib/types";

interface Store {
  ready: boolean;
  dbError: string | null;
  data: Notebook;
  marketError: string | null;
  marketBusy: boolean;
  update: (fn: (data: Notebook) => Notebook) => void;
  replace: (data: Notebook) => void;
  refreshMarket: (opts?: { forceHistory?: boolean }) => Promise<{ book: Notebook; liveErrors: string[] }>;
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

const SAVE_ERROR = "這部裝置未能保存資料。請在設定匯出 JSON，以免關掉程式後消失。";

function storedOrEmpty(): Notebook {
  return readLocalNotebook() ?? emptyNotebook();
}

function hasStarted(book: Notebook): boolean {
  return Boolean(book.savedAt || book.holdings.length || book.cashFlows.length || book.trades.length || book.cashHkd);
}

export function NotebookProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Notebook>(storedOrEmpty);
  const [ready, setReady] = useState(() => hasStarted(storedOrEmpty()));
  const [dbError, setDbError] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketBusy, setMarketBusy] = useState(false);
  const dataRef = useRef(data);
  const pending = useRef<Notebook | null>(null);
  const timer = useRef<number | null>(null);
  const booted = useRef(false);
  const refreshGeneration = useRef(0);

  const persist = useCallback((next: Notebook) => {
    const stamped = { ...next, savedAt: new Date().toISOString() };
    dataRef.current = stamped;
    pending.current = stamped;
    const local = writeLocalNotebook(stamped);
    if (local === "failed") setDbError(SAVE_ERROR);
    else setDbError(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const snapshot = pending.current;
      if (!snapshot) return;
      void saveNotebook(snapshot).catch(() => {
        if (writeLocalNotebook(snapshot) === "failed") setDbError(SAVE_ERROR);
      });
    }, 200);
    return stamped;
  }, []);

  useEffect(() => {
    let cancel = false;
    const openTimer = window.setTimeout(() => {
      if (!cancel) setReady(true);
    }, 4000);
    void loadStoredNotebook()
      .then((loaded) => {
        if (cancel || !loaded) return;
        setData((current) => {
          if (current.savedAt && current.savedAt >= (loaded.savedAt || "")) {
            dataRef.current = current;
            return current;
          }
          dataRef.current = loaded;
          return loaded;
        });
      })
      .catch(() => {
        if (!cancel) setDbError(SAVE_ERROR);
      })
      .finally(() => {
        if (!cancel) setReady(true);
        window.clearTimeout(openTimer);
      });
    const flush = () => {
      const snapshot = pending.current ?? dataRef.current;
      if (!snapshot?.savedAt) return;
      writeLocalNotebook(snapshot);
      void saveNotebook(snapshot).catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    void navigator.storage?.persist?.();
    return () => {
      cancel = true;
      window.clearTimeout(openTimer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  const update = useCallback(
    (fn: (current: Notebook) => Notebook) => {
      setData((prev) => persist(fn(prev)));
    },
    [persist],
  );

  const replace = useCallback(
    (next: Notebook) => {
      const stamped = persist(next);
      setData(stamped);
    },
    [persist],
  );

  const refreshMarket = useCallback(
    async (opts?: { forceHistory?: boolean }) => {
      const generation = refreshGeneration.current + 1;
      refreshGeneration.current = generation;
      setMarketBusy(true);
      setMarketError(null);
      const stale = () => refreshGeneration.current !== generation;
      let liveErrors: string[] = [];
      let book = dataRef.current;
      try {
        // Paint CNBC last prices and Frankfurter FX before any history request.
        const live = await fetchLiveMarket(dataRef.current);
        liveErrors = live.errors;
        if (!stale()) {
          setData((prev) => {
            const next: Notebook = {
              ...prev,
              quotes: live.quotes,
              fx: live.fx ?? prev.fx,
              holdings: prev.holdings.map((holding) => enrichHolding(holding, live.quotes)),
            };
            const today = todayHK();
            const equity = valuePortfolio(next).equityHkd;
            next.equitySnapshots = [...next.equitySnapshots.filter((item) => item.date !== today), { date: today, equityHkd: equity }].slice(-800);
            const stamped = persist(next);
            book = stamped;
            return stamped;
          });
          if (live.errors.length) setMarketError(live.errors.join("　"));
        }
      } catch (error) {
        if (!stale()) setMarketError(error instanceof Error ? error.message : "更新失敗");
      } finally {
        if (!stale()) setMarketBusy(false);
      }

      const priced = book;
      const errorsNow = liveErrors;
      void (async () => {
        // Yahoo starts here so a CORS failure cannot hold 「更新報價」 or advice.
        const yahooPromise = tryYahooVooHistory();
        try {
          const history = await fetchHistoryMarket(dataRef.current, opts);
          if (stale()) return;
          setData((prev) => {
            const next: Notebook = {
              ...prev,
              fxHistory: history.fxHistory,
              priceHistory: { ...prev.priceHistory, ...history.priceHistory },
            };
            return persist(next);
          });
          const historyErrors = [...errorsNow, ...history.errors];
          if (!stale()) setMarketError(historyErrors.length ? historyErrors.join("　") : null);
        } catch (error) {
          if (!stale()) setMarketError(error instanceof Error ? error.message : "歷史價格更新失敗");
        }
        try {
          const points = await yahooPromise;
          if (stale() || !points) return;
          const earliest = [...dataRef.current.cashFlows].map((flow) => flow.date).sort()[0];
          if (!yahooHistoryCovers(points, earliest)) return;
          setData((prev) =>
            persist({
              ...prev,
              priceHistory: {
                ...prev.priceHistory,
                VOO: { points, adjusted: true, source: "yahoo", fetchedAt: new Date().toISOString() },
              },
            }),
          );
        } catch {
          // CNBC close remains, and the portfolio screen keeps the dividend disclosure.
        }
      })();

      return { book: priced, liveErrors: errorsNow };
    },
    [persist],
  );

  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    void refreshMarket();
  }, [ready, refreshMarket]);

  const value: Store = { ready, dbError, data, marketError, marketBusy, update, replace, refreshMarket };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotebook(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("手帳尚未準備好");
  return ctx;
}
