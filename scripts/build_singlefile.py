#!/usr/bin/env python3
"""Bundle Aetheria Chronicles into a single self-contained HTML file for instant preview."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS_ORDER = [
    "config/ads.js",
    "js/platform.js",
    "js/i18n.js",
    "js/data.js",
    "js/audio.js",
    "js/world.js",
    "js/core.js",
    "js/art.js",
    "js/battle.js",
    "js/ui.js",
    "js/game.js",
]

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "css/style.css").read_text(encoding="utf-8")
js_bundle = "\n\n".join(
    f"/* === {path} === */\n" + (ROOT / path).read_text(encoding="utf-8")
    for path in JS_ORDER
)

html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}\n</style>")
script_block = "\n".join(f'<script src="{p}"></script>' for p in JS_ORDER)
assert script_block in html, "Script tags not found in index.html"
html = html.replace(script_block, f"<script>\n{js_bundle}\n</script>")

out = ROOT / "dist" / "aetheria_chronicles.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"Built {out} ({len(html):,} bytes)")
