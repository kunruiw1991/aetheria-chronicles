# 🌟 Aetheria Chronicles | 星境奇旅：艾瑟瑞亚大陆

A bilingual (中文 / English), original-IP, multi-chapter Classic Fantasy RPG built for **WeChat Personal Mini Game + Pure IAA Ad Monetization (`个人主体 + 微信流量主激励视频/插屏广告`)** — with zero cash paywalls (`¥`/`$`/MidasPay).

## 🏗️ Two Runtime Targets (Shared Core Logic)

1. **Native WeChat Mini Game (`小游戏`) — Pure Canvas Runtime (Zero DOM)**
   - Root entry: [`game.js`](game.js) → [`minigame/native_app.js`](minigame/native_app.js)
   - Shared zero-DOM game core: [`js/core.js`](js/core.js) (shared with Web so save validation, HP scaling, bundle claims, and combat math never drift)
   - Manifest & DevTools config: [`game.json`](game.json), [`project.config.json`](project.config.json) (excludes browser-only `js/battle.js`, `js/ui.js`, `js/game.js`, `index.html`, `css/`, and `dist/` from WeChat uploads)
   - Ad Unit IDs: [`config/ads.js`](config/ads.js) (`rewardedVideoUnitId`, `interstitialUnitId`)
   - Audio: `wx.createWebAudioContext()` via [`js/audio.js`](js/audio.js)
   - Input: `wx.onTouchStart / onTouchMove / onTouchEnd / onTouchCancel`
   - **Fail-Closed Ad Behavior**: Inside a WeChat runtime (`wx` present), if `rewardedVideoUnitId` is empty or `wx.createRewardedVideoAd` is unavailable, `Platform.showRewardedAd()` fails closed (shows an unavailable toast, grants **0** progress, never falls back to simulated web rewards).

2. **Web / Browser Sandbox Preview**
   - Entry: [`index.html`](index.html) + [`css/style.css`](css/style.css) + [`js/core.js`](js/core.js) + [`js/battle.js`](js/battle.js) + [`js/ui.js`](js/ui.js) + [`js/game.js`](js/game.js)
   - Self-contained single-file browser preview bundle: `python3 scripts/build_singlefile.py` → `dist/aetheria_chronicles.html` (intentionally enables `allowWebSimulation: true` for non-WeChat browser preview; excluded from WeChat Mini Game builds).

## 📲 Importing into WeChat DevTools (`微信开发者工具`)

1. Open **WeChat DevTools** → **Import Project (`导入项目`)** → select the repository root directory.
2. Confirm **Mode** is **Mini Game (`小游戏`, `compileType: "game"`)**.
3. Use `touristappid` for initial simulator preview, or enter your registered personal Mini Game `AppID` in [`project.config.json`](project.config.json).
4. Once your personal Mini Game unlocks **Traffic Master (`流量主`)** in `mp.weixin.qq.com`, paste your real `adunit-...` IDs into [`config/ads.js`](config/ads.js).
5. Verify startup, Canvas rendering, audio, touch input, rewarded video ads, interstitial ads, and sharing in WeChat DevTools and on physical iOS & Android devices.

### Remaining Account / Device Dependencies
- Personal Mini Game registration (`个人主体小游戏`), real-name verification, and ICP filing (`小程序备案`) in WeChat MP Console.
- Traffic Master (`流量主`) activation & real `adunit-...` IDs in [`config/ads.js`](config/ads.js).
- First-hand startup, rendering, audio, and live-ad verification in WeChat DevTools and on physical iOS/Android devices (automated tests in this repo run against Chromium and a zero-DOM mocked-`wx` Node runtime, not the proprietary WeChat runtime).

### Offline Save Limitation
- Saves are stored locally (`wx.setStorageSync` / `localStorage`) with schema & unlocked-chapter coordinate validation on load and rollback on write failure.
- Because v1 has no backend server, local device storage is client-mutable; tamper-resistant monetization/progress enforcement would require server-side ad verification callbacks in a future version.

## 🗺️ 5 Interconnected Fantasy Chapters
| Chapter | Region | Access | Sanctum Dungeon & Guardian Boss |
| :-: | :--- | :-: | :--- |
| **Ch. 1** | 🌿 Emerald Meadow & Dawnwood (`翡翠平原 · 晨木镇`) | **FREE** | Ancient Root Sanctum · **Verdant Stag (`苍木灵鹿`)** |
| **Ch. 2** | 🐚 Coral Bay & Tidebreak Harbor (`珊瑚海湾 · 潮汐港`) | **FREE** | Sunken Pearl Grotto · **Tidecrest (`沧澜海龙`)** |
| **Ch. 3** | ☀️ Sunfire Desert & Oasis Citadel (`烈日沙城 · 绿洲古城`) | **FREE** | Solar Pyramid Vault · **Heliowing (`烈阳金凤`)** |
| **Ch. 4** | ❄️ Frostpeak Citadel & Glacier (`雪峰古堡 · 冰晶雪原`) | **🎬 2 Rewarded Ads** | Glacial Crown Keep · **Glacieron (`寒穹冰龙`)** |
| **Ch. 5** | ✨ Starlight Sky Sanctum (`星界神殿 · 苍穹浮岛`) | **🎬 3 Rewarded Ads** | Celestial Throne Sanctum · **Celestiar (`星界圣龙`)** |

## 🧪 Automated Tests & Verification Commands

```bash
# 1. Node.js Unit, Balance Monte Carlo & Zero-DOM Native WeChat Runtime Tests (V8 coverage)
node --test --experimental-test-coverage tests/unit.test.js

# 2. Rebuild single-file browser preview bundle
python3 scripts/build_singlefile.py

# 3. Chromium Playwright E2E + UTF-16 Mapped V8 Coverage (1280x800, 390x844, 360x800)
python3 tests/e2e_coverage.py
```
