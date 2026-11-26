# 🌟 Aetheria Chronicles | 星境奇旅：艾瑟瑞亚大陆

A **100% original-IP**, bilingual (中文 / English) multi-chapter Classic Fantasy RPG designed for **WeChat Personal Mini Game + IAA Ad Monetization (`个人主体 + 流量主激励视频/插屏广告变现`)** — zero company registration cost, zero game ISBN (`版号`) required, and solo-dev ready!

## 🗺️ 5 Interconnected Fantasy Chapters (First 3 Open · Ch. 4–5 Free Ad-Unlock!)
| Chapter | Region | Access | Sanctum Dungeon & Guardian Boss |
| :-: | :--- | :-: | :--- |
| **Ch. 1** | 🌿 Emerald Meadow & Dawnwood (`翡翠平原 · 晨木镇`) | **OPEN FREE** | Ancient Root Sanctum · **Verdant Stag (`苍木灵鹿`)** |
| **Ch. 2** | 🐚 Coral Bay & Tidebreak Harbor (`珊瑚海湾 · 潮汐港`) | **OPEN FREE** | Sunken Pearl Grotto · **Tidecrest (`沧澜海龙`)** |
| **Ch. 3** | ☀️ Sunfire Desert & Oasis Citadel (`烈日沙城 · 绿洲古城`) | **OPEN FREE** | Solar Pyramid Vault · **Heliowing (`烈阳金凤`)** |
| **Ch. 4** | ❄️ Frostpeak Citadel & Glacier (`雪峰古堡 · 冰晶雪原`) | **🎬 2 Rewarded Ads** | Glacial Crown Keep · **Glacieron (`寒穹冰龙`)** |
| **Ch. 5** | ✨ Starlight Sky Sanctum (`星界神殿 · 苍穹浮岛`) | **🎬 3 Rewarded Ads** | Celestial Throne Sanctum · **Celestiar (`星界圣龙`)** |

## 🎬 Solo-Dev IAA Monetization Funnel (Zero Cash Paywalls)
- **Chapters 4 & 5 Border Seals**: Players explore Chapters 1–3 seamlessly, then watch 2 or 3 Rewarded Video Ads (`wx.createRewardedVideoAd`) to permanently unlock Chapters 4 & 5—or watch 4 ads for the **Grand Explorer All-Chapter Bundle** (Ch.4 + Ch.5 + Frost Valkyrie + Aether Wings + 5 Astral Orbs + 300 Gold). Progress is saved persistently (`0/2 → 1/2 → 2/2`).
- **Heroes & Fancy Tools**: Unlockable via in-game Gold or 1–3 Rewarded Video Ads (e.g., *Aether Wings* unlocks instant World Map Fast Travel).
- **Repeatable Ad Supply Drop**: Watch 1 ad anytime for `+3 Prism Orbs + 3 Treats + 100 Gold`.
- **Gentle Interstitial Ad**: Cooldown-capped (`120s`) hook (`wx.createInterstitialAd`) on dungeon exit.
- **WeChat Organic Sharing**: Calls `wx.showShareMenu` for viral friend/group sharing.

## ✅ Automated Testing & Coverage
- **Unit & Integration Suite (Node.js V8 Coverage)**: `node --test --experimental-test-coverage tests/unit.test.js`
  - Tests Web & WeChat `wx` IAA APIs (including singleton `offClose` non-stacking & `120s` interstitial cooldown), strict 100% CN/EN key & `{var}` placeholder parity, `[1,2,3]` AND `[1,2,3,5]` border gate seals, and all 5 fountain respawn coordinates.
- **Real Chromium Playwright E2E + CDP V8 Coverage**: `python3 tests/e2e_coverage.py`
  - Tests both Desktop (`1100×720`) and WeChat Mobile Portrait (`390×844`) viewports, full IAA ad-unlock funnel, zero cash paywalls, and real V8 line coverage across all 9 JS modules.
- **Single-File Preview Bundle**: `python3 scripts/build_singlefile.py` → [`dist/aetheria_chronicles.html`](dist/aetheria_chronicles.html) (~220 KB, <6% of WeChat's 4MB initial package cap).
