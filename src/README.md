# 原始碼

`cfe-2026-spring/` 是上線用的成品（GitHub Pages）；這裡是組出成品的原始碼。

- `recorder/`　對局記錄器。`python3 build.py [輸出路徑]` 組出單檔 recorder.html，成品放到 `cfe-2026-spring/recorder.html`。測試：`node test/game1.js`、`node test/game2.js`
- `tournament/`　主辦方賽事網頁。`python3 src/build.py host-xxxx.html` 組出單檔（輸出在 tournament/ 內），成品放到 `cfe-2026-spring/`
- `decks/`　牌組提交系統（commit/）與 DeckEditer.html，成品為 `cfe-2026-spring/` 內同名檔案

流程：先在本機改原始碼 → 組出成品開啟驗證 → 沒問題再放進 `cfe-2026-spring/` 上線。
