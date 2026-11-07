cd /www/wwwroot/glass
PID=$(pgrep -f "node.*index.mjs" | head -1)
TOKEN=$(tr "\0" "\n" < /proc/$PID/environ | grep "^MCP_OPS_TOKEN=" | cut -d= -f2-)
PORT=$(tr "\0" "\n" < /proc/$PID/environ | grep -E "^PORT=" | cut -d= -f2-); PORT=${PORT:-3000}
for CAT in monitor access external cron; do
  echo "===== category=$CAT ====="
  curl -sS -X POST "http://127.0.0.1:$PORT/mcp" \
    -H "Accept: application/json, text/event-stream" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_recent_logs\",\"arguments\":{\"token\":\"$TOKEN\",\"category\":\"$CAT\",\"lines\":25}}}" \
    --max-time 30 2>/dev/null | sed -n "s/^data: //p" | head -3
  echo
done
