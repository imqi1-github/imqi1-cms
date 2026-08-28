#!/usr/bin/env bash
# audit-shared-session.sh — 一次登录，发放「可复用的 admin 会话 cookie」给多个并行 /audit 会话注入。
#
# 为什么：
#   后台是「单端登录」（见 server/lib/auth.ts setSession/getUser）：每次登 admin 都会清掉该用户其它
#   session，且 getUser 校验 authCode，后登的会把先登的踢下线。所以多个 /audit 会话各自登录会互踢。
#   方案：统一登录一次，把 session 值缓存到项目根 .audit-session；各并行会话只注入这个值、不重复登录。
#   因为所有会话用同一个 session id + 匹配的 authCode，getUser 全通过 → 真并行不互踢。
#
# 用法：
#   bash scripts/audit-shared-session.sh          # 打印 SID（已有且有效则复用，否则新登录）
#   bash scripts/audit-shared-session.sh --renew  # 强制重新登录（注意：会使其它还在用旧 SID 的会话失效）
#
# 环境变量：PORT(默认3001)、ADMIN_USER(默认admin)、ADMIN_PASS(默认123456)
# 输出：stdout=会话值（供 SID=$(...)，stderr=人读日志）。先播种一次，再并行跑。
set -euo pipefail

PORT="${PORT:-3000}"
USER="${ADMIN_USER:-admin}"
PASS="${ADMIN_PASS:-123456}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SID_FILE="$ROOT/.audit-session"
COOKIE_JAR="$ROOT/.audit-cookies"
URL="http://localhost:$PORT"

get_cached_sid() { [ -f "$SID_FILE" ] && cat "$SID_FILE" 2>/dev/null || true; }

# 用受保护接口探活：能用 session cookie 打到 200 才算有效
is_valid() {
  [ -n "$1" ] && curl -s -o /dev/null -w '%{http_code}' -H "Cookie: session=$1" "$URL/api/admin/stats" | grep -q '^200$'
}

do_login() {
  rm -f "$COOKIE_JAR"
  local token resp sid
  token=$(curl -s -c "$COOKIE_JAR" "$URL/api/csrf/token" | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p')
  [ -n "$token" ] || { echo "❌ 取 CSRF token 失败（dev server 起了吗？curl $URL/api/csrf/token）" >&2; exit 1; }
  resp=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USER\",\"password\":\"$PASS\",\"csrfToken\":\"$token\"}")
  if ! echo "$resp" | grep -q '"success": *true'; then
    echo "❌ 登录失败：$resp" >&2
    exit 1
  fi
  sid=$(awk '/\tsession\t/{print $NF}' "$COOKIE_JAR")
  [ -n "$sid" ] || { echo "❌ 未取到 session cookie" >&2; exit 1; }
  printf '%s' "$sid" > "$SID_FILE"
  echo "$sid"
}

force_renew=0
[ "${1:-}" = "--renew" ] && force_renew=1

cached=$(get_cached_sid)
if [ "$force_renew" -eq 0 ] && is_valid "$cached"; then
  echo "$cached"
  echo "audit: 复用会话 (SID=$cached)" >&2
  exit 0
fi
[ "$force_renew" -eq 0 ] && [ -n "$cached" ] && echo "audit: 缓存会话已失效，重新登录" >&2

sid=$(do_login)
echo "audit: 已登录 (SID=$sid)" >&2
