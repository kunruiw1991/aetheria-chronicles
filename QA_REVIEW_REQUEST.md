# Cross-Model QA Review Request — Aetheria Chronicles v1 (Personal WeChat IAA)

Please perform an independent full-repository QA & playtest audit of `kunruiw1991/aetheria-chronicles`.

## Scope (Full Repository)
- Game shell & UI: `index.html`, `css/style.css`, `js/ui.js`, `js/game.js`, `js/art.js`
- Core RPG & World: `js/data.js`, `js/world.js`, `js/battle.js`, `js/audio.js`
- WeChat Personal IAA & Bilingual: `js/platform.js`, `js/i18n.js`
- Test Suites: `tests/unit.test.js`, `tests/e2e_coverage.py`
- Single-File Bundle: `dist/aetheria_chronicles.html`

## Automated Verification Commands
```bash
node --test --experimental-test-coverage tests/unit.test.js
python3 tests/e2e_coverage.py
```

## Audit Focus
1. **Gameplay, Controls & Mobile `390×844` UX** (see `.qa/claude_prompt.md`):
   - Try to bypass Ch.4/Ch.5 ad-locks or Aether Wings Fast Travel gate
   - Check battle race conditions, faint respawns in all 5 chapters, mobile HUD/dialog ergonomics, and balance
2. **WeChat Personal Mini Game IAA Compliance & Coverage** (see `.qa/gpt_prompt.md`):
   - Confirm zero cash paywall symbols/code (`¥`, `$`, `MidasPay`)
   - Audit `js/platform.js` against official WeChat Mini Game API specs
   - Audit whether the 100% V8 line coverage has branch/function blind spots & list native WeChat DevTools porting blockers
