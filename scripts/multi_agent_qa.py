#!/usr/bin/env python3
"""
multi_agent_qa.py — Real Cross-Model Independent QA Runner (Anthropic Claude + OpenAI GPT).

Runs locally (when ANTHROPIC_API_KEY / OPENAI_API_KEY are set) or inside GitHub Actions.
Fail-closed honesty policy: NEVER fakes or substitutes another model if an API key is missing.
"""
import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

KEY_FILES = [
    "README.md",
    "index.html",
    "css/style.css",
    "js/platform.js",
    "js/i18n.js",
    "js/data.js",
    "js/world.js",
    "js/battle.js",
    "js/ui.js",
    "js/game.js",
    "tests/unit.test.js",
    "tests/e2e_coverage.py",
]


def build_context_bundle(test_log: str, max_chars_per_file: int = 14000) -> str:
    parts = ["# Automated Test & Coverage Output\n```\n" + (test_log or "(none)")[:12000] + "\n```\n"]
    for rel in KEY_FILES:
        p = ROOT / rel
        if not p.exists():
            continue
        txt = p.read_text(encoding="utf-8", errors="replace")
        if len(txt) > max_chars_per_file:
            txt = txt[:max_chars_per_file] + f"\n... [truncated {len(txt) - max_chars_per_file} chars]"
        parts.append(f"## FILE: {rel}\n```\n{txt}\n```\n")
    return "\n".join(parts)


CLAUDE_PROMPT = """You are an independent QA Gameplay & Adversarial Test Engineer reviewing Aetheria Chronicles
(a 5-chapter WeChat Personal Mini Game IAA RPG: Ch.1-3 free, Ch.4-5 Rewarded Video Ad unlocks, zero cash IAP).

Audit the codebase and test results brutally honestly:
1. Find any real P0/P1/P2 bugs: paywall/ad-gate bypasses, battle race conditions, softlocks, mobile 390x844 UX traps, save corruption, or balance issues.
2. Audit whether the 100% test coverage claims in tests/unit.test.js and tests/e2e_coverage.py are genuine or have blind spots.
3. Return a crisp Markdown report with:
   - Verdict: PASS / CONDITIONAL FAIL / FAIL
   - Severity-ranked Bugs (P0 / P1 / P2) with exact file:line citations
   - Top 5 gameplay & UX polish upgrades."""

GPT_PROMPT = """You are an independent Principal WeChat Mini Game QA & Monetization Compliance Auditor reviewing Aetheria Chronicles
(Personal Entity WeChat Mini Game + pure IAA Rewarded Video / Interstitial Ads, zero company registration, zero game ISBN).

Audit the codebase and test results strictly against WeChat Personal Mini Game compliance & engineering quality:
1. Check for ANY forbidden cash paywall symbols/code (¥, $, MidasPay, WeChat Pay IAP) or ad-policy violations (listener leaks, spammy interstitials).
2. Audit js/platform.js, bilingual CN/EN parity, original-IP cleanliness, and native WeChat Mini Game (小游戏) porting blockers (DOM vs Canvas, AudioContext, game.json, 4MB limit).
3. Audit tests/unit.test.js and tests/e2e_coverage.py for branch/function coverage blind spots.
4. Return a crisp Markdown report with:
   - Compliance & Quality Table (Pass/Fail per area)
   - Severity-ranked Bugs & Bypasses (P0 / P1 / P2) with exact file:line citations
   - Prioritized WeChat DevTools Porting Checklist."""


def call_anthropic(api_key: str, model: str, system_prompt: str, user_content: str) -> str:
    payload = {
        "model": model,
        "max_tokens": 3000,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_content}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    blocks = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(blocks).strip()


def call_openai(api_key: str, model: str, system_prompt: str, user_content: str) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--claude-model", default=os.environ.get("CLAUDE_MODEL", "claude-opus-4-1"))
    ap.add_argument("--gpt-model", default=os.environ.get("GPT_MODEL", "gpt-5"))
    ap.add_argument("--test-log", default="")
    ap.add_argument("--out-dir", default="qa-reports")
    args = ap.parse_args()

    out_dir = ROOT / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    test_log = pathlib.Path(args.test_log).read_text(encoding="utf-8", errors="replace") if args.test_log and pathlib.Path(args.test_log).exists() else ""
    bundle = build_context_bundle(test_log)

    summary_sections = ["# 🤖 Cross-Model Independent QA Reports\n"]
    any_ran = False
    had_error = False

    # 1. Real Anthropic Claude
    anth_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if anth_key:
        any_ran = True
        print(f"Calling Anthropic Claude ({args.claude_model})...")
        try:
            report = call_anthropic(anth_key, args.claude_model, CLAUDE_PROMPT, bundle)
            (out_dir / "qa_report_claude.md").write_text(report, encoding="utf-8")
            summary_sections.append(f"## 🟣 Anthropic Claude (`{args.claude_model}`)\n\n{report}\n")
            print("Claude QA report generated successfully.")
        except Exception as e:
            had_error = True
            msg = f"ERROR calling Anthropic Claude ({args.claude_model}): {e}"
            print(msg, file=sys.stderr)
            summary_sections.append(f"## 🟣 Anthropic Claude (`{args.claude_model}`)\n\n> ❌ {msg}\n")
    else:
        msg = "SKIPPED: `ANTHROPIC_API_KEY` secret is not configured in GitHub Repo Secrets."
        print(msg)
        summary_sections.append(f"## 🟣 Anthropic Claude\n\n> ⚠️ {msg}\n")

    # 2. Real OpenAI GPT
    oai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if oai_key:
        any_ran = True
        print(f"Calling OpenAI GPT ({args.gpt_model})...")
        try:
            report = call_openai(oai_key, args.gpt_model, GPT_PROMPT, bundle)
            (out_dir / "qa_report_gpt.md").write_text(report, encoding="utf-8")
            summary_sections.append(f"## 🟢 OpenAI GPT (`{args.gpt_model}`)\n\n{report}\n")
            print("GPT QA report generated successfully.")
        except Exception as e:
            had_error = True
            msg = f"ERROR calling OpenAI GPT ({args.gpt_model}): {e}"
            print(msg, file=sys.stderr)
            summary_sections.append(f"## 🟢 OpenAI GPT (`{args.gpt_model}`)\n\n> ❌ {msg}\n")
    else:
        msg = "SKIPPED: `OPENAI_API_KEY` secret is not configured in GitHub Repo Secrets."
        print(msg)
        summary_sections.append(f"## 🟢 OpenAI GPT\n\n> ⚠️ {msg}\n")

    summary_md = "\n---\n\n".join(summary_sections)
    (out_dir / "qa_summary.md").write_text(summary_md, encoding="utf-8")

    gh_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh_summary:
        with open(gh_summary, "a", encoding="utf-8") as f:
            f.write(summary_md + "\n")

    if not any_ran:
        print("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY was set. Add them in Repo Settings -> Secrets -> Actions.", file=sys.stderr)
        sys.exit(2)
    if had_error:
        sys.exit(1)


if __name__ == "__main__":
    main()
