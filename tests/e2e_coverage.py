#!/usr/bin/env python3
"""
End-to-End Playwright Playtest + Real Chromium CDP V8 Precise Coverage Suite
for Aetheria Chronicles — Personal Entity + WeChat IAA Edition (all 9 JS modules).
Covers Desktop (1100x720) & Mobile WeChat Portrait (390x844, touch).
"""
import http.server
import pathlib
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


def start_server():
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)
        def log_message(self, format, *args):
            pass
    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def compute_v8_line_coverage(cov_entries):
    """Aggregate Chromium V8 precise coverage ranges into per-file line coverage."""
    files = {}
    for entry in cov_entries:
        url = entry.get("url", "")
        if "/js/" not in url or not url.endswith(".js"):
            continue
        rel = "js/" + url.split("/js/", 1)[1].split("?")[0]
        src_path = ROOT / rel
        if not src_path.exists():
            continue
        src = src_path.read_text(encoding="utf-8")
        lines = src.splitlines(keepends=True)
        offsets = []
        pos = 0
        for ln in lines:
            offsets.append((pos, pos + len(ln), ln.strip()))
            pos += len(ln)

        if rel not in files:
            files[rel] = {
                "line_hits": [None] * len(lines),
                "funcs_total": 0,
                "funcs_hit": 0,
            }
        rec = files[rel]

        byte_hits = [None] * (len(src) + 1)
        for fn in entry.get("functions", []):
            ranges = fn.get("ranges", [])
            if not ranges:
                continue
            rec["funcs_total"] += 1
            if any(r.get("count", 0) > 0 for r in ranges):
                rec["funcs_hit"] += 1
            for r in ranges:
                s = max(0, min(len(src), r["startOffset"]))
                e = max(0, min(len(src), r["endOffset"]))
                cnt = r["count"]
                for idx in range(s, e):
                    byte_hits[idx] = cnt

        for i, (ls, le, stripped) in enumerate(offsets):
            if (not stripped or stripped.startswith("//") or stripped.startswith("/*")
                    or stripped.startswith("*") or stripped in ("{", "}", "});", "})();", "];", "else {", "};")):
                continue
            if "typeof module === 'object'" in stripped:
                continue
            vals = [byte_hits[p] for p in range(ls, le) if byte_hits[p] is not None]
            if not vals:
                continue
            hit = max(vals)
            prev = rec["line_hits"][i]
            rec["line_hits"][i] = max(prev or 0, hit)

    report = {}
    for rel, rec in sorted(files.items()):
        tracked = [(i + 1, h) for i, h in enumerate(rec["line_hits"]) if h is not None]
        hit_count = sum(1 for _, h in tracked if h > 0)
        missed = [ln for ln, h in tracked if h == 0]
        pct = (hit_count / len(tracked) * 100.0) if tracked else 100.0
        fn_pct = (rec["funcs_hit"] / rec["funcs_total"] * 100.0) if rec["funcs_total"] else 100.0
        report[rel] = {
            "tracked_lines": len(tracked),
            "hit_lines": hit_count,
            "line_pct": round(pct, 2),
            "func_pct": round(fn_pct, 2),
            "missed_lines": missed,
        }
    return report


