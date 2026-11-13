import { useState } from "react";
import { downloadBackup, parseBackup } from "../lib/backup";
import { createDemo } from "../lib/demo";
import { parseDecimal } from "../lib/format";
import { emptyNotebook, type Settings } from "../lib/types";
import { useNotebook } from "../state/store";
import { Card, Field, GhostButton, PrimaryButton, WarnButton } from "../ui/ui";

export function SettingsPage() {
  const { data, update, replace } = useNotebook();
  const [message, setMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const settings = data.settings;

  const patch = (partial: Partial<Settings>) => {
    update((book) => ({ ...book, settings: { ...book.settings, ...partial } }));
  };

  return (
    <div>
      <Card title="風險參數">
        <div className="grid2">
          <Field label="單筆風險 %">
            <input inputMode="decimal" defaultValue={settings.riskPct} onBlur={(event) => saveNum(event.target.value, (value) => patch({ riskPct: value }))} />
          </Field>
          <Field label="本月停手 %">
            <input inputMode="decimal" defaultValue={settings.monthlyKnockoutPct} onBlur={(event) => saveNum(event.target.value, (value) => patch({ monthlyKnockoutPct: value }))} />
          </Field>
          <Field label="R %">
            <input inputMode="decimal" defaultValue={settings.rPct} onBlur={(event) => saveNum(event.target.value, (value) => patch({ rPct: value }))} />
          </Field>
          <Field label="手動美元／港元">
            <input
              inputMode="decimal"
              placeholder="報價失敗時使用"
              defaultValue={settings.manualUsdHkd ?? ""}
              onBlur={(event) => {
                const value = parseDecimal(event.target.value);
                patch({ manualUsdHkd: value != null && value > 0 ? value : null });
              }}
            />
          </Field>
          <Field label="起始資金（港元）">
            <input
              inputMode="decimal"
              defaultValue={settings.startingCapitalHkd ?? ""}
              onBlur={(event) => {
                const value = parseDecimal(event.target.value);
                patch({ startingCapitalHkd: value });
              }}
            />
          </Field>
          <Field label="假設勝率 %">
            <input inputMode="decimal" defaultValue={settings.winRatePct ?? ""} onBlur={(event) => patch({ winRatePct: parseDecimal(event.target.value) })} />
          </Field>
          <Field label="假設平均贏（R）">
            <input inputMode="decimal" defaultValue={settings.avgWinR ?? ""} onBlur={(event) => patch({ avgWinR: parseDecimal(event.target.value) })} />
          </Field>
          <Field label="假設平均輸（R）">
            <input inputMode="decimal" defaultValue={settings.avgLossR ?? ""} onBlur={(event) => patch({ avgLossR: parseDecimal(event.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="四關名稱">
        <p className="muted">預設名稱是關卡一至關卡四，可在這裡修改。</p>
        <div className="stack">
          {settings.gateTitles.map((title, index) => (
            <Field key={index} label={`第 ${index + 1} 關`}>
              <input
                defaultValue={title}
                onBlur={(event) => {
                  const fallback = ["關卡一", "關卡二", "關卡三", "關卡四"][index];
                  const title = event.target.value.trim() || fallback;
                  const next = settings.gateTitles.map((item, itemIndex) => (itemIndex === index ? title : item)) as Settings["gateTitles"];
                  patch({ gateTitles: next });
                }}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="備份">
        <p className="muted">一個 JSON 包含持股、現金、入金、交易、計劃、評分、筆記同設定。匯入會取代這部裝置上的全部資料。</p>
        <div className="actions">
          <PrimaryButton type="button" onClick={() => downloadBackup(data)}>
            匯出 JSON
          </PrimaryButton>
          <label className="btn-ghost" style={{ display: "inline-flex", alignItems: "center" }}>
            匯入並取代
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!window.confirm("匯入會取代這部裝置上的全部手帳資料。確定？")) return;
                try {
                  const notebook = parseBackup(await file.text());
                  replace(notebook);
                  setMessage("已用備份取代本機資料。");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "匯入失敗");
                }
              }}
            />
          </label>
        </div>
        {message ? <p className="banner info">{message}</p> : null}
      </Card>

      <Card title="資料">
        <div className="actions">
          <GhostButton
            type="button"
            onClick={() => {
              if (data.holdings.length || data.trades.length) {
                if (!window.confirm("載入示範會取代現有持股、交易同筆記。確定？")) return;
              }
              replace(createDemo());
            }}
          >
            載入示範資料
          </GhostButton>
          <GhostButton
            type="button"
            onClick={() => {
              const blank = emptyNotebook();
              blank.settings.onboarding = "empty";
              replace(blank);
            }}
          >
            由空白開始
          </GhostButton>
          {confirmClear ? (
            <WarnButton
              type="button"
              onClick={() => {
                const blank = emptyNotebook();
                blank.settings.onboarding = "pending";
                replace(blank);
                setConfirmClear(false);
              }}
            >
              確定清除全部
            </WarnButton>
          ) : (
            <WarnButton type="button" onClick={() => setConfirmClear(true)}>
              清除全部資料
            </WarnButton>
          )}
        </div>
        <p className="muted">示範數字是虛構的，用來試功能，不是真實戶口。</p>
      </Card>

      <Card title="報價怎樣取">
        <p className="muted">
          現價只來自 CNBC 的公開報價。這個來源在 GitHub Pages 上可以由瀏覽器直接讀取。Yahoo 的現價介面會被瀏覽器的跨域限制擋住，所以不用來顯示最新價。匯率來自 Frankfurter（歐洲央行美元／港元）。請求只包含代號或貨幣對，不會送出股數、成本或現金。這些都不是交易所的正式即時報價，只供自己對照。
        </p>
        <p className="muted">
          歷史收市價直接向 CNBC 索取固定日期區間，避免把你的入金日期送出去。CNBC 收市價未含股息再投資，組合頁會寫明。VOO 對照或會在報價已經顯示之後，於背景試一次 Yahoo 的調整收市價；試不到就繼續用 CNBC，不會擋住「更新報價」。
        </p>
        <p className="muted">成功取得的價格與匯率會寫進這部裝置的 IndexedDB，離線時仍可看上次的數字。時間會轉成香港時間。</p>
      </Card>

      <Card title="教學來源與界限">
        <p className="muted">
          2%、6%、三個組合、40 分選股、分注與資金曲線，整理自《投資唔講廢話》2021 年系列，方便對照學習。2021 年之後作者或有補充，請自行核對原文。
        </p>
        <p className="muted">四關法整理自大叔美股筆記，名稱由你自己填，程式不另造關卡名稱。它與阿樂的四項評分是兩套東西。</p>
        <p className="muted">
          這不是投資建議，也不是阿樂或大叔美股筆記的官方產品。規則只供學習。市場有風險，盈虧自負。本程式沒有帳戶、沒有持倉後端、沒有分析套件，也不會自動同步到 iCloud。
        </p>
      </Card>
    </div>
  );
}

function saveNum(raw: string, apply: (value: number) => void) {
  const value = parseDecimal(raw);
  if (value == null || value <= 0) return;
  apply(value);
}
