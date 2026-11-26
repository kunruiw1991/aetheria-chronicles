#!/usr/bin/env bash
# ==============================================================================
# local_sub_qa.sh — Subscription-Only Multi-Agent QA Runner (Zero API Keys!)
# Run on your local machine where `claude` (Claude Pro/Max) and `codex`
# (ChatGPT Plus/Pro) CLIs are logged in via your subscription.
# Optionally posts both reports to a GitHub Issue via `gh` so Antigravity can
# read them and auto-fix every bug!
# ==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p qa-reports

echo "=== 1. Running local automated tests ==="
node --test --experimental-test-coverage tests/unit.test.js | tee qa-reports/unit_test.log

if command -v claude >/dev/null 2>&1; then
  echo "=== 2. Running Claude CLI (Subscription) QA ==="
  claude -p "$(cat .qa/claude_prompt.md)" > qa-reports/qa_report_claude.md
  echo "Saved qa-reports/qa_report_claude.md"
else
  echo "SKIP: 'claude' CLI not found. Install Claude Code or paste .qa/claude_prompt.md into claude.ai/code"
fi

if command -v codex >/dev/null 2>&1; then
  echo "=== 3. Running Codex CLI (Subscription) QA ==="
  codex exec "$(cat .qa/gpt_prompt.md)" -o qa-reports/qa_report_gpt.md || \
    codex "$(cat .qa/gpt_prompt.md)" > qa-reports/qa_report_gpt.md
  echo "Saved qa-reports/qa_report_gpt.md"
else
  echo "SKIP: 'codex' CLI not found. Install OpenAI Codex CLI or connect repo in chatgpt.com/codex"
fi

if command -v gh >/dev/null 2>&1 && { [ -s qa-reports/qa_report_claude.md ] || [ -s qa-reports/qa_report_gpt.md ]; }; then
  echo "=== 4. Uploading QA Reports to GitHub Issue for Antigravity ==="
  BODY="# Cross-Model Subscription QA Report ($(git rev-parse --short HEAD))\n\n"
  [ -s qa-reports/qa_report_claude.md ] && BODY+="## Claude QA Report\n\n$(cat qa-reports/qa_report_claude.md)\n\n---\n\n"
  [ -s qa-reports/qa_report_gpt.md ] && BODY+="## GPT / Codex QA Report\n\n$(cat qa-reports/qa_report_gpt.md)\n"
  printf "%b" "$BODY" | gh issue create --title "QA Review: $(git rev-parse --short HEAD)" --body-file -
fi