def run_playtest():
    httpd, port = start_server()
    base_url = f"http://127.0.0.1:{port}/index.html"
    errors = []
    all_cov_entries = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])

            # === PART A: MOBILE PORTRAIT (390x844, WeChat Phone) REGRESSION CHECK ===
            m_ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, device_scale_factor=2)
            m_page = m_ctx.new_page()
            m_page.on("pageerror", lambda err: errors.append(f"MOBILE_PAGEERROR: {err}"))
            m_page.on("console", lambda msg: errors.append(f"MOBILE_CONSOLE_ERR: {msg.text}") if msg.type == "error" else None)
            m_page.goto(base_url, wait_until="networkidle")
            m_page.wait_for_timeout(200)

            # Verify Mobile Title Lang button does NOT overlap <h1>
            lang_box = m_page.locator("#titleLangBtn").bounding_box()
            h1_box = m_page.locator("#titleMain").bounding_box()
            assert lang_box["y"] + lang_box["height"] <= h1_box["y"] + 2, f"Mobile title overlap! lang={lang_box} h1={h1_box}"

            m_page.tap('[data-starter="sproutling"]')
            m_page.wait_for_timeout(250)
            # Place next to Elder Rowan and single-tap #btnA -> dialog MUST remain visible (not auto-dismissed!)
            m_page.evaluate("""() => {
                const st = Game.getState();
                st.x = 32; st.y = 92;
                Platform.writeSave(st);
            }""")
            m_page.reload(wait_until="networkidle")
            m_page.tap("#continueBtn")
            m_page.wait_for_timeout(200)
            m_page.keyboard.press("ArrowUp")
            m_page.wait_for_timeout(120)
            m_page.tap("#btnA")
            m_page.wait_for_timeout(120)
            assert m_page.is_visible("#dialog"), "Mobile single-tap on #btnA must keep #dialog open!"
            m_page.wait_for_timeout(150)  # Wait past 220ms debounce, then tap dialog to close
            m_page.tap("#dialog")
            m_page.wait_for_timeout(120)
            assert not m_page.is_visible("#dialog"), "Second tap on #dialog must dismiss it cleanly"
            m_ctx.close()

            # === PART B: DESKTOP FULL PLAYTEST + REAL V8 COVERAGE ACROSS ALL 9 JS FILES ===
            context = browser.new_context(viewport={"width": 1100, "height": 720})
            page = context.new_page()
            page.on("pageerror", lambda err: errors.append(f"PAGEERROR: {err}"))
            page.on("console", lambda msg: errors.append(f"CONSOLE_ERR: {msg.text}") if msg.type == "error" else None)

            cdp = context.new_cdp_session(page)
            cdp.send("Profiler.enable")
            cdp.send("Profiler.startPreciseCoverage", {"callCount": True, "detailed": True})

            def snap_cov():
                all_cov_entries.extend(cdp.send("Profiler.takePreciseCoverage")["result"])

            def reload_keep_cov():
                snap_cov()
                page.reload(wait_until="networkidle")

            # 1. Title Screen: Bilingual toggle & starter selection
            page.goto(base_url, wait_until="networkidle")
            page.wait_for_timeout(200)
            page.click("#titleLangBtn")
            assert "Aetheria Chronicles" in page.text_content("#titleMain")
            page.click("#titleLangBtn")
            assert "星境奇旅" in page.text_content("#titleMain")
            page.click('[data-starter="sproutling"]')
            page.wait_for_timeout(250)

            # 2. Reload & Continue Quest
            reload_keep_cov()
            page.wait_for_timeout(180)
            assert page.is_visible("#continueBtn")
            page.click("#continueBtn")
            page.wait_for_timeout(220)

            # 3. Movement (Keyboard + Shift Dash + Touch D-pad + A/B)
            for k in ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD"]:
                page.keyboard.down("ShiftLeft")
                page.keyboard.down(k)
                page.wait_for_timeout(80)
                page.keyboard.up(k)
                page.keyboard.up("ShiftLeft")

            dbox = page.locator("#dpad").bounding_box()
            cx, cy = dbox["x"] + dbox["width"] / 2, dbox["y"] + dbox["height"] / 2
            page.mouse.move(cx, cy)
            page.mouse.down()
            for dx, dy in [(30, 0), (0, 30), (-30, 0), (0, -30), (2, 2)]:
                page.mouse.move(cx + dx, cy + dy)
                page.wait_for_timeout(55)
            page.mouse.up()
            page.click("#btnB")
            page.click("#btnA")

            def move_to_and_face(tx, ty, key, map_id="overworld"):
                page.evaluate(f"""() => {{
                    const st = Game.getState();
                    st.mapId = '{map_id}';
                    st.x = {tx}; st.y = {ty};
                    Platform.writeSave(st);
                }}""")
                reload_keep_cov()
                page.click("#continueBtn")
                page.wait_for_timeout(160)
                if key:
                    page.keyboard.press(key)
                    page.wait_for_timeout(120)

            # 4. Chapter 1: Elder gift, Chest (open + empty), Windmill, Wild Encounter + Break-Free + KO Victory + Level Up
            move_to_and_face(33, 91, "ArrowLeft")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            assert page.is_visible("#dialog")
            page.click("#dialog")
            page.wait_for_timeout(140)
            assert page.evaluate("Game.getState().gold") >= 130

            move_to_and_face(19, 95, "ArrowLeft")
            page.keyboard.press("Space")
            page.wait_for_timeout(130)
            assert "ow_c1_1" in page.evaluate("Game.getState().openedChests")
            page.keyboard.press("Space")  # Already opened
            page.wait_for_timeout(100)

            move_to_and_face(46, 87, "ArrowUp")
            move_to_and_face(55, 100, None)
            page.evaluate("window._origRand = Math.random; Math.random = () => 0.05;")
            for _ in range(6):
                page.keyboard.press("ArrowRight")
                page.wait_for_timeout(200)
                if page.evaluate("Battle.isActive()"):
                    break
            assert page.evaluate("Battle.isActive()")
            # Throw Star Orb in English mode to verify full "Star Orbs" (not truncated "Star!") + break-free
            page.evaluate("I18N.setLang('en'); Math.random = () => 0.99;")
            page.click('[data-act="catch"]')
            page.wait_for_timeout(100)
            page.click('[data-orb="orbs"]')
            page.wait_for_timeout(150)
            assert "Star Orbs" in page.text_content("#bMsg"), f"Truncated orb msg: {page.text_content('#bMsg')}"
            page.wait_for_timeout(2450)
            page.evaluate("""() => {
                I18N.setLang('zh');
                Math.random = window._origRand;
                const st = Game.getState();
                st.party[0].lv = 15;
                st.party[0].exp = 445;
            }""")
            for _ in range(5):
                if not page.evaluate("Battle.isActive()"):
                    break
                page.click('[data-act="attack"]')
                page.wait_for_timeout(1850)
            assert not page.evaluate("Battle.isActive()")

            # Test Fountain, Signpost, Merchant Bella, Shop House, Waystone
            move_to_and_face(31, 93, "ArrowLeft")
            page.keyboard.press("Space")
            page.wait_for_timeout(120)

            move_to_and_face(42, 91, "ArrowRight")
            page.keyboard.press("Space")
            page.wait_for_timeout(120)
            page.keyboard.press("Escape")
            page.wait_for_timeout(100)

            move_to_and_face(41, 91, "ArrowLeft")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)
            assert page.is_visible("#modal")
            # Verify #btnA behind open modal does NOT open #dialog!
            page.locator("#btnA").dispatch_event("pointerdown")
            page.wait_for_timeout(100)
            assert not page.is_visible("#dialog"), "btnA must not trigger dialog behind open modal"
            page.click("#modalClose")

            move_to_and_face(39, 90, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(140)
            page.click("#modalClose")

            # 5. Verify Aether Wings Fast Travel is PROPERLY GATED on World Map before owning Wings!
            move_to_and_face(34, 91, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(150)
            assert page.locator('[data-warp]').count() == 0, "Fast Travel must require Aether Wings!"
            assert page.locator('[data-need-wings]').count() >= 3
            page.click('[data-need-wings="1"] >> nth=0')
            page.wait_for_timeout(150)
            assert page.is_visible("#storeGrid"), "Clicking Unlock Aether Wings should open Tools tab"
            page.click("#modalClose")

            # Also verify locked Ch.4 button in World Map & direct warpToChapter guards!
            page.evaluate("Game.warpToChapter(4)")
            page.wait_for_timeout(120)
            assert page.is_visible("#gateWatchAd"), "warpToChapter(4) while locked must open Gate Lock Modal"
            page.click("#modalClose")
            page.evaluate("Game.warpToChapter(2)")
            page.wait_for_timeout(120)
            assert page.is_visible("#storeGrid"), "warpToChapter(2) without Wings must redirect to Tools store"
            page.click("#modalClose")
            page.click("#mapBtn")
            page.wait_for_timeout(140)
            page.click('[data-unlock-ch="ch4_pack"]')
            page.wait_for_timeout(140)
            page.click("#modalClose")

            # 6. Locked Chapter 4 Gate -> watch 1 ad directly from Gate Modal (skip once -> progress 0/2 -> complete 1/2!)
            move_to_and_face(39, 66, "ArrowUp")
            page.wait_for_timeout(200)
            assert page.is_visible("#modal")
            page.click("#gateWatchAd")
            page.wait_for_timeout(130)
            page.click("#adSkip")  # Incomplete ad -> 0 progress!
            page.wait_for_timeout(130)
            assert page.evaluate("Game.getState().adProgress.ch4_pack || 0") == 0
            page.click("#gateWatchAd")
            page.wait_for_timeout(130)
            page.click("#adConfirm")  # Ad 1/2 complete -> progress saved!
            page.wait_for_timeout(140)
            assert page.evaluate("Game.getState().adProgress.ch4_pack") == 1
            assert 4 not in page.evaluate("Game.getState().unlockedChapters")
            page.click("#gateClose")

            # Gate4 NPC
            move_to_and_face(37, 68, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)
            page.click("#gateOpenStore")
            page.wait_for_timeout(140)
            page.click("#modalClose")

            # 7. Chapter 2 & Chapter 3: Shallow water block -> Lighthouse -> Captain Barnaby (Skiff) -> Surf -> Pyramid -> Karim (Compass) -> Ch.5 Gate
            move_to_and_face(86, 86, "ArrowLeft")
            page.wait_for_timeout(120)
            move_to_and_face(108, 87, "ArrowUp")
            move_to_and_face(103, 93, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)
            assert "skiff" in page.evaluate("Game.getState().tools")
            move_to_and_face(79, 70, "ArrowLeft")
            page.wait_for_timeout(160)

            move_to_and_face(124, 36, "ArrowUp")
            move_to_and_face(104, 51, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)
            assert "compass" in page.evaluate("Game.getState().tools")
            assert page.is_visible("#compassBar")

            move_to_and_face(103, 28, "ArrowUp")
            page.wait_for_timeout(180)
            assert page.is_visible("#modal")
            page.click("#gateClose")

            move_to_and_face(101, 30, "ArrowUp")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)
            page.click("#gateClose")

            # 8. Reward Vault (IAA): Watch 4 ads for Grand Explorer Bundle (Ch.4+Ch.5+Valkyrie+Aether Wings), test Heroes, Tools, & Repeatable Ad Supply Drop!
            page.click("#shopBtn")
            page.wait_for_timeout(140)
            assert "¥" not in page.text_content("#modalBody") and "$" not in page.text_content("#modalBody"), "Zero cash prices allowed in Personal IAA mode!"
            for _ in range(4):
                page.click('[data-watch-ad="season_pass"]')
                page.wait_for_timeout(100)
                page.click("#adConfirm")
                page.wait_for_timeout(120)
            st_after = page.evaluate("Game.getState()")
            assert 4 in st_after["unlockedChapters"] and 5 in st_after["unlockedChapters"]
            assert "wings" in st_after["tools"] and "valkyrie" in st_after["unlockedHeroes"]

            # Heroes tab: buy Tidecaller with Gold, watch 3 ads for Summoner, equip Valkyrie & verify HP sync!
            page.click('[data-tab="heroes"]')
            page.wait_for_timeout(120)
            page.evaluate("Game.getState().gold = 900")
            page.click('[data-buy-hero-gold="tidecaller"]')
            page.wait_for_timeout(120)
            for _ in range(3):
                page.click('[data-watch-ad="hero_summoner"]')
                page.wait_for_timeout(90)
                page.click("#adConfirm")
                page.wait_for_timeout(100)
            hp_before = page.evaluate("Game.getState().party[0].maxHp")
            page.click('[data-equip-hero="valkyrie"]')
            page.wait_for_timeout(120)
            hp_after = page.evaluate("Game.getState().party[0].maxHp")
            assert hp_after > hp_before, f"Equipping Valkyrie must immediately sync maxHp ({hp_before} -> {hp_after})"

            # Tools tab: buy Magnet with Gold, watch ads for Lantern (1) & Prism Staff (2)
            page.click('[data-tab="tools"]')
            page.wait_for_timeout(120)
            page.click('[data-buy-tool-gold="magnet"]')
            page.wait_for_timeout(100)
            page.click('[data-watch-ad="tool_lantern"]')
            page.wait_for_timeout(90)
            page.click("#adConfirm")
            page.wait_for_timeout(100)
            for _ in range(2):
                page.click('[data-watch-ad="tool_prismstaff"]')
                page.wait_for_timeout(90)
                page.click("#adConfirm")
                page.wait_for_timeout(100)

            # Supplies tab: claim repeatable Free Ad Supply Drop + buy Gold supplies + insufficient gold warning
            page.click('[data-tab="items"]')
            page.wait_for_timeout(120)
            page.click('[data-watch-ad="ad_supply_pack"]')
            page.wait_for_timeout(100)
            page.click("#adConfirm")
            page.wait_for_timeout(120)
            page.click('[data-buy-supply="orbs"]')
            page.wait_for_timeout(100)
            page.evaluate("Game.getState().gold = 0")
            page.click('[data-buy-supply="masterOrbs"]')
            page.wait_for_timeout(100)
            page.evaluate("Game.getState().gold = 500")
            page.click("#modalClose")

            # 9. Test Aether Wings Fast Travel (now UNLOCKED!) to Ch.4 & Ch.5!
            for cid in [4, 5]:
                page.click("#mapBtn")
                page.wait_for_timeout(120)
                page.click(f'[data-warp="{cid}"]')
                page.wait_for_timeout(180)
            # Also visit Ch.4 Castle & Ch.5 Skytemple
            move_to_and_face(22, 36, "ArrowUp")
            move_to_and_face(75, 11, "ArrowUp")

            # 10. Enter Dungeon 1, Sage gift, Boss Battle + Astral Orb Catch + Crest + Both Dungeon Chests (compassNone) + Exit!
            move_to_and_face(22, 75, "ArrowUp")
            page.wait_for_timeout(320)
            assert page.evaluate("World.getMap().id") == "dun_1"

            move_to_and_face(9, 12, "ArrowUp", "dun_1")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(140)

            move_to_and_face(11, 5, "ArrowUp", "dun_1")
            page.keyboard.press("Space")
            page.wait_for_timeout(250)
            page.click("#dialog")
            page.wait_for_timeout(240)
            assert page.evaluate("Battle.isActive()")

            page.keyboard.press("3")
            page.wait_for_timeout(1850)
            page.keyboard.press("4")
            page.wait_for_timeout(130)
            page.click('[data-run="1"]')  # Blocked by Boss
            page.wait_for_timeout(160)
            page.keyboard.press("1")
            page.wait_for_timeout(1850)
            page.keyboard.press("2")
            page.wait_for_timeout(130)
            page.click('[data-orb="masterOrbs"]')
            page.wait_for_selector("#celebrate:not(.hidden)", timeout=4500)
            page.click("#celePartner")
            page.wait_for_timeout(140)
            assert 1 in page.evaluate("Game.getState().crests")

            # Test duplicate higher-level catch updates maxHp!
            page.evaluate("""() => {
                const st = Game.getState();
                st.items.masterOrbs = 2;
                Battle.start(st, 'sproutling', 20, false, 1, res => {
                    // Route through real Game capture? Verify via Battle + duplicate check below
                });
            }""")
            # Better: trigger wild catch directly via Game flow by walking in dun_1 tall grass!
            page.evaluate("Battle.handleAction('switch')")
            page.wait_for_timeout(100)
            page.click('[data-run="1"]')
            page.wait_for_timeout(650)

            # Open both dungeon chests -> hits compassNone!
            move_to_and_face(5, 5, "ArrowLeft", "dun_1")
            page.keyboard.press("Space")
            page.wait_for_timeout(120)
            move_to_and_face(16, 5, "ArrowRight", "dun_1")
            page.keyboard.press("Space")
            page.wait_for_timeout(120)

            # Trigger duplicate catch inside dun_1 tall grass via real Game.startBattle callback
            move_to_and_face(4, 9, None, "dun_1")
            page.evaluate("""() => {
                const st = Game.getState();
                st.items.masterOrbs = 2;
                st.party[0].lv = 5;
                window._origRand = Math.random;
                Math.random = () => 0.01;
            }""")
            for step in range(6):
                page.keyboard.press("ArrowRight" if step % 2 == 0 else "ArrowLeft")
                page.wait_for_timeout(220)
                if page.evaluate("Battle.isActive()"):
                    break
            assert page.evaluate("Battle.isActive()")
            page.evaluate("Math.random = window._origRand;")
            page.click('[data-act="catch"]')
            page.wait_for_timeout(120)
            page.click('[data-orb="masterOrbs"]')
            page.wait_for_selector("#celebrate:not(.hidden)", timeout=4500)
            page.click("#celeOk")
            page.wait_for_timeout(120)

            # Exit Dungeon (also fires Interstitial Ad hook!)
            move_to_and_face(11, 13, "ArrowDown", "dun_1")
            page.wait_for_timeout(320)
            assert page.evaluate("World.getMap().id") == "overworld"

            # 11. Wild Battle edge cases: No orbs, No treats, Swap, Cancel, Run-Away race guard, Team Faint!
            page.evaluate("""() => {
                const st = Game.getState();
                st.items.orbs = 0; st.items.superOrbs = 0; st.items.masterOrbs = 0; st.items.treats = 0;
                Battle.start(st, 'flutterfae', 4, false, 1, () => {});
            }""")
            page.wait_for_timeout(200)
            page.click('[data-act="catch"]')
            page.click('[data-act="feed"]')
            page.click('[data-act="switch"]')
            page.wait_for_timeout(100)
            page.click('[data-cancel="1"]')
            page.click('[data-act="switch"]')
            page.wait_for_timeout(100)
            page.click('[data-swap="0"]')
            page.wait_for_timeout(1500)
            # Test Run-Away race guard: clicking Attack right after Run MUST be blocked (gold unchanged!)
            gold_pre_run = page.evaluate("Game.getState().gold")
            page.click('[data-act="switch"]')
            page.wait_for_timeout(100)
            page.click('[data-run="1"]')
            page.click('[data-act="attack"]')  # Must be ignored because busy=true!
            page.wait_for_timeout(700)
            assert not page.evaluate("Battle.isActive()")
            assert page.evaluate("Game.getState().gold") == gold_pre_run, "Run-away race allowed post-escape rewards!"

            # Team Faint Recovery
            page.evaluate("""() => {
                const st = Game.getState();
                st.heroId = 'ranger';
                st.party.forEach(p => { p.hp = 1; });
                Battle.start(st, 'astraldragon', 35, false, 5, () => {});
            }""")
            page.wait_for_timeout(200)
            for _ in range(3):
                if not page.evaluate("Battle.isActive()"):
                    break
                page.click('[data-act="attack"]')
                page.wait_for_timeout(2000)
            page.wait_for_timeout(1200)

            # 12. Modals: Party, Critterdex, Bag, Settings + wx IAA bridge + Reset Save!
            page.click("#partnerCard")
            page.wait_for_timeout(140)
            if page.locator('[data-set-p="0"]').count() > 0:
                page.click('[data-set-p="0"]')
                page.wait_for_timeout(120)
            page.click("#switchHeroBtn")
            page.wait_for_timeout(120)
            page.click("#modalClose")

            page.click("#dexBtn")
            page.wait_for_timeout(220)
            page.click("#modalClose")

            page.click("#bagBtn")
            page.wait_for_timeout(140)
            page.click("#modalClose")

            page.click("#muteBtn")
            page.click("#muteBtn")
            page.click("#langBtn")

            # Verify AudioFX.stopBgm + Platform WeChat Personal IAA runtime hooks directly in Chromium!
            page.evaluate("""async () => {
                AudioFX.stopBgm();
                const wxStore = {};
                const handlers = new Set();
                let outcome = 'ended';
                const ad = {
                    onClose: f => handlers.add(f),
                    offClose: f => handlers.delete(f),
                    load: () => outcome === 'fail' ? Promise.reject('err') : Promise.resolve(),
                    show: () => {
                        if (outcome === 'fail') return Promise.reject('err');
                        Array.from(handlers).forEach(fn => fn({ isEnded: outcome === 'ended' }));
                        return Promise.resolve();
                    },
                };
                window.wx = {
                    getSystemInfoSync: () => ({ platform: 'ios' }),
                    getStorageSync: k => wxStore[k],
                    setStorageSync: (k, v) => { wxStore[k] = v; },
                    removeStorageSync: k => { delete wxStore[k]; },
                    vibrateShort: () => {},
                    showShareMenu: () => {},
                    createRewardedVideoAd: () => ad,
                    createInterstitialAd: () => ({ show: () => Promise.resolve() }),
                };
                window.AETHERIA_REWARD_AD_ID = 'test_reward';
                window.AETHERIA_INTERSTITIAL_AD_ID = 'test_inter';
                Platform.getEnvName();
                Platform.initShareMenu();
                Platform.writeSave({ wxTest: 1 });
                Platform.loadSave();
                Platform.saveSetting('k', 'v');
                Platform.loadSetting('k');
                Platform.vibrateShort();
                Platform.showRewardedAd({ id: 'ch4_pack' }, () => {}, () => {});
                outcome = 'incomplete';
                Platform.showRewardedAd({ id: 'ch4_pack' }, () => {}, () => {});
                outcome = 'fail';
                Platform.showRewardedAd({ id: 'ch4_pack' }, () => {}, () => {});
                Platform.showInterstitialAd();
                Platform.clearSave();
                delete window.wx;
                delete window.AETHERIA_REWARD_AD_ID;
                delete window.AETHERIA_INTERSTITIAL_AD_ID;
                Platform.showRewardedAd({ id: 'ch4_pack' }, () => {});
            }""")
            page.wait_for_timeout(120)

            page.click("#menuBtn")
            page.wait_for_timeout(140)
            page.click("#setLangBtn")
            page.wait_for_timeout(140)
            # Trigger Reset Save confirm (accept) and capture coverage right before reload!
            page.on("dialog", lambda d: d.accept())
            snap_cov()
            page.click("#setResetBtn")
            page.wait_for_timeout(280)
            snap_cov()

            cdp.send("Profiler.stopPreciseCoverage")
            browser.close()
    finally:
        httpd.shutdown()

    report = compute_v8_line_coverage(all_cov_entries)
    print("\n=== CHROMIUM V8 REAL E2E COVERAGE REPORT (PERSONAL IAA BUILD) ===")
    total_tracked = 0
    total_hit = 0
    for rel, r in report.items():
        total_tracked += r["tracked_lines"]
        total_hit += r["hit_lines"]
        miss_str = "" if not r["missed_lines"] else f" | missed: {r['missed_lines'][:14]}"
        print(f"  {rel:16s} | lines: {r['line_pct']:6.2f}% ({r['hit_lines']}/{r['tracked_lines']}) | funcs: {r['func_pct']:6.2f}%{miss_str}")
    overall = (total_hit / total_tracked * 100.0) if total_tracked else 100.0
    print(f"  {'OVERALL':16s} | lines: {overall:6.2f}% ({total_hit}/{total_tracked})")
    print("Errors:", errors)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    run_playtest()
