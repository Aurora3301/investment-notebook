# 投資手帳

投資手帳是一個給香港用戶的投資組合同筆記工具。介面用繁體中文。持股、現金、入金、交易、計劃、評分同備註都只存在你這部裝置，不會上傳到我們的伺服器，因為這個專案根本沒有持倉後端。

它不是證券行，也不是任何導師的官方產品。畫面上的規則用來對照學習，**不是投資建議**。

## 私隱

- 沒有帳戶、沒有登入、沒有分析套件。
- 所有個人資料放在瀏覽器的 IndexedDB。結構有版本號，之後可以遷移。
- 不會自動同步到 iCloud。要換機，請自己匯出 JSON。
- 更新報價時，裝置只會把**股票代號**（以及美元／港元這個貨幣對）送給公開報價網站。股數、成本、現金不會送出。對方伺服器仍會看到你的網絡地址同代號。

## 怎樣用網頁版

程式碼合併到 `main` 之後，GitHub Actions 會建置並部署到 GitHub Pages。

1. 打開倉庫的 **Settings → Pages**。
2. **Build and deployment** 的 Source 選 **GitHub Actions**。
3. 等 `.github/workflows/pages.yml` 跑完。
4. 用這個網址開啟（Pages 啟用後）：

<https://aurora3301.github.io/investment-notebook/>

第一次會問你載入虛構的示範資料，還是由空白開始。示範資料標明「並非真實持倉」，可以在設定清除。

### 加到 iPhone 主畫面

1. 用 **Safari** 打開上面的網址。
2. 點分享按鈕。
3. 選 **加入主畫面**。
4. 名稱會是「投資手帳」。之後可以離線打開已載入的畫面；報價要有網絡才會更新。

Android 用 Chrome 的「加到主畫面」或「安裝應用程式」即可。這是一個 PWA：有 manifest、圖示、主題色，以及離線可用的程式殼。

## 備份

在 **設定**：

- **匯出 JSON**：下載一個檔案，包含持股、現金、入金提款、交易、計劃、評分、筆記、設定，以及已下載的報價快取。
- **匯入並取代**：用該檔案覆蓋這部裝置上的全部資料。匯入前會再問一次。

## 報價怎樣取

| 資料 | 來源 | 瀏覽器能否直接讀 |
| --- | --- | --- |
| 現價、名稱、Beta、市值 | [CNBC 公開報價](https://quote.cnbc.com) | 可以，回應允許跨域 |
| 歷史收市價 | CNBC 日線 | 可以。索取區間固定由 2010 年起，不會把你的入金日期送出去 |
| 美元／港元 | [Frankfurter](https://www.frankfurter.app)（歐洲央行參考匯率） | 可以 |
| VOO 調整收市價（含股息的總回報） | Yahoo Finance chart | 瀏覽器通常被跨域政策擋住 |

現價只用 CNBC，不用 Yahoo：在 GitHub Pages 上，瀏覽器讀 Yahoo 會被跨域政策擋住。美元／港元用 Frankfurter。兩者都不是交易所正式即時報價，只供個人對照。VOO 的歷史對照以 CNBC 收市價為準，畫面會寫明未含股息再投資。報價顯示之後，程式或會在背景試一次 Yahoo 調整收市價；試不到就保持 CNBC，也不經第三方代理。成功的價格會存在本機。股價時間會轉成 `Asia/Hong_Kong`。

XIRR 用實際日數除以 365，跟 Excel 同一套。入金是流出，提款是流入，終值是當日股票市值加現金。VOO 對照是：同樣的港元現金流在當日匯率買入 VOO，提款就賣出，再算年化。

## 本機建議（LangChain）

底部「建議」會先走現有的 CNBC／Frankfurter 更新，然後在這部裝置跑一條 LangGraph：

1. **updates**：查報價備註，再查本機持股、風險、溝貨等資料。
2. **messages**：本地的 `LocalJsonChatModel` 把 JSON 報告逐段送出。它不是雲端模型，不會把持倉送出去。
3. 畫面用 partial JSON 解析器，在 JSON 尚未收完時先畫出已經閉合的欄位。

這是用來學 LangChain 串流形狀的實作。不要把它換成會連網的 Chat 模型，否則提示詞會帶有持股同成本。

## 在電腦改網頁

```bash
cd web
npm install
npm test
npm run dev
```

開發網址是 `http://127.0.0.1:5173/`。正式建置：

```bash
cd web
npm run build
npm run preview
```

Pages 工作流程會設定 `GITHUB_PAGES=true`，資源路徑是 `/investment-notebook/`。

## 用 Xcode 裝到自己的 iPhone

`ios/InvestmentNotebook.xcodeproj` 是一個 SwiftUI + WKWebView 殼。它在手機的 `127.0.0.1` 提供同一套網頁，所以 IndexedDB 同 HTTPS 報價都可以用。殼本身不把資料送到別處。

1. 在 Mac 上：

```bash
cd web
npm install
npm run build:ios
```

`build:ios` 會把網頁複製到 `ios/InvestmentNotebook/web`。

2. 用 Xcode 打開 `ios/InvestmentNotebook.xcodeproj`。
3. 選目標 **InvestmentNotebook**，在 **Signing & Capabilities** 選你的 Team。免費的 Apple ID 也可以在自己的手機上裝一段時間。
4. 用線連接 iPhone，選該裝置，按 Run。
5. 若手機提示不受信任的開發者：到 **設定 → 一般 → VPN 與裝置管理** 信任你的開發者 App。

App Store 同 TestFlight 需要付費的 Apple Developer Program。GitHub 不能幫陌生人安裝 `.ipa`。沒有你的開發者帳號，別人只能用上面的網頁或「加入主畫面」，不能從這個倉庫直接得到可安裝的原生 App。

## 功能（全部在本機）

- 持股、港元現金、入金／提款、市值、比重、未實現盈虧。
- 觀察名單。示範名單是 OKTA、PANW、CRWD、VST、VRT。
- 個股筆記同重要日子。
- 大叔美股筆記的四關法：每隻持股四關，紅／黃／綠加備註。預設名稱只是關卡一至關卡四，可在設定修改。程式不另造關卡名稱。
- 港元 XIRR，以及同一現金流買入 VOO 的對照。
- 阿樂《投資唔講廢話》2021：2% / 6% 風險、三種只含股票與現金的組合模板、40 分選股、交易計劃與溝貨提示、資金曲線與 R、手動經濟周期。2021 年之後或有補充，請核對原文。

## English

Investment Notebook is a privacy-first portfolio journal for Hong Kong users. The interface is Traditional Chinese. Holdings, cash, deposits, trades, plans, scores, and notes stay in IndexedDB on the device. There is no account and no portfolio backend.

It is not investment advice and not an official product of any educator.

After this repository is on `main` and GitHub Pages is set to **GitHub Actions**, the site is:

<https://aurora3301.github.io/investment-notebook/>

On iPhone, open that URL in Safari and use Share → Add to Home Screen.

To install the native shell, a Mac user opens `ios/InvestmentNotebook.xcodeproj`, selects their signing team, and runs it on their own iPhone. App Store and TestFlight still need a paid Apple Developer account. Strangers cannot sideload a native iOS app from GitHub alone.

Export and import one JSON file from Settings. Last prices come from CNBC and USD/HKD from Frankfurter, both requested by the device. Yahoo is not used for last prices because GitHub Pages cannot read it from the browser. VOO history uses CNBC closes, which do not reinvest dividends; an optional Yahoo adjusted-close attempt runs in the background and does not block the quote refresh. Positions, costs, and cash are never sent.

```bash
cd web && npm install && npm test && npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
