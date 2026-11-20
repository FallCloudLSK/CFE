# 五行戰鬥牌《戰局記錄器》原始碼

- `src/rules.js`：規則資料（陣法、職業、能力、精靈、錦囊秘計），依 5.17 規則書與 fewfc 整理
- `src/engine.js`：計算引擎。對局只存「輸入」，`replay()` 依序重算每回合狀態、文字與問題標示
- `src/report.js`、`src/xlsx.js`：匯出網頁與 Excel
- `src/app.html`：操作介面
- `assets/`：牌圖（webp data URL）與 Logo
- `test/game1.js`、`test/game2.js`：以 2025 春季盃冠軍賽兩局重播驗證

組裝：`python3 build.py [輸出路徑]`，預設輸出 `recorder.html`（單一檔案、可離線使用）。
選手名單會讀取同資料夾的 `players.txt`。
