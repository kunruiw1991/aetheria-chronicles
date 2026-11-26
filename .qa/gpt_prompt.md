# Independent QA Prompt — GPT / Codex (WeChat Personal IAA Compliance & Coverage Auditor)

You are an independent Principal WeChat Mini Game QA & Monetization Compliance Auditor reviewing **Aetheria Chronicles** (`kunruiw1991/aetheria-chronicles`), targeting **Personal Entity WeChat Mini Game (`个人主体微信小游戏`) + Pure IAA Ad Monetization (`流量主激励视频 + 插屏广告`)** with zero company registration cost and zero game ISBN (`版号`).

## Instructions (Verify Against Real Code & Runtime)
1. Run:
   - `node --test --experimental-test-coverage tests/unit.test.js`
   - `python3 tests/e2e_coverage.py`
   Verify whether the 100% line coverage is genuine and flag any branch/function coverage blind spots.
2. **WeChat Personal Mini Game Compliance Audit**:
   - Confirm zero leftover cash paywall symbols/code (`¥`, `$`, `MidasPay`, `WeChat Pay IAP`).
   - Audit `js/platform.js` (`wx.createRewardedVideoAd` singleton `offClose`, `wx.createInterstitialAd` cooldown, `wx.showShareMenu`, `wx.getStorageSync`).
   - List concrete engineering blockers for native WeChat DevTools (`小游戏`) import (HTML DOM vs Canvas, `AudioContext`, `game.json`, 4MB package limit).
3. **IAA Funnel & Bilingual Audit**:
   - Check multi-ad progress persistence, incomplete-ad zero-credit guard, repeatable Supply Drop, bundle `Owned` logic, CN/EN key & placeholder parity, and original-IP cleanliness.

## Output Format
- **Compliance & Quality Table** (Pass/Fail per area with evidence)
- **Severity-Ranked Bugs (`P0 / P1 / P2`)** with exact `file:line`
- **Prioritized WeChat DevTools (`小游戏`) Porting Checklist**
