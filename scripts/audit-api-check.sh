#!/usr/bin/env bash
# audit-api-check.sh — 用共享会话并行扫一批 admin 接口，校验登录态/形状/CSRF（真并行、零浏览器）。
# 兼容 /audit step-5 的「API 契约校验」，不依赖交互式浏览器，多会话可同时跑。
#
# 用法：
#   bash scripts/audit-api-check.sh /api/admin/stats /api/admin/contents
#   bash scripts/audit-api-check.sh                       # 用内置默认接口清单
#
# 依赖：先跑过 scripts/audit-shared-session.sh（生成 .audit-session）
# 环境变量：PORT(默认3001)
set -euo pipefail

PORT="${PORT:-3001}"
URL="http://localhost:$PORT"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SID=$(cat "$ROOT/.audit-session" 2>/dev/null || true)
[ -n "$SID" ] || { echo "❌ 无共享会话，先跑：bash scripts/audit-shared-session.sh" >&2; exit 1; }

[ $# -eq 0 ] && set -- \
  /api/admin/stats \
  /api/admin/detailed-stats \
  /api/admin/system-info \
  /api/admin/recent-contents \
  /api/admin/recent-comments \
  /api/admin/popular-contents

for p in "$@"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: session=$SID" "$URL$p")
  printf '%-52s %s\n' "$p" "$code"
done
